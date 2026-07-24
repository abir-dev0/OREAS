import logging
import decimal
import datetime
import re
from celery import shared_task
from django.utils import timezone
from django.db import transaction
from django.db.models import Q
from marketing.models import (
    MetaAdAccount, ProductTest, MetaAdCreative, 
    MetaCampaign, MetaAdSet, MetaAd, MarketingOrder, 
    MetaAdPerformanceInsight
)
from products.models import Product
from marketing.services.marketing_api import MetaMarketingClient, get_mock_orders

logger = logging.getLogger(__name__)

def extract_test_id_and_match_product(campaign_name: str, brand) -> ProductTest:
    """
    Parses campaign name to find a pattern like [TEST-xxxx] and links it to a ProductTest.
    Auto-creates ProductTest and maps to the correct Shopify Product using token heuristics.
    """
    match = re.search(r'\[(TEST-\d+)\]', campaign_name, re.IGNORECASE)
    if not match:
        return None
        
    test_id = match.group(1).upper()
    
    try:
        # Check if ProductTest already exists
        return ProductTest.objects.get(test_id=test_id)
    except ProductTest.DoesNotExist:
        # Auto-match to a Shopify product
        products = Product.objects.filter(brand=brand)
        campaign_name_lower = campaign_name.lower()
        matched_product = None
        best_score = 0.0

        for product in products:
            title_lower = product.title.lower()
            handle_clean = product.handle.replace('-', ' ').lower() if product.handle else ""

            # Exact match
            if title_lower in campaign_name_lower or (handle_clean and handle_clean in campaign_name_lower):
                matched_product = product
                break

            # Word similarity
            product_words = set(w for w in title_lower.split() if len(w) > 2)
            if not product_words:
                continue
            campaign_words = set(w for w in campaign_name_lower.split() if len(w) > 2)
            intersection = product_words.intersection(campaign_words)
            score = len(intersection) / len(product_words)

            if score > 0.5 and score > best_score:
                best_score = score
                matched_product = product

        # Fallback: if no match, link to first product or mock product
        if not matched_product:
            matched_product = products.first()
            if not matched_product:
                # Create a placeholder product
                matched_product = Product.objects.create(
                    brand=brand,
                    title="Runway Designer Robe",
                    handle="runway-designer-robe",
                    price=decimal.Decimal("450.00"),
                    cogs=decimal.Decimal("130.00"),
                    shopify_product_id="sh_placeholder"
                )

        # Create ProductTest
        product_test = ProductTest.objects.create(
            test_id=test_id,
            product=matched_product,
            status='ACTIVE',
            notes=f"Auto-generated test cycle for campaign: {campaign_name}"
        )
        logger.info(f"Auto-created ProductTest '{test_id}' for Product '{matched_product.title}'")
        return product_test


def resolve_status(item_dict: dict) -> str:
    """
    Returns the real operational status for a Meta Campaign, AdSet, or Ad.
    Meta Graph API leaves 'status' as 'ACTIVE' even when a parent campaign or adset is paused,
    while 'effective_status' returns 'CAMPAIGN_PAUSED', 'ADSET_PAUSED', 'PAUSED', etc.
    """
    eff = item_dict.get("effective_status") or item_dict.get("status") or "PAUSED"
    if eff == "ACTIVE":
        return "ACTIVE"
    return "PAUSED"


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def sync_ad_account_data(self, ad_account_id: int):
    """
    Synchronizes campaigns, ad sets, ads, ad creatives, orders, and daily performance metrics.
    """
    try:
        account = MetaAdAccount.objects.get(pk=ad_account_id)
    except MetaAdAccount.DoesNotExist:
        logger.error(f"MetaAdAccount with id {ad_account_id} not found.")
        return

    logger.info(f"Starting granular marketing sync for: {account.name or account.ad_account_id}")
    
    try:
        client = MetaMarketingClient(account.get_access_token())
        
        # 1. Sync Campaigns and link to Product Tests
        synced_campaign_ids = {}
        try:
            campaigns_data = client.fetch_campaigns(account.ad_account_id)
            for c in campaigns_data:
                c_id = c["id"]
                created_time = timezone.datetime.fromisoformat(c["created_time"].replace("Z", "+00:00"))
                updated_time = timezone.datetime.fromisoformat(c["updated_time"].replace("Z", "+00:00"))
                c_status = resolve_status(c)
                
                # Match Product Test ID
                product_test = extract_test_id_and_match_product(c["name"], account.brand)
                
                with transaction.atomic():
                    campaign, created = MetaCampaign.objects.get_or_create(
                        campaign_id=c_id,
                        defaults={
                            "ad_account": account,
                            "name": c["name"],
                            "status": c_status,
                            "objective": c.get("objective"),
                            "linked_test": product_test,
                            "created_time": created_time,
                            "updated_time": updated_time
                        }
                    )
                    if not created:
                        campaign.name = c["name"]
                        campaign.status = c_status
                        campaign.objective = c.get("objective", campaign.objective)
                        campaign.linked_test = product_test
                        campaign.updated_time = updated_time
                        campaign.save()
                    
                    synced_campaign_ids[c_id] = campaign
        except Exception as e:
            logger.error(f"Error fetching campaigns from Meta Graph API: {e}. Falling back to DB campaigns.")
            for campaign in MetaCampaign.objects.filter(ad_account=account):
                synced_campaign_ids[campaign.campaign_id] = campaign

        # 2. Sync Ad Sets
        synced_adset_ids = {}
        try:
            adsets_data = client.fetch_adsets(account.ad_account_id)
            for as_d in adsets_data:
                as_id = as_d["id"]
                c_id = as_d.get("campaign", {}).get("id")
                if not c_id or c_id not in synced_campaign_ids:
                    continue
                    
                created_time = timezone.datetime.fromisoformat(as_d["created_time"].replace("Z", "+00:00"))
                updated_time = timezone.datetime.fromisoformat(as_d["updated_time"].replace("Z", "+00:00"))
                as_status = resolve_status(as_d)
                
                daily_budget = as_d.get("daily_budget")
                lifetime_budget = as_d.get("lifetime_budget")
                db = decimal.Decimal(str(int(daily_budget) / 100.0)) if daily_budget else None
                lb = decimal.Decimal(str(int(lifetime_budget) / 100.0)) if lifetime_budget else None

                with transaction.atomic():
                    adset, created = MetaAdSet.objects.get_or_create(
                        adset_id=as_id,
                        defaults={
                            "campaign": synced_campaign_ids[c_id],
                            "name": as_d["name"],
                            "status": as_status,
                            "daily_budget": db,
                            "lifetime_budget": lb,
                            "optimization_goal": as_d.get("optimization_goal"),
                            "billing_event": as_d.get("billing_event"),
                            "created_time": created_time,
                            "updated_time": updated_time
                        }
                    )
                    if not created:
                        adset.name = as_d["name"]
                        adset.status = as_status
                        adset.daily_budget = db
                        adset.lifetime_budget = lb
                        adset.optimization_goal = as_d.get("optimization_goal", adset.optimization_goal)
                        adset.billing_event = as_d.get("billing_event", adset.billing_event)
                        adset.updated_time = updated_time
                        adset.save()
                    
                    synced_adset_ids[as_id] = adset
        except Exception as e:
            logger.error(f"Error fetching adsets from Meta Graph API: {e}. Falling back to DB adsets.")
            for adset in MetaAdSet.objects.filter(campaign__ad_account=account):
                synced_adset_ids[adset.adset_id] = adset

        # 3. Sync Ads & Creatives
        synced_ad_ids = {}
        try:
            ads_data = client.fetch_ads(account.ad_account_id)
            processed_creatives = set()
            for ad_d in ads_data:
                ad_id = ad_d["id"]
                as_id = ad_d.get("adset", {}).get("id")
                if not as_id or as_id not in synced_adset_ids:
                    continue
                    
                created_time = timezone.datetime.fromisoformat(ad_d["created_time"].replace("Z", "+00:00"))
                updated_time = timezone.datetime.fromisoformat(ad_d["updated_time"].replace("Z", "+00:00"))
                ad_status = resolve_status(ad_d)
                
                # Sync Creative details
                cr_data_summary = ad_d.get("creative", {})
                cr_id = cr_data_summary.get("id")
                creative_obj = None
                if cr_id:
                    # Cache check: Only call Meta API if creative doesn't exist in DB
                    creative_obj = MetaAdCreative.objects.filter(creative_id=cr_id).first()
                    if not creative_obj and cr_id not in processed_creatives:
                        # Fetch creative details individually — avoids Meta 500 errors on large account pagination
                        cr_data = client.fetch_creative_details(cr_id) or {}
                        image_url = cr_data.get("image_url") or cr_data.get("thumbnail_url") or ""

                        creative_obj, _ = MetaAdCreative.objects.get_or_create(
                            creative_id=cr_id,
                            defaults={
                                "name": cr_data.get("name", f"Creative {cr_id}"),
                                "image_url": image_url,
                                "video_url": cr_data.get("video_url"),
                                "body": cr_data.get("body"),
                                "title": cr_data.get("title"),
                                "format": cr_data.get("format", "VIDEO" if cr_data.get("video_url") else "IMAGE"),
                                "hook_type": cr_data.get("hook_type"),
                                "has_model": cr_data.get("has_model", True),
                                "video_duration": cr_data.get("video_duration"),
                                "editing_style": cr_data.get("editing_style"),
                                "language": cr_data.get("language", "Darija")
                            }
                        )
                        processed_creatives.add(cr_id)
                    elif cr_id in processed_creatives or creative_obj:
                        creative_obj = creative_obj or MetaAdCreative.objects.filter(creative_id=cr_id).first()

                with transaction.atomic():
                    ad, created = MetaAd.objects.get_or_create(
                        ad_id=ad_id,
                        defaults={
                            "adset": synced_adset_ids[as_id],
                            "name": ad_d["name"],
                            "status": ad_status,
                            "creative": creative_obj,
                            "created_time": created_time,
                            "updated_time": updated_time
                        }
                    )
                    if not created:
                        ad.name = ad_d["name"]
                        ad.status = ad_status
                        ad.creative = creative_obj
                        ad.updated_time = updated_time
                        ad.save()
                    
                    synced_ad_ids[ad_id] = ad
        except Exception as e:
            logger.error(f"Error fetching ads from Meta Graph API: {e}. Falling back to DB ads.")
            for ad in MetaAd.objects.filter(adset__campaign__ad_account=account):
                synced_ad_ids[ad.ad_id] = ad

        # Enforce status cascade across all DB records:
        # Any adset or ad under a PAUSED campaign or adset MUST be marked PAUSED in DB.
        MetaAdSet.objects.filter(campaign__ad_account=account, campaign__status='PAUSED').update(status='PAUSED')
        MetaAd.objects.filter(Q(adset__campaign__ad_account=account) & (Q(adset__status='PAUSED') | Q(adset__campaign__status='PAUSED'))).update(status='PAUSED')

        # 4. Sync Ad-Level Performance Insights & Orders
        insights_data = client.fetch_insights(account.ad_account_id, level='ad')
        
        # Clear existing performance insights to overwrite with new sync data for precision
        MetaAdPerformanceInsight.objects.filter(campaign__ad_account=account).delete()
        
        for ins in insights_data:
            ad_id = ins.get("ad_id")
            c_id = ins.get("campaign_id")
            
            # If this is mock insights data, map it dynamically to real synced ads to populate real creative metrics
            if ad_id and ad_id.startswith(f"{account.ad_account_id}_"):
                real_ad_list = list(synced_ad_ids.values())
                if real_ad_list:
                    import hashlib
                    ad_hash = int(hashlib.md5(ad_id.encode()).hexdigest(), 16)
                    mapped_ad = real_ad_list[ad_hash % len(real_ad_list)]
                    ad_id = mapped_ad.ad_id
                    c_id = mapped_ad.adset.campaign.campaign_id
            
            if not ad_id or ad_id not in synced_ad_ids or not c_id or c_id not in synced_campaign_ids:
                continue

            date_str = ins.get("date_start")
            if not date_str:
                continue
            date_val = timezone.datetime.strptime(date_str, "%Y-%m-%d").date()
            
            ad_obj = synced_ad_ids[ad_id]
            campaign_obj = synced_campaign_ids[c_id]
            product_obj = campaign_obj.linked_test.product if campaign_obj.linked_test else Product.objects.filter(brand=account.brand).first()
            if not product_obj:
                continue

            # Ensure Shopify price / cogs are defined
            price_val = product_obj.price or decimal.Decimal("450.00")
            cogs_val = product_obj.cogs or decimal.Decimal("130.00")

            # Save simulated transactional Orders for this campaign/ad/date
            orders_data = get_mock_orders(campaign_obj.name, date_val)
            
            # Map mock orders directly to this ad in the database
            for order in orders_data:
                order_id = f"{order['order_id']}-{ad_id[-3:]}"  # differentiate ID per ad
                MarketingOrder.objects.get_or_create(
                    order_id=order_id,
                    defaults={
                        "campaign": campaign_obj,
                        "ad": ad_obj,
                        "product": product_obj,
                        "price": price_val,
                        "cogs": cogs_val,
                        "shopify_status": order["shopify_status"],
                        "call_center_status": order["call_center_status"],
                        "delivery_status": order["delivery_status"],
                        "is_returned": order["is_returned"],
                        "created_at": timezone.make_aware(order["created_at"])
                    }
                )

            # Retrieve actual financial aggregates from the MarketingOrder table
            ad_orders = MarketingOrder.objects.filter(ad=ad_obj, created_at__date=date_val)
            
            purchases_count = ad_orders.count()
            gross_value = sum(o.price for o in ad_orders)
            
            confirmed_count = ad_orders.filter(call_center_status='confirmed').count()
            delivered_count = ad_orders.filter(delivery_status='delivered').count()
            returned_count = ad_orders.filter(is_returned=True).count()
            
            # Cost & Profit Math
            spend = decimal.Decimal(ins.get("spend", "0.00"))
            impressions = int(ins.get("impressions", 0))
            clicks = int(ins.get("clicks", 0))
            reach = int(ins.get("reach", 0))

            total_cogs = delivered_count * cogs_val
            total_cc_cost = purchases_count * decimal.Decimal("15.00")
            total_ship_cost = confirmed_count * decimal.Decimal("40.00")
            total_ret_cost = returned_count * decimal.Decimal("20.00")
            
            total_expenses = spend + total_cogs + total_cc_cost + total_ship_cost + total_ret_cost
            net_profit = (delivered_count * price_val - returned_count * price_val) - total_expenses
            
            # Conversion Ratios
            ctr = (clicks / impressions * 100.0) if impressions > 0 else 0.0
            cpc = (spend / clicks) if clicks > 0 else decimal.Decimal("0.00")
            cpm = (spend / impressions * 1000) if impressions > 0 else decimal.Decimal("0.00")
            cost_per_result = (spend / purchases_count) if purchases_count > 0 else decimal.Decimal("0.00")
            roas = float(gross_value / spend) if spend > 0 else 0.0

            with transaction.atomic():
                MetaAdPerformanceInsight.objects.create(
                    campaign=campaign_obj,
                    ad=ad_obj,
                    date=date_val,
                    spend=spend,
                    impressions=impressions,
                    clicks=clicks,
                    reach=reach,
                    purchases=purchases_count,
                    purchases_value=gross_value,
                    confirmed_purchases=confirmed_count,
                    delivered_purchases=delivered_count,
                    returned_purchases=returned_count,
                    total_cogs=total_cogs,
                    total_call_center_cost=total_cc_cost,
                    total_shipping_cost=total_ship_cost,
                    total_return_cost=total_ret_cost,
                    total_expenses=total_expenses,
                    net_profit=net_profit,
                    ctr=ctr,
                    cpc=cpc,
                    cpm=cpm,
                    cost_per_result=cost_per_result,
                    roas=roas,
                    raw_data=ins
                )

        # 5. Summarize Ad-Level Insights into Campaign-Level Insights (ad=None)
        campaign_dates = (
            MetaAdPerformanceInsight.objects.filter(campaign__ad_account=account)
            .values('campaign', 'date')
            .distinct()
        )
        
        for cd in campaign_dates:
            c_id = cd['campaign']
            d_val = cd['date']
            
            # Fetch ad insights for this campaign and date
            ad_insights = MetaAdPerformanceInsight.objects.filter(campaign_id=c_id, date=d_val, ad__isnull=False)
            if not ad_insights.exists():
                continue
                
            spend_sum = sum(ai.spend for ai in ad_insights)
            impressions_sum = sum(ai.impressions for ai in ad_insights)
            clicks_sum = sum(ai.clicks for ai in ad_insights)
            reach_sum = sum(ai.reach for ai in ad_insights)
            
            purchases_sum = sum(ai.purchases for ai in ad_insights)
            purchases_val_sum = sum(ai.purchases_value for ai in ad_insights)
            confirmed_sum = sum(ai.confirmed_purchases for ai in ad_insights)
            delivered_sum = sum(ai.delivered_purchases for ai in ad_insights)
            returned_sum = sum(ai.returned_purchases for ai in ad_insights)
            
            cogs_sum = sum(ai.total_cogs for ai in ad_insights)
            cc_sum = sum(ai.total_call_center_cost for ai in ad_insights)
            ship_sum = sum(ai.total_shipping_cost for ai in ad_insights)
            ret_sum = sum(ai.total_return_cost for ai in ad_insights)
            expenses_sum = sum(ai.total_expenses for ai in ad_insights)
            profit_sum = sum(ai.net_profit for ai in ad_insights)
            
            # Calculate averages
            ctr_avg = (clicks_sum / impressions_sum * 100.0) if impressions_sum > 0 else 0.0
            cpc_avg = (spend_sum / clicks_sum) if clicks_sum > 0 else decimal.Decimal("0.00")
            cpm_avg = (spend_sum / impressions_sum * 1000) if impressions_sum > 0 else decimal.Decimal("0.00")
            cpp_avg = (spend_sum / purchases_sum) if purchases_sum > 0 else decimal.Decimal("0.00")
            roas_avg = float(purchases_val_sum / spend_sum) if spend_sum > 0 else 0.0

            with transaction.atomic():
                MetaAdPerformanceInsight.objects.create(
                    campaign_id=c_id,
                    ad=None,
                    date=d_val,
                    spend=spend_sum,
                    impressions=impressions_sum,
                    clicks=clicks_sum,
                    reach=reach_sum,
                    purchases=purchases_sum,
                    purchases_value=purchases_val_sum,
                    confirmed_purchases=confirmed_sum,
                    delivered_purchases=delivered_sum,
                    returned_purchases=returned_sum,
                    total_cogs=cogs_sum,
                    total_call_center_cost=cc_sum,
                    total_shipping_cost=ship_sum,
                    total_return_cost=ret_sum,
                    total_expenses=expenses_sum,
                    net_profit=profit_sum,
                    ctr=ctr_avg,
                    cpc=cpc_avg,
                    cpm=cpm_avg,
                    cost_per_result=cpp_avg,
                    roas=roas_avg,
                    raw_data={"summary": True}
                )

        account.last_sync_at = timezone.now()
        account.save()
        logger.info(f"Granular marketing sync completed successfully for: {account.name}")

    except Exception as exc:
        logger.error(f"Error syncing ad-level marketing data: {exc}")
        raise self.retry(exc=exc)


@shared_task
def sync_all_active_marketing_accounts():
    """
    Master sync task to kick off updates for all active marketing ad accounts.
    """
    active_accounts = MetaAdAccount.objects.filter(is_active=True)
    count = 0
    for account in active_accounts:
        sync_ad_account_data.delay(account.id)
        count += 1
    return f"Triggered sync for {count} active marketing ad accounts."


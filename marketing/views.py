from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from django.db.models import Sum, Avg, F
from django.utils import timezone
import datetime
from decimal import Decimal

from core.models import Brand
from products.models import Product
from marketing.models import (
    MetaAdAccount, ProductTest, MetaAdCreative, 
    MetaCampaign, MetaAdSet, MetaAd, MetaAdPerformanceInsight, MarketingOrder
)
from marketing.serializers import (
    MetaAdAccountSerializer, ProductTestSerializer, MetaAdCreativeSerializer,
    MetaCampaignSerializer, MetaAdSetSerializer, MetaAdSerializer,
    MetaAdPerformanceInsightSerializer, MarketingOrderSerializer
)
from marketing.tasks import sync_ad_account_data


class MarketingOrderViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = MarketingOrderSerializer

    def get_queryset(self):
        qs = MarketingOrder.objects.select_related('product').order_by('-created_at')
        shopify_status = self.request.query_params.get('shopify_status')
        delivery_status = self.request.query_params.get('delivery_status')
        call_center_status = self.request.query_params.get('call_center_status')
        search = self.request.query_params.get('search')
        if shopify_status:
            qs = qs.filter(shopify_status=shopify_status)
        if delivery_status:
            qs = qs.filter(delivery_status=delivery_status)
        if call_center_status:
            qs = qs.filter(call_center_status=call_center_status)
        if search:
            qs = qs.filter(order_id__icontains=search) | qs.filter(product__title__icontains=search)
        return qs



class ProductTestViewSet(viewsets.ModelViewSet):
    queryset = ProductTest.objects.all().order_by('-created_at')
    serializer_class = ProductTestSerializer


class MetaAdAccountViewSet(viewsets.ModelViewSet):
    queryset = MetaAdAccount.objects.all()
    serializer_class = MetaAdAccountSerializer

    @action(detail=True, methods=['post'], url_path='sync')
    def sync_data(self, request, pk=None):
        account = get_object_or_404(MetaAdAccount, pk=pk)
        sync_ad_account_data.delay(account.id)
        return Response({"status": "Marketing synchronization task scheduled in background."}, status=status.HTTP_202_ACCEPTED)


class MetaCampaignViewSet(viewsets.ModelViewSet):
    queryset = MetaCampaign.objects.all().order_by('-created_time')
    serializer_class = MetaCampaignSerializer

    @action(detail=True, methods=['post'], url_path='link-test')
    def link_test(self, request, pk=None):
        campaign = get_object_or_404(MetaCampaign, pk=pk)
        test_id = request.data.get('test_id')
        if not test_id:
            return Response({"error": "test_id is required."}, status=status.HTTP_400_BAD_REQUEST)
        
        product_test = get_object_or_404(ProductTest, pk=test_id)
        campaign.linked_test = product_test
        campaign.save()
        return Response({
            "message": f"Campaign successfully linked to Product Test '{product_test.test_id}'.",
            "campaign": MetaCampaignSerializer(campaign).data
        })

    @action(detail=True, methods=['post'], url_path='unlink-test')
    def unlink_test(self, request, pk=None):
        campaign = get_object_or_404(MetaCampaign, pk=pk)
        campaign.linked_test = None
        campaign.save()
        return Response({
            "message": "Campaign successfully unlinked from Product Test.",
            "campaign": MetaCampaignSerializer(campaign).data
        })


class MetaAdSetViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = MetaAdSet.objects.all().order_by('-created_time')
    serializer_class = MetaAdSetSerializer


class MetaAdViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = MetaAd.objects.all().order_by('-created_time')
    serializer_class = MetaAdSerializer


class MetaAdPerformanceInsightViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = MetaAdPerformanceInsight.objects.all().order_by('-date')
    serializer_class = MetaAdPerformanceInsightSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        campaign_id = self.request.query_params.get('campaign_id')
        ad_id = self.request.query_params.get('ad_id')
        
        # Default to campaign-level summaries (ad is null) if no specific ad_id is requested,
        # unless requesting creative-level analysis.
        if ad_id:
            queryset = queryset.filter(ad__id=ad_id)
        elif campaign_id:
            queryset = queryset.filter(campaign__id=campaign_id)
            
        return queryset

    @action(detail=False, methods=['get'], url_path='summary')
    def get_summary_kpis(self, request):
        """
        Aggregate full-funnel performance metrics across all campaigns (where ad is null).
        """
        # Ensure we have mock accounts
        if not MetaAdAccount.objects.exists():
            brand, _ = Brand.objects.get_or_create(name="OREAS", slug="oreas")
            mock_account = MetaAdAccount.objects.create(
                brand=brand,
                ad_account_id="mock_ad_account_1",
                name="OREAS Premium Marketing Account"
            )
            # Run mock sync (inline)
            sync_ad_account_data(mock_account.id)

        # Aggregate campaign-level insights (where ad is null)
        aggregates = MetaAdPerformanceInsight.objects.filter(ad__isnull=True).aggregate(
            total_spend=Sum('spend'),
            total_impressions=Sum('impressions'),
            total_clicks=Sum('clicks'),
            total_reach=Sum('reach'),
            total_purchases=Sum('purchases'),
            total_purchases_val=Sum('purchases_value'),
            total_confirmed=Sum('confirmed_purchases'),
            total_delivered=Sum('delivered_purchases'),
            total_returned=Sum('returned_purchases'),
            cogs=Sum('total_cogs'),
            cc_cost=Sum('total_call_center_cost'),
            ship_cost=Sum('total_shipping_cost'),
            ret_cost=Sum('total_return_cost'),
            expenses=Sum('total_expenses'),
            profit=Sum('net_profit')
        )

        total_spend = aggregates['total_spend'] or Decimal('0.00')
        total_clicks = aggregates['total_clicks'] or 0
        total_impressions = aggregates['total_impressions'] or 0
        total_purchases = aggregates['total_purchases'] or 0
        total_purchases_val = aggregates['total_purchases_val'] or Decimal('0.00')
        total_confirmed = aggregates['total_confirmed'] or 0
        total_delivered = aggregates['total_delivered'] or 0
        total_returned = aggregates['total_returned'] or 0
        total_expenses = aggregates['expenses'] or Decimal('0.00')
        net_profit = aggregates['profit'] or Decimal('0.00')

        # Funnel metrics
        ctr = (total_clicks / total_impressions * 100.0) if total_impressions > 0 else 0.0
        cpc = (total_spend / total_clicks) if total_clicks > 0 else Decimal('0.00')
        cpm = (total_spend / total_impressions * 1000) if total_impressions > 0 else Decimal('0.00')
        cost_per_result = (total_spend / total_purchases) if total_purchases > 0 else Decimal('0.00')
        roas = float(total_purchases_val / total_spend) if total_spend > 0 else 0.0
        net_roas = float((total_delivered * Decimal("350.00")) / total_spend) if total_spend > 0 else 0.0 # fallback default price $350

        # Ratios
        cancellation_rate = ((total_purchases - total_confirmed) / total_purchases * 100.0) if total_purchases > 0 else 0.0
        delivery_failed_rate = ((total_confirmed - total_delivered) / total_confirmed * 100.0) if total_confirmed > 0 else 0.0
        return_rate = (total_returned / total_delivered * 100.0) if total_delivered > 0 else 0.0

        # Retrieve a daily timeline for trend chart (last 30 days)
        daily_insights = (
            MetaAdPerformanceInsight.objects.filter(ad__isnull=True)
            .values('date')
            .annotate(
                spend=Sum('spend'),
                purchases=Sum('purchases'),
                roas=Avg('roas'),
                net_profit=Sum('net_profit')
            )
            .order_by('date')[:30]
        )

        return Response({
            "kpis": {
                "total_spend": float(total_spend),
                "total_impressions": total_impressions,
                "total_clicks": total_clicks,
                "total_reach": aggregates['total_reach'] or 0,
                "total_purchases": total_purchases,
                "total_purchases_value": float(total_purchases_val),
                "confirmed_purchases": total_confirmed,
                "delivered_purchases": total_delivered,
                "returned_purchases": total_returned,
                "total_expenses": float(total_expenses),
                "net_profit": float(net_profit),
                "ctr": round(ctr, 2),
                "cpc": float(cpc),
                "cpm": float(cpm),
                "roas": round(roas, 2),
                "net_roas": round(net_roas, 2),
                "cost_per_result": float(cost_per_result),
                "cancellation_rate": round(cancellation_rate, 2),
                "delivery_failed_rate": round(delivery_failed_rate, 2),
                "return_rate": round(return_rate, 2)
            },
            "timeline": list(daily_insights)
        })

    @action(detail=False, methods=['get'], url_path='predictions')
    def get_ai_predictions(self, request):
        """
        AI Predictive Recommendation Engine.
        Analyzes permanent ProductTest full-funnel histories and Ad Creatives.
        Optimized with bulk aggregations to avoid N+1 query overhead.
        """
        tests = ProductTest.objects.select_related('product').prefetch_related('campaigns').all()

        # Pre-aggregate all campaign performance insights in a single query
        campaign_insights = MetaAdPerformanceInsight.objects.filter(ad__isnull=True).values('campaign_id').annotate(
            spend=Sum('spend'),
            purchases=Sum('purchases'),
            confirmed=Sum('confirmed_purchases'),
            delivered=Sum('delivered_purchases'),
            returned=Sum('returned_purchases'),
            expenses=Sum('total_expenses'),
            net_profit=Sum('net_profit'),
            gross_value=Sum('purchases_value')
        )
        insights_by_campaign = {ci['campaign_id']: ci for ci in campaign_insights}

        test_recommendations = []

        for test in tests:
            test_campaign_ids = [c.id for c in test.campaigns.all()]
            if not test_campaign_ids:
                continue

            # Aggregate stats across all campaigns for this test in memory
            spend = sum(float(insights_by_campaign[cid]['spend'] or 0) for cid in test_campaign_ids if cid in insights_by_campaign)
            purchases = sum(insights_by_campaign[cid]['purchases'] or 0 for cid in test_campaign_ids if cid in insights_by_campaign)
            confirmed = sum(insights_by_campaign[cid]['confirmed'] or 0 for cid in test_campaign_ids if cid in insights_by_campaign)
            delivered = sum(insights_by_campaign[cid]['delivered'] or 0 for cid in test_campaign_ids if cid in insights_by_campaign)
            returned = sum(insights_by_campaign[cid]['returned'] or 0 for cid in test_campaign_ids if cid in insights_by_campaign)
            expenses = sum(float(insights_by_campaign[cid]['expenses'] or 0) for cid in test_campaign_ids if cid in insights_by_campaign)
            net_profit = sum(float(insights_by_campaign[cid]['net_profit'] or 0) for cid in test_campaign_ids if cid in insights_by_campaign)
            gross_value = sum(float(insights_by_campaign[cid]['gross_value'] or 0) for cid in test_campaign_ids if cid in insights_by_campaign)

            if spend == 0 and purchases == 0:
                continue

            # Ratios
            cancellation_rate = ((purchases - confirmed) / purchases * 100.0) if purchases > 0 else 0.0
            return_rate = (returned / delivered * 100.0) if delivered > 0 else 0.0
            real_roas = (gross_value * (delivered / purchases)) / spend if spend > 0 and purchases > 0 else 0.0
            raw_roas = gross_value / spend if spend > 0 else 0.0

            status = "STABLE"
            rec_action = "Maintain budget."
            predicted_roas_boost = 0.0
            details = ""
            alert_type = None

            # High Call Center Cancellation Alert
            if cancellation_rate > 40.0:
                status = "CREATIVE_OVERHAUL"
                rec_action = "Halt campaign immediately. Restructure landing page & require phone verification."
                alert_type = "cancellation_bleed"
                details = f"Warning: Extremely high Call Center cancellation rate ({cancellation_rate:.1f}%). Despite checkout volume, cash is bleeding. Real Net Profit: ${net_profit:.2f}."
            elif net_profit > 500.0 and real_roas >= 2.5:
                status = "SCALE"
                rec_action = "Increase test campaign budget by 30%. Launch lookalike scaling."
                details = f"Product test is highly profitable! Net Profit: ${net_profit:.2f}. Low return rate ({return_rate:.1f}%) justifies scaling budget."
            elif net_profit < 0.0:
                status = "HALT"
                rec_action = "Pause ads. Unit cost or shipping logistics eating entire margins."
                alert_type = "unprofitable"
                details = f"Loss-making product test (Net Profit: ${net_profit:.2f}). Expenses (${expenses:.2f}) exceed gross delivered revenue."
            else:
                status = "OPTIMIZE"
                rec_action = "Refresh creative video hook. Exclude recent buyers."
                details = f"Moderate performance. Net Profit: ${net_profit:.2f}. ROAS is healthy but scale is limited."

            test_recommendations.append({
                "test_id": test.test_id,
                "product_title": test.product.title if test.product else "Produit Inconnu",
                "shopify_product_id": test.product.shopify_product_id if test.product else "",
                "historical_metrics": {
                    "total_spend": spend,
                    "total_purchases": purchases,
                    "delivered_purchases": delivered,
                    "cancellation_rate": round(cancellation_rate, 2),
                    "return_rate": round(return_rate, 2),
                    "raw_roas": round(raw_roas, 2),
                    "real_roas": round(real_roas, 2),
                    "expenses": expenses,
                    "net_profit": net_profit
                },
                "prediction": {
                    "recommendation_status": status,
                    "recommended_action": rec_action,
                    "predicted_roas_boost_percentage": predicted_roas_boost,
                    "alert_type": alert_type,
                    "details": details
                }
            })

        # --- CREATIVE ANALYSIS AND VERSIONING PREDICTIONS ---
        creatives = MetaAdCreative.objects.all()

        # Batch aggregate all creative insights in 1 query
        creative_insights = MetaAdPerformanceInsight.objects.filter(ad__creative__isnull=False).values('ad__creative_id').annotate(
            total_spend=Sum('spend'),
            total_clicks=Sum('clicks'),
            total_impressions=Sum('impressions'),
            total_purchases=Sum('purchases'),
            total_delivered=Sum('delivered_purchases'),
            total_profit=Sum('net_profit'),
            total_gross_val=Sum('purchases_value')
        )
        creative_stats = {ci['ad__creative_id']: ci for ci in creative_insights}

        creative_rankings = []

        for creative in creatives:
            c_info = creative_stats.get(creative.id)
            if c_info:
                total_spend = float(c_info['total_spend'] or 0)
                total_clicks = c_info['total_clicks'] or 0
                total_impressions = c_info['total_impressions'] or 0
                total_purchases = c_info['total_purchases'] or 0
                total_delivered = c_info['total_delivered'] or 0
                total_profit = float(c_info['total_profit'] or 0)
                total_gross_val = float(c_info['total_gross_val'] or 0)

                ctr = (total_clicks / total_impressions * 100.0) if total_impressions > 0 else 0.0
                roas = total_gross_val / total_spend if total_spend > 0 else 0.0
                cpc = total_spend / total_clicks if total_clicks > 0 else 0.0
            else:
                total_spend = 0.0
                total_clicks = 0
                total_impressions = 0
                total_purchases = 0
                total_delivered = 0
                total_profit = 0.0
                ctr = 0.0
                roas = 0.0
                cpc = 0.0

            creative_rankings.append({
                "creative_id": creative.creative_id,
                "name": creative.name,
                "format": creative.format,
                "hook_type": creative.hook_type,
                "has_model": creative.has_model,
                "video_duration": creative.video_duration,
                "editing_style": creative.editing_style,
                "image_url": creative.image_url,
                "metrics": {
                    "total_spend": total_spend,
                    "ctr": round(ctr, 2),
                    "cpc": round(cpc, 2),
                    "purchases": total_purchases,
                    "delivered": total_delivered,
                    "roas": round(roas, 2),
                    "net_profit": total_profit
                }
            })

        # Sort creative rankings by Net Profit descending
        creative_rankings.sort(key=lambda x: x["metrics"]["net_profit"], reverse=True)

        return Response({
            "generated_at": timezone.now().isoformat(),
            "test_recommendations": test_recommendations,
            "creative_rankings": creative_rankings
        })

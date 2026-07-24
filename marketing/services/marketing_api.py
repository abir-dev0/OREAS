import logging
import requests
import random
import datetime
from typing import List, Dict, Any

logger = logging.getLogger(__name__)

GRAPH_API_VERSION = "v18.0"
BASE_URL = f"https://graph.facebook.com/{GRAPH_API_VERSION}"

class MetaMarketingClient:
    def __init__(self, access_token: str):
        self.access_token = access_token
        self.session = requests.Session()
        self.session.headers.update({"Authorization": f"Bearer {access_token}"})

    def get(self, path: str, params: Dict[str, Any] = None) -> Dict[str, Any]:
        url = f"{BASE_URL}/{path}"
        try:
            response = self.session.get(url, params=params)
            response.raise_for_status()
            return response.json()
        except requests.RequestException as e:
            logger.error(f"Meta Marketing API request error: {e}")
            if 'response' in locals() and response is not None:
                logger.error(f"Response: {response.text}")
            raise e

    def get_ad_account_name(self, ad_account_id: str) -> str:
        if ad_account_id.startswith("mock_"):
            return f"Mock Ad Account ({ad_account_id})"
        try:
            result = self.get(ad_account_id, params={"fields": "name"})
            return result.get("name", f"Account {ad_account_id}")
        except Exception:
            return f"Account {ad_account_id}"

    def fetch_campaigns(self, ad_account_id: str) -> List[Dict[str, Any]]:
        if ad_account_id.startswith("mock_"):
            return get_mock_campaigns(ad_account_id)
        params = {
            "fields": "id,name,status,effective_status,objective,created_time,updated_time",
            "limit": 100
        }
        path = f"{ad_account_id}/campaigns"
        try:
            all_campaigns = []
            while True:
                result = self.get(path, params=params)
                all_campaigns.extend(result.get("data", []))
                after = result.get("paging", {}).get("cursors", {}).get("after")
                has_next = result.get("paging", {}).get("next")
                if after and has_next:
                    params["after"] = after
                else:
                    break
            return all_campaigns
        except Exception as e:
            logger.error(f"Failed to fetch live campaigns for {ad_account_id}: {e}")
            raise e

    def fetch_adsets(self, ad_account_id: str) -> List[Dict[str, Any]]:
        if ad_account_id.startswith("mock_"):
            return get_mock_adsets(ad_account_id)
        params = {
            "fields": "id,name,status,effective_status,daily_budget,lifetime_budget,optimization_goal,billing_event,campaign{id},created_time,updated_time",
            "limit": 150
        }
        path = f"{ad_account_id}/adsets"
        try:
            all_adsets = []
            while True:
                result = self.get(path, params=params)
                all_adsets.extend(result.get("data", []))
                after = result.get("paging", {}).get("cursors", {}).get("after")
                has_next = result.get("paging", {}).get("next")
                if after and has_next:
                    params["after"] = after
                else:
                    break
            return all_adsets
        except Exception as e:
            logger.error(f"Failed to fetch live adsets for {ad_account_id}: {e}")
            raise e

    def fetch_ads(self, ad_account_id: str) -> List[Dict[str, Any]]:
        if ad_account_id.startswith("mock_"):
            return get_mock_ads(ad_account_id)
        params = {
            "fields": "id,name,status,effective_status,creative{id},adset{id},created_time,updated_time",
            "limit": 100
        }
        path = f"{ad_account_id}/ads"
        try:
            all_ads = []
            while True:
                result = self.get(path, params=params)
                all_ads.extend(result.get("data", []))
                after = result.get("paging", {}).get("cursors", {}).get("after")
                has_next = result.get("paging", {}).get("next")
                if after and has_next:
                    params["after"] = after
                else:
                    break
            return all_ads
        except Exception as e:
            logger.error(f"Failed to fetch live ads for {ad_account_id}: {e}")
            raise e

    def fetch_creatives(self, ad_account_id: str) -> Dict[str, Dict[str, Any]]:
        """
        Fetches all creatives in the account via the /adcreatives endpoint.
        Returns a dict mapping creative_id -> creative data dict.
        """
        if ad_account_id.startswith("mock_"):
            return {k: {"id": k, **v} for k, v in MOCK_CREATIVES_DATA.items()}
            
        creatives = {}
        limit = 100
        params = {
            "fields": "id,name,image_url,thumbnail_url",
            "limit": limit
        }
        path = f"{ad_account_id}/adcreatives"
        
        while True:
            try:
                result = self.get(path, params=params)
                for cr in result.get("data", []):
                    creatives[cr["id"]] = cr
                
                # Fetch next cursor
                after_cursor = result.get("paging", {}).get("cursors", {}).get("after")
                has_next = result.get("paging", {}).get("next")
                if after_cursor and has_next:
                    params = {
                        "fields": "id,name,image_url,thumbnail_url",
                        "limit": limit,
                        "after": after_cursor
                    }
                else:
                    break
            except Exception as e:
                logger.warning(f"Error fetching creatives (limit {limit}): {e}")
                if limit > 20:
                    limit = 20
                    params["limit"] = 20
                    continue
                else:
                    break
        return creatives

    def fetch_creatives_thumbnails(self, ad_account_id: str) -> Dict[str, str]:
        """
        Fetches thumbnail_url / image_url for all creatives in the account via the
        /adcreatives endpoint. Returns a dict mapping creative_id -> image URL.
        This is called after the ads sync to backfill video thumbnails.
        """
        thumbnails = {}
        limit = 40
        params = {
            "fields": "id,thumbnail_url,image_url",
            "limit": limit
        }
        path = f"{ad_account_id}/adcreatives"
        
        while True:
            try:
                result = self.get(path, params=params)
                for cr in result.get("data", []):
                    url = cr.get("thumbnail_url") or cr.get("image_url") or ""
                    if url:
                        thumbnails[cr["id"]] = url
                
                # Fetch next cursor
                after_cursor = result.get("paging", {}).get("cursors", {}).get("after")
                has_next = result.get("paging", {}).get("next")
                if after_cursor and has_next:
                    params = {
                        "fields": "id,thumbnail_url,image_url",
                        "limit": limit,
                        "after": after_cursor
                    }
                else:
                    break
            except Exception as e:
                if limit > 10:
                    logger.warning(f"Error fetching page (limit {limit}), retrying with limit 10: {e}")
                    limit = 10
                    params["limit"] = 10
                    continue
                else:
                    logger.error(f"Failed to fetch creative page even with limit 10: {e}")
                    break
        return thumbnails

    def fetch_creative_details(self, creative_id: str) -> Dict[str, Any]:
        """
        Fetches detailed creative info directly from a creative object.
        """
        try:
            return self.get(creative_id, params={"fields": "id,name,image_url,thumbnail_url,body,title"})
        except Exception as e:
            logger.warning(f"Could not fetch full details for creative {creative_id}: {e}. Retrying with minimal fields.")
            try:
                # Try again without 'body' and 'title' fields, which often throw 500 errors on dynamic/video creatives
                return self.get(creative_id, params={"fields": "id,name,image_url,thumbnail_url"})
            except Exception as e2:
                logger.error(f"Could not fetch minimal details for creative {creative_id}: {e2}")
                return {}






    def fetch_insights(self, ad_account_id: str, level: str = 'ad', date_preset: str = 'last_30d', time_increment: int = 1) -> List[Dict[str, Any]]:
        if ad_account_id.startswith("mock_"):
            return get_mock_insights(ad_account_id, level)
        params = {
            "level": level,
            "date_preset": date_preset,
            "time_increment": time_increment,
            "fields": "ad_id,ad_name,campaign_id,campaign_name,spend,impressions,clicks,reach,actions,action_values,date_start,date_stop",
            "limit": 200
        }
        path = f"{ad_account_id}/insights"
        try:
            all_insights = []
            while True:
                result = self.get(path, params=params)
                all_insights.extend(result.get("data", []))
                # Paginate
                after = result.get("paging", {}).get("cursors", {}).get("after")
                has_next = result.get("paging", {}).get("next")
                if after and has_next:
                    params["after"] = after
                else:
                    break
            return all_insights
        except Exception as e:
            logger.warning(f"Failed to fetch live insights, falling back to mock. Error: {e}")
            return get_mock_insights(ad_account_id, level)


# --- MOCK DATA GENERATORS ---

MOCK_CAMPAIGNS_DATA = [
    {"id": "c_camp_01", "name": "MA_Rabat - [TEST-1001] Robe Lin Beige - Conversions", "status": "ACTIVE", "objective": "CONVERSIONS"},
    {"id": "c_camp_02", "name": "EU_Paris - [TEST-1002] Soie Lilas Maxi - Traffic", "status": "ACTIVE", "objective": "OUTCOME_TRAFFIC"},
    {"id": "c_camp_03", "name": "Morocco - [TEST-1003] Coton Bio Basic Tee - Retargeting", "status": "ACTIVE", "objective": "CONVERSIONS"},
    {"id": "c_camp_04", "name": "MA_Casa - [TEST-1004] Satin Black Dress - Catalog Sales", "status": "PAUSED", "objective": "OUTCOME_SALES"},
    {"id": "c_camp_05", "name": "US_LA - [TEST-1005] Cotton Casual Set - Brand Awareness", "status": "PAUSED", "objective": "OUTCOME_AWARENESS"},
]

MOCK_ADSETS_DATA = [
    {"id": "as_adset_01", "campaign_id": "c_camp_01", "name": "Luxe Lookalike 2% Morocco", "status": "ACTIVE", "daily_budget": "50000", "optimization_goal": "OFFSITE_CONVERSIONS", "billing_event": "IMPRESSIONS"},
    {"id": "as_adset_02", "campaign_id": "c_camp_01", "name": "Interest: Organic Linen & Sustainable Fashion", "status": "ACTIVE", "daily_budget": "45000", "optimization_goal": "OFFSITE_CONVERSIONS", "billing_event": "IMPRESSIONS"},
    {"id": "as_adset_03", "campaign_id": "c_camp_02", "name": "Broad EU Fashionistas 21-35", "status": "ACTIVE", "daily_budget": "30000", "optimization_goal": "LINK_CLICKS", "billing_event": "IMPRESSIONS"},
    {"id": "as_adset_04", "campaign_id": "c_camp_03", "name": "Custom Audiences - Website Visitors 30d", "status": "ACTIVE", "daily_budget": "20000", "optimization_goal": "OFFSITE_CONVERSIONS", "billing_event": "IMPRESSIONS"},
    {"id": "as_adset_05", "campaign_id": "c_camp_04", "name": "Add to Cart Abandoners Retargeting", "status": "PAUSED", "daily_budget": "15000", "optimization_goal": "OFFSITE_CONVERSIONS", "billing_event": "IMPRESSIONS"},
    {"id": "as_adset_06", "campaign_id": "c_camp_05", "name": "LA & NYC High Net Worth Women", "status": "PAUSED", "daily_budget": "10000", "optimization_goal": "REACH", "billing_event": "IMPRESSIONS"},
]

MOCK_ADS_DATA = [
    # Robe Lin Beige Ads (Campaign 1)
    {"id": "a_ad_01", "adset_id": "as_adset_01", "name": "Ad 1 - Linen Robe [UGC Video]", "status": "ACTIVE", "creative_id": "cr_creat_01"},
    {"id": "a_ad_02", "adset_id": "as_adset_01", "name": "Ad 2 - Tan Dress [Cinematic]", "status": "ACTIVE", "creative_id": "cr_creat_02"},
    {"id": "a_ad_03", "adset_id": "as_adset_02", "name": "Ad 3 - Eco Linen [Stock Photo]", "status": "ACTIVE", "creative_id": "cr_creat_03"},
    # Soie Lilas Maxi (Campaign 2)
    {"id": "a_ad_04", "adset_id": "as_adset_03", "name": "Ad 4 - Silk Dress [Lifestyle UGC]", "status": "ACTIVE", "creative_id": "cr_creat_04"},
    # Coton Bio Basic Tee (Campaign 3)
    {"id": "a_ad_05", "adset_id": "as_adset_04", "name": "Ad 5 - Bio Tee [Problem-solving Video]", "status": "ACTIVE", "creative_id": "cr_creat_05"},
    # Satin Black Dress (Campaign 4)
    {"id": "a_ad_06", "adset_id": "as_adset_05", "name": "Ad 6 - Satin Dress [Cinematic Video]", "status": "PAUSED", "creative_id": "cr_creat_06"},
    # Cotton Casual Set (Campaign 5)
    {"id": "a_ad_07", "adset_id": "as_adset_06", "name": "Ad 7 - Casual Lounge [UGC Video]", "status": "PAUSED", "creative_id": "cr_creat_07"},
]

MOCK_CREATIVES_DATA = {
    "cr_creat_01": {
        "name": "Creative 1 - UGC Unboxing Linen",
        "format": "VIDEO",
        "hook_type": "Unboxing & First Impression",
        "has_model": True,
        "video_duration": 25,
        "editing_style": "User Generated (UGC)",
        "body": "Découvrez notre magnifique robe en lin beige ! Idéale pour cet été. ✨ Commandez en Darija par WhatsApp.",
        "title": "Robe Lin Beige Bio Premium",
        "image_url": "https://picsum.photos/seed/creat1/600/600"
    },
    "cr_creat_02": {
        "name": "Creative 2 - Cinematic Tan Dress Model",
        "format": "VIDEO",
        "hook_type": "Aesthetic Model Walk",
        "has_model": True,
        "video_duration": 15,
        "editing_style": "Cinematic/Aesthetic",
        "body": "Légèreté et élégance. Découvrez la Soie Lin Beige d'OREAS. Livraison gratuite au Maroc 🇲🇦",
        "title": "La Robe d'Eté Parfaite",
        "image_url": "https://picsum.photos/seed/creat2/600/600"
    },
    "cr_creat_03": {
        "name": "Creative 3 - Stock Photo product focus",
        "format": "IMAGE",
        "hook_type": "None (Static Image)",
        "has_model": False,
        "video_duration": None,
        "editing_style": "Clean Studio/Flatlay",
        "body": "Notre collection en coton bio et lin est en ligne. Visitez notre boutique en ligne.",
        "title": "Shop la nouvelle collection",
        "image_url": "https://picsum.photos/seed/creat3/600/600"
    },
    "cr_creat_04": {
        "name": "Creative 4 - Lifestyle Silk Dress",
        "format": "VIDEO",
        "hook_type": "Before & After styling",
        "has_model": True,
        "video_duration": 30,
        "editing_style": "User Generated (UGC)",
        "body": "Comment porter la robe maxi lilas de 3 façons différentes ! 🌸 Finition couture de luxe.",
        "title": "Maxi Robe en Soie Lilas",
        "image_url": "https://picsum.photos/seed/creat4/600/600"
    },
    "cr_creat_05": {
        "name": "Creative 5 - Problem solving Bio Tee",
        "format": "VIDEO",
        "hook_type": "Problem-Solving Hook",
        "has_model": True,
        "video_duration": 40,
        "editing_style": "Fast-paced/UGC",
        "body": "Fatigué des T-shirts transparents qui rétrécissent au lavage ? 🛑 Notre coton bio épais résout tout.",
        "title": "Coton Bio Thick Tee",
        "image_url": "https://picsum.photos/seed/creat5/600/600"
    },
    "cr_creat_06": {
        "name": "Creative 6 - Cinematic Satin Dress",
        "format": "VIDEO",
        "hook_type": "Aesthetic Model Walk",
        "has_model": True,
        "video_duration": 18,
        "editing_style": "Cinematic/Aesthetic",
        "body": "Le satin le plus doux pour vos soirées. Édition limitée par OREAS. Prix spécial en DM.",
        "title": "Robe de soirée en Satin Noir",
        "image_url": "https://picsum.photos/seed/creat6/600/600"
    },
    "cr_creat_07": {
        "name": "Creative 7 - Casual Lounge UGC",
        "format": "VIDEO",
        "hook_type": "Problem-Solving Hook",
        "has_model": True,
        "video_duration": 35,
        "editing_style": "User Generated (UGC)",
        "body": "Le confort de la maison, le style pour sortir. Notre set casual en coton bio fait fureur.",
        "title": "Cotton Casual Lounge Set",
        "image_url": "https://picsum.photos/seed/creat7/600/600"
    }
}

def get_mock_campaigns(account_id: str) -> List[Dict[str, Any]]:
    now = datetime.datetime.now(datetime.timezone.utc)
    return [
        {
            "id": f"{account_id}_{c['id']}",
            "name": c["name"],
            "status": c["status"],
            "objective": c["objective"],
            "created_time": (now - datetime.timedelta(days=45)).isoformat(),
            "updated_time": (now - datetime.timedelta(days=1)).isoformat()
        }
        for c in MOCK_CAMPAIGNS_DATA
    ]

def get_mock_adsets(account_id: str) -> List[Dict[str, Any]]:
    now = datetime.datetime.now(datetime.timezone.utc)
    return [
        {
            "id": f"{account_id}_{as_d['id']}",
            "campaign": {"id": f"{account_id}_{as_d['campaign_id']}"},
            "name": as_d["name"],
            "status": as_d["status"],
            "daily_budget": as_d["daily_budget"],
            "optimization_goal": as_d["optimization_goal"],
            "billing_event": as_d["billing_event"],
            "created_time": (now - datetime.timedelta(days=44)).isoformat(),
            "updated_time": (now - datetime.timedelta(days=1)).isoformat()
        }
        for as_d in MOCK_ADSETS_DATA
    ]

def get_mock_ads(account_id: str) -> List[Dict[str, Any]]:
    now = datetime.datetime.now(datetime.timezone.utc)
    return [
        {
            "id": f"{account_id}_{ad['id']}",
            "adset": {"id": f"{account_id}_{ad['adset_id']}"},
            "name": ad["name"],
            "status": ad["status"],
            # Nest creative details directly
            "creative": {
                "id": ad["creative_id"],
                **MOCK_CREATIVES_DATA[ad["creative_id"]]
            },
            "created_time": (now - datetime.timedelta(days=43)).isoformat(),
            "updated_time": (now - datetime.timedelta(days=1)).isoformat()
        }
        for ad in MOCK_ADS_DATA
    ]

def get_mock_insights(account_id: str, level: str = 'ad') -> List[Dict[str, Any]]:
    insights = []
    random.seed(42)
    now = datetime.datetime.now(datetime.timezone.utc).date()
    
    # Ad-level daily performance statistics profiles
    # Creative 1 (UGC Video - Linen): Extremely strong CTR & conversions, low returns
    # Creative 2 (Cinematic Video - Linen): High CPC, moderate conversions, low returns
    # Creative 3 (Stock Photo - Linen): Awful CTR, high acquisition cost, extremely high returns!
    ad_profiles = {
        f"{account_id}_a_ad_01": {"campaign_id": "c_camp_01", "base_spend": 25.0, "ctr": 3.6, "roas_factor": 4.8}, # UGC - Scale
        f"{account_id}_a_ad_02": {"campaign_id": "c_camp_01", "base_spend": 20.0, "ctr": 1.9, "roas_factor": 2.8}, # Cinematic - Optimize
        f"{account_id}_a_ad_03": {"campaign_id": "c_camp_01", "base_spend": 15.0, "ctr": 0.6, "roas_factor": 0.8}, # Stock - Bleeding
        f"{account_id}_a_ad_04": {"campaign_id": "c_camp_02", "base_spend": 30.0, "ctr": 2.2, "roas_factor": 2.4}, # Silk
        f"{account_id}_a_ad_05": {"campaign_id": "c_camp_03", "base_spend": 20.0, "ctr": 4.5, "roas_factor": 5.1}, # Bio Tee - Scale
        f"{account_id}_a_ad_06": {"campaign_id": "c_camp_04", "base_spend": 15.0, "ctr": 1.7, "roas_factor": 2.9}, # Paused
        f"{account_id}_a_ad_07": {"campaign_id": "c_camp_05", "base_spend": 10.0, "ctr": 1.1, "roas_factor": 0.6}, # Paused
    }
    
    for ad in MOCK_ADS_DATA:
        ad_id = f"{account_id}_{ad['id']}"
        profile = ad_profiles[ad_id]
        camp_id = f"{account_id}_{profile['campaign_id']}"
        
        # Paused campaigns run shorter
        days_limit = 15 if ad["status"] == "PAUSED" else 30
        
        for d in range(days_limit):
            day_date = now - datetime.timedelta(days=d)
            
            fluctuation = random.uniform(0.85, 1.15)
            spend = profile["base_spend"] * fluctuation
            impressions = int(spend * 50 * random.uniform(0.9, 1.1))
            clicks = int(impressions * (profile["ctr"] / 100.0) * random.uniform(0.95, 1.05))
            reach = int(impressions * random.uniform(0.75, 0.85))
            
            # Simple purchase events matching Facebook tracking
            purchases_target_val = spend * profile["roas_factor"]
            purchases = int(purchases_target_val / 350.0) # Assume avg price $350 MAD
            purchases = max(0, purchases + random.choice([-1, 0, 1]) if purchases > 1 else purchases)
            purchases_value = purchases * 350.0
            
            actions = [
                {"action_type": "link_click", "value": str(clicks)},
                {"action_type": "post_engagement", "value": str(clicks + random.randint(5, 20))},
            ]
            action_values = []
            
            if purchases > 0:
                actions.append({"action_type": "purchase", "value": str(purchases)})
                actions.append({"action_type": "offsite_conversion.fb_pixel_purchase", "value": str(purchases)})
                action_values.append({"action_type": "purchase", "value": str(purchases_value)})
                
            insights.append({
                "ad_id": ad_id,
                "ad_name": ad["name"],
                "campaign_id": camp_id,
                "campaign_name": next(c["name"] for c in MOCK_CAMPAIGNS_DATA if f"{account_id}_{c['id']}" == camp_id),
                "spend": f"{spend:.2f}",
                "impressions": str(impressions),
                "clicks": str(clicks),
                "reach": str(reach),
                "actions": actions,
                "action_values": action_values,
                "inline_link_click_ctr": f"{clicks/impressions*100:.4f}" if impressions > 0 else "0.0",
                "cpp": f"{spend/purchases:.2f}" if purchases > 0 else "0.0",
                "date_start": day_date.isoformat(),
                "date_stop": day_date.isoformat()
            })
            
    return insights

def get_mock_orders(campaign_id: str, date_val: datetime.date) -> List[Dict[str, Any]]:
    """
    Synthesize mock orders for a campaign and date to test full funnel tracking.
    """
    random.seed(hash(f"{campaign_id}_{date_val}") % 10000)
    
    # Establish cancellation/delivery profile per campaign
    # Campaign 1 (Linen Robe - [TEST-1001]): Good, low cancellations
    # Campaign 2 (Maxi Silk - [TEST-1002]): Moderate
    # Campaign 3 (Bio Tee - [TEST-1003]): Outstanding delivery
    # Campaign 4 (Satin - [TEST-1004]): Awful Call Center Cancellations (65%)
    # Campaign 5 (Casual - [TEST-1005]): High return rates
    profiles = {
        "TEST-1001": {"confirm_rate": 0.85, "deliver_rate": 0.80, "return_rate": 0.05, "price": 450.00, "cogs": 130.00},
        "TEST-1002": {"confirm_rate": 0.70, "deliver_rate": 0.75, "return_rate": 0.08, "price": 350.00, "cogs": 110.00},
        "TEST-1003": {"confirm_rate": 0.90, "deliver_rate": 0.88, "return_rate": 0.02, "price": 220.00, "cogs": 55.00},
        "TEST-1004": {"confirm_rate": 0.35, "deliver_rate": 0.60, "return_rate": 0.10, "price": 380.00, "cogs": 120.00}, # 65% Cancelled!
        "TEST-1005": {"confirm_rate": 0.75, "deliver_rate": 0.70, "return_rate": 0.35, "price": 250.00, "cogs": 80.00},  # 35% Returned!
    }
    
    # Extract test id
    test_id = "TEST-1001"
    for tid in profiles.keys():
        if tid in campaign_id:
            test_id = tid
            break
            
    profile = profiles[test_id]
    
    # Determine number of orders for this date
    # Randomly generate order count (e.g. between 1 and 6)
    count = random.randint(1, 5)
    
    orders = []
    for i in range(count):
        order_num = random.randint(10000, 99999)
        order_id = f"SO-{order_num}"
        
        # Determine funnel statuses based on profile rates
        is_confirmed = random.random() < profile["confirm_rate"]
        is_delivered = False
        is_returned = False
        
        shopify_status = 'fulfilled'
        call_center_status = 'confirmed' if is_confirmed else 'cancelled'
        
        if is_confirmed:
            is_delivered = random.random() < profile["deliver_rate"]
            delivery_status = 'delivered' if is_delivered else 'failed'
            shopify_status = 'fulfilled'
            
            if is_delivered:
                is_returned = random.random() < profile["return_rate"]
        else:
            delivery_status = 'pending'
            shopify_status = 'cancelled'
            
        orders.append({
            "order_id": order_id,
            "price": profile["price"],
            "cogs": profile["cogs"],
            "shopify_status": shopify_status,
            "call_center_status": call_center_status,
            "delivery_status": delivery_status,
            "is_returned": is_returned,
            "created_at": datetime.datetime.combine(date_val, datetime.time(random.randint(8, 20), random.randint(0, 59)))
        })
        
    return orders

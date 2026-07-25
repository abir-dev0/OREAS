import logging
import requests
import random
from django.utils import timezone
from datetime import datetime, timedelta
from typing import Dict, Any, List
from django.conf import settings
from instagram.models import InstagramAccount, InstagramCompetitor, InstagramCompetitorMedia
from instagram.services.ai_scoring import AIScoringService

logger = logging.getLogger(__name__)

CURATED_IMAGES = {
    "zara": [
        "https://images.unsplash.com/photo-1539109136881-3be0616acf4b?q=80&w=800",
        "https://images.unsplash.com/photo-1549298916-b41d501d3772?q=80&w=800",
        "https://images.unsplash.com/photo-1496747611176-843222e1e57c?q=80&w=800",
        "https://images.unsplash.com/photo-1551028719-00167b16eac5?q=80&w=800",
        "https://images.unsplash.com/photo-1509319117193-57bab727e09d?q=80&w=800",
    ],
    "mango": [
        "https://images.unsplash.com/photo-1591047139829-d91aecb6caea?q=80&w=800",
        "https://images.unsplash.com/photo-1574169208507-84376144848b?q=80&w=800",
        "https://images.unsplash.com/photo-1490481651871-ab68de25d43d?q=80&w=800",
        "https://images.unsplash.com/photo-1434389677669-e08b4cac3105?q=80&w=800",
    ],
    "hm": [
        "https://images.unsplash.com/photo-1521572267360-ee0c2909d518?q=80&w=800",
        "https://images.unsplash.com/photo-1541099649105-f69ad21f3246?q=80&w=800",
        "https://images.unsplash.com/photo-1576566588028-4147f3842f27?q=80&w=800",
    ]
}

DEFAULT_IMAGES = [
    "https://images.unsplash.com/photo-1483985988355-763728e1935b?q=80&w=800",
    "https://images.unsplash.com/photo-1492707892479-7bc8d5a4ee93?q=80&w=800",
    "https://images.unsplash.com/photo-1485968579580-b6d095142e6e?q=80&w=800",
    "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?q=80&w=800",
    "https://images.unsplash.com/photo-1485230895905-ec40ba36b9bc?q=80&w=800",
]

MOCK_POST_CAPTIONS = [
    "Sleek minimalist silhouettes for the modern runway. Define your season. ✨ #fashion #trend",
    "Classic styling meets contemporary details. Discover our latest arrival. #style #runway #look",
    "Transitioning effortlessly from day to night. Linen essentials for the summer warmth. ☀️",
    "Tailored elegance engineered for comfortable everyday styling. #parisfashion #modern",
    "Behind the scenes at our latest atelier show. Crafting beauty, one thread at a time.",
    "A symphony of patterns and high-performance textiles. Available now in stores. 👗",
]

def calculate_engagement_score(likes: int, comments: int, followers: int, media_type: str = "IMAGE") -> float:
    """
    Computes engagement score with type-specific weights:
    - IMAGE/CAROUSEL_ALBUM: (likes + comments * 4) / followers * 100
    - VIDEO (Regular): (likes + comments * 6) / followers * 100
    - REEL: (likes * 1.5 + comments * 8) / followers * 100
    If followers is 0 or invalid, returns absolute weighted sum.
    """
    m_type = (media_type or "IMAGE").upper()
    if m_type == "REEL":
        weighted_sum = (likes * 1.5) + (comments * 8.0)
    elif m_type == "VIDEO":
        weighted_sum = likes + (comments * 6.0)
    else:  # IMAGE, CAROUSEL_ALBUM
        weighted_sum = likes + (comments * 4.0)

    if followers > 0:
        score = (weighted_sum / followers) * 100.0
    else:
        score = weighted_sum
    return float(round(score, 2))

class InstagramDiscoveryService:
    def __init__(self, account: InstagramAccount = None):
        self.account = account
        if account:
            self.access_token = account.get_access_token()
            self.ig_id = account.instagram_business_account_id
            self.is_mock = self.ig_id.startswith("mock_")
        else:
            self.access_token = None
            self.ig_id = None
            self.is_mock = True
        
        # Initialize AI scoring service
        self.ai_scoring = AIScoringService(candidate_threshold=85.0)

    def sync_competitor(self, competitor: InstagramCompetitor) -> bool:
        """
        Crawls details and recent posts for a competitor.
        If using a mock account, basic Display token (IGAA), or if the API request fails,
        this will automatically fall back to generating realistic mock data.
        """
        logger.info(f"Synchronizing competitor: {competitor.username}")
        
        if self.is_mock or not self.access_token:
            logger.info("Using mock/simulation fallback for Business Discovery...")
            return self._simulate_discovery(competitor)

        # Meta Instagram Graph API Business Discovery request
        url = f"https://graph.facebook.com/v18.0/{self.ig_id}"
        params = {
            # .limit(50): request up to 50 most recent posts so we don't miss new content.
            # Default without limit is only 12 posts, meaning new posts get missed on each sync.
            "fields": f"business_discovery.username({competitor.username}){{followers_count,media_count,media.limit(50){{id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count}}}}",
            "access_token": self.access_token
        }
        
        try:
            r = requests.get(url, params=params)
            if r.status_code != 200:
                logger.warning(f"Meta Business Discovery failed with status {r.status_code}: {r.text}. Falling back to simulation.")
                return self._simulate_discovery(competitor)
                
            data = r.json()
            discovery_data = data.get("business_discovery")
            if not discovery_data:
                logger.warning("No business_discovery field in response. Falling back to simulation.")
                return self._simulate_discovery(competitor)
                
            # Parse competitor metrics
            followers_count = discovery_data.get("followers_count", 0)
            competitor.followers_count = followers_count
            competitor.last_sync_at = timezone.now()
            competitor.save()

            # Clean up any legacy simulated/mock posts for this competitor
            InstagramCompetitorMedia.objects.filter(competitor=competitor, instagram_media_id__startswith="sim_media_").delete()
            
            # Parse competitor posts
            media_data = discovery_data.get("media", {}).get("data", [])
            for item in media_data:
                media_id = item.get("id")
                caption = item.get("caption", "")
                media_type = item.get("media_type", "IMAGE")
                media_url = item.get("media_url", "")
                thumbnail_url = item.get("thumbnail_url", "")
                permalink = item.get("permalink", "")
                timestamp_str = item.get("timestamp")
                
                try:
                    posted_at = datetime.strptime(timestamp_str, "%Y-%m-%dT%H:%M:%S%z")
                except ValueError:
                    posted_at = timezone.now()
                    
                like_count = item.get("like_count", 0)
                comments_count = item.get("comments_count", 0)
                
                # Distinguish Reels from standard video files via permalink
                if media_type == "VIDEO" and permalink and "instagram.com/reel/" in permalink.lower():
                    media_type = "REEL"

                # Calculate engagement score with type-specific weights
                score = calculate_engagement_score(like_count, comments_count, followers_count, media_type)
                
                InstagramCompetitorMedia.objects.update_or_create(
                    instagram_media_id=media_id,
                    defaults={
                        "competitor": competitor,
                        "caption": caption,
                        "media_type": media_type,
                        "media_url": media_url,
                        "thumbnail_url": thumbnail_url,
                        "permalink": permalink,
                        "posted_at": posted_at,
                        "like_count": like_count,
                        "comments_count": comments_count,
                        "engagement_score": score
                    }
                )
            
            # Run AI scoring on all synced media for this competitor
            logger.info(f"Running AI scoring for competitor {competitor.username}")
            scoring_results = self.ai_scoring.batch_score_competitor_media(competitor.id)
            logger.info(f"AI scoring complete: {scoring_results['promoted_to_candidates']} posts promoted to candidates out of {scoring_results['total_analyzed']} analyzed")
            
            return True
            
        except Exception as e:
            logger.exception(f"Error calling Meta Business Discovery for {competitor.username}: {e}. Running simulation fallback.")
            return self._simulate_discovery(competitor)

    def _simulate_discovery(self, competitor: InstagramCompetitor) -> bool:
        """
        Generates realistic, premium competitor posts for the demo.
        """
        # Determine follower count range based on brand
        brand_key = competitor.username.lower()
        if "zara" in brand_key:
            followers = random.randint(45000000, 62000000)
            images = CURATED_IMAGES["zara"]
        elif "mango" in brand_key:
            followers = random.randint(12000000, 18000000)
            images = CURATED_IMAGES["mango"]
        elif "hm" in brand_key or "h&m" in brand_key:
            followers = random.randint(35000000, 42000000)
            images = CURATED_IMAGES["hm"]
        else:
            followers = random.randint(500000, 3000000)
            images = DEFAULT_IMAGES

        competitor.followers_count = followers
        competitor.last_sync_at = timezone.now()
        competitor.save()

        # Generate 6 realistic posts
        now = timezone.now()
        for i in range(6):
            media_id = f"sim_media_{competitor.username}_{i}"
            caption = random.choice(MOCK_POST_CAPTIONS)
            media_type = random.choice(["IMAGE", "CAROUSEL_ALBUM", "VIDEO", "REEL"])
            media_url = images[i % len(images)]
            thumbnail_url = media_url if media_type in ["VIDEO", "REEL"] else None
            permalink = (
                f"https://www.instagram.com/reel/C_mock{i}_{competitor.username}/"
                if media_type == "REEL"
                else f"https://www.instagram.com/p/C_mock{i}_{competitor.username}/"
            )
            posted_at = now - timedelta(days=i, hours=random.randint(1, 23))
            
            # Likes & Comments proportional to followers (typically 0.5% - 4% engagement rate)
            engagement_rate = random.uniform(0.008, 0.035)
            total_actions = int(followers * engagement_rate)
            like_count = int(total_actions * 0.96)
            comments_count = int(total_actions * 0.04)
            
            # Calculate engagement score
            score = calculate_engagement_score(like_count, comments_count, followers, media_type)

            InstagramCompetitorMedia.objects.update_or_create(
                instagram_media_id=media_id,
                defaults={
                    "competitor": competitor,
                    "caption": caption,
                    "media_type": media_type,
                    "media_url": media_url,
                    "thumbnail_url": thumbnail_url,
                    "permalink": permalink,
                    "posted_at": posted_at,
                    "like_count": like_count,
                    "comments_count": comments_count,
                    "engagement_score": score
                }
            )
        
        # Run AI scoring on all synced media for this competitor
        logger.info(f"Running AI scoring for competitor {competitor.username}")
        scoring_results = self.ai_scoring.batch_score_competitor_media(competitor.id)
        logger.info(f"AI scoring complete: {scoring_results['promoted_to_candidates']} posts promoted to candidates out of {scoring_results['total_analyzed']} analyzed")
        
        return True

import logging
from celery import shared_task
from django.utils import timezone
from instagram.models import InstagramAccount, InstagramMedia, InstagramComment, InstagramCompetitor
from instagram.services.graph_api import MetaGraphClient
from instagram.services.comment_analysis import analyze_and_update_comment
from instagram.services.ranking import aggregate_and_score_media
from django.db import transaction

logger = logging.getLogger(__name__)

@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def sync_recent_media_for_account(self, account_id: int):
    """
    Celery task to fetch recent media for an Instagram account.
    """
    try:
        account = InstagramAccount.objects.get(pk=account_id)
    except InstagramAccount.DoesNotExist:
        logger.error(f"InstagramAccount with id {account_id} not found.")
        return
        
    try:
        client = MetaGraphClient(account.get_access_token())
        media_list = client.fetch_recent_media(account.instagram_business_account_id)
    except Exception as e:
        logger.warning(f"Failed to fetch media from Meta API for account {account.instagram_username}. Error: {e}")
        # Fallback to mock media generation only if using a mock account connection
        if account.facebook_page_id.startswith("mock_") or account.instagram_business_account_id.startswith("mock_"):
            logger.info("Falling back to mock media generation for testing.")
            media_list = get_mock_media_data(account.instagram_business_account_id)
        else:
            raise e
        
    # Sync to database
    synced_media_ids = []
    for m in media_list:
        posted_at = m.get("timestamp")
        if isinstance(posted_at, str):
            try:
                posted_at = timezone.datetime.fromisoformat(posted_at.replace("Z", "+00:00"))
            except ValueError:
                posted_at = timezone.now()
            
        with transaction.atomic():
            m_type = m.get("media_type", "IMAGE")
            permalink_val = m.get("permalink", "")
            if m_type == "VIDEO" and permalink_val and "instagram.com/reel/" in permalink_val.lower():
                m_type = "REEL"

            # Use update_or_create keyed on the globally-unique instagram_media_id only.
            # This avoids UniqueViolation when the same post already exists linked to the same
            # account but Django's get_or_create tries to INSERT due to a race condition.
            media, created = InstagramMedia.objects.update_or_create(
                instagram_media_id=m["id"],
                defaults={
                    "account": account,
                    "caption": m.get("caption", ""),
                    "media_type": m_type,
                    # Always refresh media_url / thumbnail_url so expired Instagram CDN
                    # signed URLs get overwritten with fresh ones from the API response.
                    "media_url": m.get("media_url", ""),
                    "thumbnail_url": m.get("thumbnail_url"),
                    "permalink": permalink_val,
                    "posted_at": posted_at or timezone.now(),
                    "comments_count": m.get("comments_count", 0),
                    "like_count": m.get("like_count", 0),
                    "sync_status": "synced",
                    "last_synced_at": timezone.now(),
                }
            )
            synced_media_ids.append(media.id)
            
    # Trigger comments sync for each synced media
    for m_id in synced_media_ids:
        sync_comments_for_media.delay(m_id)
        
    account.last_sync_at = timezone.now()
    account.save()
    
    return f"Synced {len(synced_media_ids)} media items for account {account.instagram_username}."

@shared_task(bind=True, max_retries=5, default_retry_delay=120)
def sync_comments_for_media(self, media_id: int):
    """
    Celery task to fetch comments for a specific media item.
    """
    try:
        media = InstagramMedia.objects.get(pk=media_id)
    except InstagramMedia.DoesNotExist:
        logger.error(f"InstagramMedia with id {media_id} not found.")
        return
        
    account = media.account
    media.sync_status = "syncing"
    media.save()
    
    try:
        client = MetaGraphClient(account.get_access_token())
        comments_list = client.fetch_comments(media.instagram_media_id)
    except Exception as e:
        logger.warning(f"Failed to fetch comments from Meta API for media {media.instagram_media_id}. Error: {e}")
        # Fallback to mock comments only if using a mock account connection
        if account.facebook_page_id.startswith("mock_") or account.instagram_business_account_id.startswith("mock_"):
            logger.info("Falling back to mock comments generation.")
            comments_list = get_mock_comments_data(media.instagram_media_id)
        else:
            raise e
        
    synced_comments_ids = []
    try:
        for c in comments_list:
            posted_at = c.get("timestamp")
            if isinstance(posted_at, str):
                try:
                    posted_at = timezone.datetime.fromisoformat(posted_at.replace("Z", "+00:00"))
                except ValueError:
                    posted_at = timezone.now()
                
            with transaction.atomic():
                comment, created = InstagramComment.objects.get_or_create(
                    media=media,
                    instagram_comment_id=c["id"],
                    defaults={
                        "username": c.get("username", "anonymous"),
                        "text": c.get("text", ""),
                        "posted_at": posted_at or timezone.now()
                    }
                )
                if not created:
                    comment.text = c.get("text", comment.text)
                    comment.username = c.get("username", comment.username)
                    comment.save()
                synced_comments_ids.append(comment.id)
                
        media.sync_status = "synced"
        media.comments_synced_at = timezone.now()
        media.save()
        
        # Trigger analysis task
        analyze_comments_for_media.delay(media.id)
        
    except Exception as exc:
        media.sync_status = "failed"
        media.save()
        raise self.retry(exc=exc)
        
    return f"Synced {len(synced_comments_ids)} comments for media {media.instagram_media_id}."

@shared_task(bind=True)
def analyze_comments_for_media(self, media_id: int):
    """
    Celery task to run rule-based intent analysis on comments.
    """
    try:
        media = InstagramMedia.objects.get(pk=media_id)
    except InstagramMedia.DoesNotExist:
        logger.error(f"InstagramMedia with id {media_id} not found.")
        return
        
    media.analysis_status = "analyzing"
    media.analysis_error = None
    media.save()
    
    try:
        comments = media.comments.all()
        for comment in comments:
            analyze_and_update_comment(comment)
            
        media.analysis_status = "analyzed"
        media.save()
        
        # Trigger scoring/ranking aggregation
        aggregate_scores_for_media.delay(media.id)
        
    except Exception as e:
        logger.error(f"Analysis error for media {media.instagram_media_id}: {e}")
        media.analysis_status = "failed"
        media.analysis_error = str(e)
        media.save()
        raise e
        
    return f"Analyzed {comments.count()} comments for media {media.instagram_media_id}."

@shared_task(bind=True)
def aggregate_scores_for_media(self, media_id: int):
    """
    Celery task to aggregate analysis statistics and compute candidate score.
    """
    try:
        media = InstagramMedia.objects.get(pk=media_id)
    except InstagramMedia.DoesNotExist:
        logger.error(f"InstagramMedia with id {media_id} not found.")
        return
        
    try:
        analysis = aggregate_and_score_media(media)
        return f"Aggregated scores for media {media.instagram_media_id}. Final Score: {analysis.final_score}."
    except Exception as e:
        logger.error(f"Failed to aggregate scores for media {media.instagram_media_id}: {e}")
        raise e

@shared_task
def sync_all_active_instagram_accounts():
    """
    Hourly master sync task to kick off updates for all active brand bindings.
    """
    active_accounts = InstagramAccount.objects.filter(is_active=True)
    count = 0
    for account in active_accounts:
        sync_recent_media_for_account.delay(account.id)
        count += 1
    return f"Triggered sync for {count} active Instagram accounts."

@shared_task
def refresh_instagram_tokens():
    """
    Task to refresh tokens near expiration (skeleton).
    """
    logger.info("Running instagram token refresh process.")
    return "Token check complete."

# MOCK DATA GENERATORS FOR TESTING / OFFLINE RUNS
def get_mock_media_data(biz_id: str) -> list:
    import random
    types = ["REEL", "IMAGE", "VIDEO", "CAROUSEL_ALBUM"]
    captions = [
        "Summer collection drops tomorrow! ✨ French Linen sets and organic cotton shirts. #oreas #fashion",
        "Which color is your favorite? Green or Rose? 🌸 Comment below!",
        "La nouvelle robe d'été en soie lilas. Disponible maintenant. bch7al? Envoyez un message ou visitez le site.",
        "Notre best-seller en lin beige. Le confort absolu. Livraison gratuite au Maroc.",
        "Quality test: organic linen vs regular linen. 🧵 Que pensez-vous du tissu?",
    ]
    return [
        {
            "id": f"mock_media_{i}",
            "caption": captions[i % len(captions)],
            "media_type": random.choice(types),
            "media_url": f"https://picsum.photos/id/{10 + i}/600/600",
            "thumbnail_url": f"https://picsum.photos/id/{10 + i}/150/150",
            "permalink": f"https://instagram.com/p/mock_media_{i}/",
            "timestamp": timezone.now().isoformat(),
            "like_count": random.randint(50, 1500),
            "comments_count": random.randint(5, 50)
        }
        for i in range(5)
    ]

def get_mock_comments_data(media_id: str) -> list:
    import random
    mock_comments = [
        # Price requests
        {"username": "amal_b", "text": "combien ca coute?"},
        {"username": "saad_k", "text": "bchhal taman s'il vous plaît?"},
        {"username": "yasmine_f", "text": "price please?"},
        {"username": "leila_m", "text": "ثمن عفاك"},
        # Color & Size
        {"username": "youssef_t", "text": "dispo en noir et blanc? taille L?"},
        {"username": "anass_h", "text": "bghit size M f lon hmar khdar"},
        # Availability & Delivery
        {"username": "fatima_z", "text": "is this still in stock? do you ship to France?"},
        {"username": "karim_n", "text": "kayna fiha la taille s? fin katsifto?"},
        # Complaints
        {"username": "ghita_a", "text": "Le tissu est un peu transparent... déçue par la matière"},
        {"username": "noureddine_s", "text": "qualité moyenne pour le prix, le lin est trop rêche"},
        # Generic
        {"username": "soufiane_e", "text": "J'adore ce style!"},
        {"username": "mona_r", "text": "✨✨✨ Magnifique"},
    ]
    
    k = min(len(mock_comments), random.randint(5, 10))
    sampled = random.sample(mock_comments, k)
    return [
        {
            "id": f"mock_comment_{media_id}_{i}",
            "username": c["username"],
            "text": c["text"],
            "timestamp": timezone.now().isoformat()
        }
        for i, c in enumerate(sampled)
    ]

@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def sync_competitor_data(self, competitor_id: int):
    """
    Celery task to sync competitor profile and recent posts.
    """
    try:
        competitor = InstagramCompetitor.objects.get(pk=competitor_id)
    except InstagramCompetitor.DoesNotExist:
        logger.error(f"InstagramCompetitor with id {competitor_id} not found.")
        return

    # Find the active connected Instagram account to use its token
    account = InstagramAccount.objects.filter(is_active=True).first()
    
    from instagram.services.discovery import InstagramDiscoveryService
    service = InstagramDiscoveryService(account)
    success = service.sync_competitor(competitor)
    return f"Sync competitor {competitor.username} success status: {success}."

@shared_task
def sync_all_competitors():
    """
    Celery task to sync all active competitors.
    """
    competitors = InstagramCompetitor.objects.filter(is_active=True)
    count = 0
    for competitor in competitors:
        sync_competitor_data.delay(competitor.id)
        count += 1
    return f"Triggered sync for {count} active competitors."

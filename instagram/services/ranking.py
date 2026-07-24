from django.db import transaction
from django.utils import timezone
from instagram.models import InstagramMedia, InstagramComment, MediaAnalysis

# Configure weighting constants
SCORING_WEIGHTS = {
    "comments_weight": 2.0,
    "price_weight": 5.0,
    "availability_weight": 4.0,
    "color_weight": 3.0,
    "size_weight": 2.0,
    "delivery_weight": 1.0,
    "like_weight": 0.2,
}

def calculate_score(analysis: MediaAnalysis) -> float:
    cfg = SCORING_WEIGHTS
    
    score = (
        analysis.comments_count * cfg["comments_weight"]
        + analysis.price_comments_count * cfg["price_weight"]
        + analysis.availability_comments_count * cfg["availability_weight"]
        + analysis.color_comments_count * cfg["color_weight"]
        + analysis.size_comments_count * cfg["size_weight"]
        + analysis.delivery_comments_count * cfg["delivery_weight"]
        + analysis.media.like_count * cfg["like_weight"]
    )
    return float(round(score, 2))

def aggregate_and_score_media(media: InstagramMedia) -> MediaAnalysis:
    """
    Aggregates comment intent counts for a specific media, computes its final score,
    and updates/creates the MediaAnalysis model.
    """
    comments = media.comments.all()
    
    # Use actual database comments count or the media comments count, whichever is larger/newer
    db_comments_count = comments.count()
    comments_count = max(media.comments_count, db_comments_count)
    
    price_comments_count = comments.filter(asks_price=True).count()
    availability_comments_count = comments.filter(asks_availability=True).count()
    color_comments_count = comments.filter(asks_color=True).count()
    size_comments_count = comments.filter(asks_size=True).count()
    delivery_comments_count = comments.filter(asks_delivery=True).count()
    negative_feedback_count = comments.filter(has_complaint=True).count()
    
    with transaction.atomic():
        analysis, created = MediaAnalysis.objects.get_or_create(media=media)
        analysis.comments_count = comments_count
        analysis.price_comments_count = price_comments_count
        analysis.availability_comments_count = availability_comments_count
        analysis.color_comments_count = color_comments_count
        analysis.size_comments_count = size_comments_count
        analysis.delivery_comments_count = delivery_comments_count
        analysis.negative_feedback_count = negative_feedback_count
        
        # Calculate score and save
        analysis.final_score = calculate_score(analysis)
        analysis.last_analyzed_at = timezone.now()
        analysis.save()
        
        # Set is_candidate based on score threshold (e.g. >= 15.0)
        # Admin can toggle or overwrite this in the view/admin
        if analysis.final_score >= 15.0 and not media.is_candidate:
            media.is_candidate = True
            media.save()
            
    return analysis

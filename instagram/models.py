from django.db import models
from core.models import Brand
from products.models import Product
from core.encryption import encrypt_value, decrypt_value

class InstagramAccount(models.Model):
    brand = models.ForeignKey(Brand, on_delete=models.CASCADE, related_name='instagram_accounts')
    facebook_page_id = models.CharField(max_length=255)
    facebook_page_name = models.CharField(max_length=255, blank=True)
    instagram_business_account_id = models.CharField(max_length=255, unique=True)
    instagram_username = models.CharField(max_length=255)
    
    # Store access token encrypted.
    access_token_encrypted = models.TextField()
    token_expires_at = models.DateTimeField()
    is_active = models.BooleanField(default=True)
    last_sync_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def set_access_token(self, token_str: str):
        self.access_token_encrypted = encrypt_value(token_str)

    def get_access_token(self) -> str:
        return decrypt_value(self.access_token_encrypted)

    def __str__(self):
        return f"{self.brand.name} - {self.instagram_username}"

class InstagramMedia(models.Model):
    SYNC_STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('syncing', 'Syncing'),
        ('synced', 'Synced'),
        ('failed', 'Failed'),
    ]
    ANALYSIS_STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('analyzing', 'Analyzing'),
        ('analyzed', 'Analyzed'),
        ('failed', 'Failed'),
    ]

    account = models.ForeignKey(InstagramAccount, on_delete=models.CASCADE, related_name='media')
    instagram_media_id = models.CharField(max_length=255, unique=True)
    caption = models.TextField(blank=True)
    media_type = models.CharField(max_length=50)  # IMAGE, VIDEO, CAROUSEL_ALBUM, REEL
    media_url = models.URLField(max_length=3000)
    thumbnail_url = models.URLField(max_length=3000, blank=True, null=True)
    permalink = models.URLField(max_length=3000)
    posted_at = models.DateTimeField()
    comments_count = models.IntegerField(default=0)
    like_count = models.IntegerField(default=0)
    
    # Validation & Custom Product Testing Workflow
    is_candidate = models.BooleanField(default=False)
    linked_product = models.ForeignKey(Product, null=True, blank=True, on_delete=models.SET_NULL, related_name='instagram_media')
    
    # Sync and Analysis State Tracking
    sync_status = models.CharField(max_length=20, choices=SYNC_STATUS_CHOICES, default='pending')
    last_synced_at = models.DateTimeField(null=True, blank=True)
    comments_synced_at = models.DateTimeField(null=True, blank=True)
    
    analysis_status = models.CharField(max_length=20, choices=ANALYSIS_STATUS_CHOICES, default='pending')
    analysis_error = models.TextField(blank=True, null=True)

    def __str__(self):
        return f"Media {self.instagram_media_id} ({self.media_type}) - Brand: {self.account.brand.name}"

class InstagramComment(models.Model):
    media = models.ForeignKey(InstagramMedia, on_delete=models.CASCADE, related_name='comments')
    instagram_comment_id = models.CharField(max_length=255, unique=True)
    username = models.CharField(max_length=150)
    text = models.TextField()
    posted_at = models.DateTimeField()
    
    # Rule‑based intent flags
    asks_price = models.BooleanField(default=False)
    asks_availability = models.BooleanField(default=False)
    asks_color = models.BooleanField(default=False)
    asks_size = models.BooleanField(default=False)
    asks_delivery = models.BooleanField(default=False)
    has_complaint = models.BooleanField(default=False)
    
    # Multiple detected values
    detected_colors = models.JSONField(default=list, blank=True)
    detected_sizes = models.JSONField(default=list, blank=True)
    
    # Raw API payload for debugging / extensibility
    analysis_payload = models.JSONField(default=dict, blank=True)

    def __str__(self):
        return f"Comment {self.instagram_comment_id} on Media {self.media.instagram_media_id}"

class MediaAnalysis(models.Model):
    media = models.OneToOneField(InstagramMedia, on_delete=models.CASCADE, related_name='analysis')
    comments_count = models.IntegerField(default=0)
    price_comments_count = models.IntegerField(default=0)
    availability_comments_count = models.IntegerField(default=0)
    color_comments_count = models.IntegerField(default=0)
    size_comments_count = models.IntegerField(default=0)
    delivery_comments_count = models.IntegerField(default=0)
    negative_feedback_count = models.IntegerField(default=0)
    final_score = models.FloatField(default=0.0)
    last_analyzed_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Analysis for {self.media.instagram_media_id} (score={self.final_score})"

class InstagramCompetitor(models.Model):
    brand = models.ForeignKey(Brand, on_delete=models.CASCADE, related_name='competitors')
    username = models.CharField(max_length=255, unique=True)
    followers_count = models.IntegerField(default=0)
    is_active = models.BooleanField(default=True)
    last_sync_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    
    def __str__(self):
        return f"Competitor {self.username} for Brand {self.brand.name}"

class InstagramCompetitorMedia(models.Model):
    SELECTION_SOURCE_CHOICES = [
        ('ai', 'AI Selected'),
        ('user', 'User Saved'),
    ]
    
    competitor = models.ForeignKey(InstagramCompetitor, on_delete=models.CASCADE, related_name='media')
    instagram_media_id = models.CharField(max_length=255, unique=True)
    caption = models.TextField(blank=True)
    media_type = models.CharField(max_length=50)  # IMAGE, VIDEO, CAROUSEL_ALBUM, REEL
    media_url = models.URLField(max_length=3000)
    thumbnail_url = models.URLField(max_length=3000, blank=True, null=True)
    permalink = models.URLField(max_length=3000)
    posted_at = models.DateTimeField()
    like_count = models.IntegerField(default=0)
    comments_count = models.IntegerField(default=0)
    engagement_score = models.FloatField(default=0.0)
    
    # AI scoring and candidate promotion
    ai_score = models.FloatField(default=0.0)  # Overall AI score (0-100)
    ai_score_details = models.JSONField(default=dict, blank=True)  # Detailed scoring breakdown
    ai_analysis = models.JSONField(default=dict, blank=True)  # Full AI analysis (vision, manufacturing, business decision)
    is_candidate = models.BooleanField(default=False)  # Promoted to candidates
    selection_source = models.CharField(max_length=20, choices=SELECTION_SOURCE_CHOICES, null=True, blank=True)
    selected_at = models.DateTimeField(null=True, blank=True)
    
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"CompetitorMedia {self.instagram_media_id} - Competitor: {self.competitor.username}"


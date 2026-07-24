from rest_framework import serializers
from core.models import Brand
from products.models import Product
from instagram.models import InstagramAccount, InstagramMedia, InstagramComment, MediaAnalysis, InstagramCompetitor, InstagramCompetitorMedia

class BrandSerializer(serializers.ModelSerializer):
    class Meta:
        model = Brand
        fields = ['id', 'name', 'slug']

class ProductSerializer(serializers.ModelSerializer):
    class Meta:
        model = Product
        fields = ['id', 'shopify_product_id', 'title', 'handle', 'description', 'price', 'image_url']

class InstagramAccountSerializer(serializers.ModelSerializer):
    brand = BrandSerializer(read_only=True)
    class Meta:
        model = InstagramAccount
        fields = [
            'id', 'brand', 'facebook_page_id', 'facebook_page_name', 
            'instagram_business_account_id', 'instagram_username', 
            'is_active', 'last_sync_at', 'created_at'
        ]

class MediaAnalysisSerializer(serializers.ModelSerializer):
    class Meta:
        model = MediaAnalysis
        fields = [
            'comments_count', 'price_comments_count', 'availability_comments_count', 
            'color_comments_count', 'size_comments_count', 'delivery_comments_count', 
            'negative_feedback_count', 'final_score', 'last_analyzed_at'
        ]

class InstagramCommentSerializer(serializers.ModelSerializer):
    class Meta:
        model = InstagramComment
        fields = [
            'id', 'instagram_comment_id', 'username', 'text', 'posted_at',
            'asks_price', 'asks_availability', 'asks_color', 'asks_size', 
            'asks_delivery', 'has_complaint', 'detected_colors', 'detected_sizes'
        ]

class InstagramMediaSerializer(serializers.ModelSerializer):
    analysis = MediaAnalysisSerializer(read_only=True)
    linked_product = ProductSerializer(read_only=True)
    account_username = serializers.CharField(source='account.instagram_username', read_only=True)
    
    class Meta:
        model = InstagramMedia
        fields = [
            'id', 'instagram_media_id', 'account_username', 'caption', 'media_type', 
            'media_url', 'thumbnail_url', 'permalink', 'posted_at', 
            'comments_count', 'like_count', 'is_candidate', 'linked_product',
            'sync_status', 'last_synced_at', 'comments_synced_at',
            'analysis_status', 'analysis_error', 'analysis'
        ]

class InstagramCompetitorSerializer(serializers.ModelSerializer):
    class Meta:
        model = InstagramCompetitor
        fields = ['id', 'username', 'followers_count', 'is_active', 'last_sync_at', 'created_at']

class InstagramCompetitorMediaSerializer(serializers.ModelSerializer):
    competitor_username = serializers.CharField(source='competitor.username', read_only=True)
    class Meta:
        model = InstagramCompetitorMedia
        fields = [
            'id', 'competitor_username', 'instagram_media_id', 'caption', 'media_type',
            'media_url', 'thumbnail_url', 'permalink', 'posted_at',
            'like_count', 'comments_count', 'engagement_score',
            'ai_score', 'ai_score_details', 'ai_analysis', 'is_candidate', 'selection_source', 'selected_at',
            'created_at'
        ]

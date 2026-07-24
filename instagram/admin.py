from django.contrib import admin
from instagram.models import InstagramAccount, InstagramMedia, InstagramComment, MediaAnalysis
from instagram.tasks import sync_recent_media_for_account, sync_comments_for_media, analyze_comments_for_media

@admin.register(InstagramAccount)
class InstagramAccountAdmin(admin.ModelAdmin):
    list_display = ('brand', 'instagram_username', 'facebook_page_name', 'is_active', 'last_sync_at', 'created_at')
    list_filter = ('is_active', 'brand')
    search_fields = ('instagram_username', 'facebook_page_name', 'brand__name')
    readonly_fields = ('created_at', 'last_sync_at')
    
    actions = ['trigger_manual_sync']

    @admin.action(description="Trigger manual sync of recent media")
    def trigger_manual_sync(self, request, queryset):
        for account in queryset:
            sync_recent_media_for_account.delay(account.id)
        self.message_user(request, f"Manual sync task scheduled for {queryset.count()} accounts.")

@admin.register(InstagramMedia)
class InstagramMediaAdmin(admin.ModelAdmin):
    list_display = (
        'instagram_media_id', 'account', 'media_type', 'like_count', 
        'comments_count', 'is_candidate', 'linked_product', 'sync_status', 'analysis_status'
    )
    list_filter = ('media_type', 'is_candidate', 'sync_status', 'analysis_status', 'account__brand')
    search_fields = ('instagram_media_id', 'caption', 'account__instagram_username')
    readonly_fields = ('last_synced_at', 'comments_synced_at', 'analysis_error')
    
    actions = ['mark_as_candidate', 'unmark_as_candidate', 'trigger_comment_sync']

    @admin.action(description="Mark selected media as test candidates")
    def mark_as_candidate(self, request, queryset):
        updated = queryset.update(is_candidate=True)
        self.message_user(request, f"{updated} media items successfully marked as candidates.")

    @admin.action(description="Unmark selected media as test candidates")
    def unmark_as_candidate(self, request, queryset):
        updated = queryset.update(is_candidate=False)
        self.message_user(request, f"{updated} media items unmarked.")

    @admin.action(description="Trigger manual comments fetch and analysis")
    def trigger_comment_sync(self, request, queryset):
        for media in queryset:
            sync_comments_for_media.delay(media.id)
        self.message_user(request, f"Comments fetch scheduled for {queryset.count()} media items.")

@admin.register(InstagramComment)
class InstagramCommentAdmin(admin.ModelAdmin):
    list_display = (
        'instagram_comment_id', 'media', 'username', 'posted_at',
        'asks_price', 'asks_availability', 'asks_color', 'asks_size', 'asks_delivery', 'has_complaint'
    )
    list_filter = ('asks_price', 'asks_availability', 'asks_color', 'asks_size', 'asks_delivery', 'has_complaint')
    search_fields = ('username', 'text', 'instagram_comment_id', 'media__instagram_media_id')
    readonly_fields = ('posted_at',)

@admin.register(MediaAnalysis)
class MediaAnalysisAdmin(admin.ModelAdmin):
    list_display = (
        'media', 'final_score', 'comments_count', 'price_comments_count',
        'availability_comments_count', 'color_comments_count', 'size_comments_count',
        'delivery_comments_count', 'negative_feedback_count', 'last_analyzed_at'
    )
    list_filter = ('last_analyzed_at', 'media__account__brand')
    ordering = ('-final_score',)
    readonly_fields = ('last_analyzed_at',)

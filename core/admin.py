from django.contrib import admin
from core.models import Brand, PlatformSettings

@admin.register(Brand)
class BrandAdmin(admin.ModelAdmin):
    list_display = ('name', 'slug', 'created_at')
    prepopulated_fields = {'slug': ('name',)}
    search_fields = ('name', 'slug')

@admin.register(PlatformSettings)
class PlatformSettingsAdmin(admin.ModelAdmin):
    list_display = ('candidate_threshold', 'sync_frequency', 'auto_shopify_integration', 'updated_at')
    list_filter = ('sync_frequency', 'auto_shopify_integration')
    search_fields = ('analysis_language',)

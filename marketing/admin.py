from django.contrib import admin
from marketing.models import MetaAdAccount, ProductTest, MetaAdCreative, MetaCampaign, MetaAdSet, MetaAd, MarketingOrder, MetaAdPerformanceInsight

@admin.register(MetaAdAccount)
class MetaAdAccountAdmin(admin.ModelAdmin):
    list_display = ('ad_account_id', 'brand', 'name', 'is_active', 'last_sync_at')
    list_filter = ('brand', 'is_active')
    search_fields = ('ad_account_id', 'name')

@admin.register(ProductTest)
class ProductTestAdmin(admin.ModelAdmin):
    list_display = ('test_id', 'product', 'created_at', 'status')
    list_filter = ('status',)
    search_fields = ('test_id', 'product__title')

@admin.register(MetaAdCreative)
class MetaAdCreativeAdmin(admin.ModelAdmin):
    list_display = ('creative_id', 'name', 'format', 'hook_type', 'editing_style')
    list_filter = ('format', 'hook_type')
    search_fields = ('creative_id', 'name')

@admin.register(MetaCampaign)
class MetaCampaignAdmin(admin.ModelAdmin):
    list_display = ('campaign_id', 'ad_account', 'name', 'status', 'objective', 'linked_test')
    list_filter = ('status', 'objective')
    search_fields = ('campaign_id', 'name', 'linked_test__test_id')

@admin.register(MetaAdSet)
class MetaAdSetAdmin(admin.ModelAdmin):
    list_display = ('adset_id', 'campaign', 'name', 'status', 'daily_budget', 'lifetime_budget')
    list_filter = ('status',)
    search_fields = ('adset_id', 'name', 'campaign__name')

@admin.register(MetaAd)
class MetaAdAdmin(admin.ModelAdmin):
    list_display = ('ad_id', 'adset', 'name', 'status', 'creative', 'creative_id')
    list_filter = ('status',)
    search_fields = ('ad_id', 'name', 'adset__name')

@admin.register(MarketingOrder)
class MarketingOrderAdmin(admin.ModelAdmin):
    list_display = ('order_id', 'campaign', 'ad', 'product', 'price', 'call_center_status', 'delivery_status', 'is_returned')
    list_filter = ('call_center_status', 'delivery_status', 'is_returned')
    search_fields = ('order_id', 'campaign__name', 'ad__name', 'product__title')

@admin.register(MetaAdPerformanceInsight)
class MetaAdPerformanceInsightAdmin(admin.ModelAdmin):
    list_display = ('campaign', 'ad', 'date', 'spend', 'purchases', 'confirmed_purchases', 'delivered_purchases', 'net_profit')
    list_filter = ('date',)
    search_fields = ('campaign__name', 'ad__name')

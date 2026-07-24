from rest_framework import serializers
from core.models import Brand
from products.models import Product
from instagram.serializers import BrandSerializer, ProductSerializer
from marketing.models import (
    MetaAdAccount, ProductTest, MetaAdCreative, 
    MetaCampaign, MetaAdSet, MetaAd, MetaAdPerformanceInsight
)

class MetaAdAccountSerializer(serializers.ModelSerializer):
    brand = BrandSerializer(read_only=True)
    
    class Meta:
        model = MetaAdAccount
        fields = ['id', 'brand', 'ad_account_id', 'name', 'is_active', 'last_sync_at', 'created_at']


class ProductTestSerializer(serializers.ModelSerializer):
    product = ProductSerializer(read_only=True)
    
    class Meta:
        model = ProductTest
        fields = ['id', 'test_id', 'product', 'created_at', 'status', 'notes']


class MetaAdCreativeSerializer(serializers.ModelSerializer):
    class Meta:
        model = MetaAdCreative
        fields = [
            'id', 'creative_id', 'name', 'image_url', 'video_url', 'body', 'title',
            'format', 'hook_type', 'has_model', 'video_duration', 'editing_style', 'language'
        ]


class MetaCampaignSerializer(serializers.ModelSerializer):
    ad_account = MetaAdAccountSerializer(read_only=True)
    linked_test = ProductTestSerializer(read_only=True)
    
    class Meta:
        model = MetaCampaign
        fields = [
            'id', 'campaign_id', 'ad_account', 'name', 'status', 
            'objective', 'linked_test', 'created_time', 'updated_time', 'synced_at'
        ]


class MetaAdSetSerializer(serializers.ModelSerializer):
    class Meta:
        model = MetaAdSet
        fields = [
            'id', 'adset_id', 'campaign', 'name', 'status', 'daily_budget', 
            'lifetime_budget', 'optimization_goal', 'billing_event', 'created_time', 'updated_time'
        ]


class MetaAdSerializer(serializers.ModelSerializer):
    creative = MetaAdCreativeSerializer(read_only=True)
    
    class Meta:
        model = MetaAd
        fields = ['id', 'ad_id', 'adset', 'name', 'status', 'creative_id', 'creative', 'created_time', 'updated_time']


class MetaAdPerformanceInsightSerializer(serializers.ModelSerializer):
    campaign_name = serializers.CharField(source='campaign.name', read_only=True)
    ad_name = serializers.CharField(source='ad.name', read_only=True)
    
    class Meta:
        model = MetaAdPerformanceInsight
        fields = [
            'id', 'campaign', 'campaign_name', 'ad', 'ad_name', 'date', 
            'spend', 'impressions', 'clicks', 'reach', 
            'purchases', 'purchases_value',
            'confirmed_purchases', 'delivered_purchases', 'returned_purchases',
            'total_cogs', 'total_call_center_cost', 'total_shipping_cost', 'total_return_cost',
            'total_expenses', 'net_profit',
            'ctr', 'cpc', 'cpm', 'cost_per_result', 'roas'
        ]

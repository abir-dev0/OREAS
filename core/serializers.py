from rest_framework import serializers
from core.models import Brand, PlatformSettings


class BrandSerializer(serializers.ModelSerializer):
    class Meta:
        model = Brand
        fields = ['id', 'name', 'slug', 'created_at']
        read_only_fields = ['id', 'created_at']


class PlatformSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = PlatformSettings
        fields = [
            'id',
            'candidate_threshold',
            'sync_frequency',
            'auto_shopify_integration',
            'analysis_language',
            'updated_at'
        ]
        read_only_fields = ['id', 'updated_at']

from rest_framework import serializers
from excel_sync.models import ExcelSyncSettings, OneDriveToken
from orders.models import SyncLog, Order
from orders.serializers import SyncLogSerializer

class ExcelSyncSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = ExcelSyncSettings
        fields = [
            'id', 'is_active', 'file_item_id', 'file_name', 'sheet_name',
            'header_row', 'unique_key_field', 'column_mapping',
            'last_sync_at', 'last_successful_sync', 'last_failed_sync',
            'last_error', 'updated_at'
        ]

class ExcelSyncDashboardSerializer(serializers.Serializer):
    """
    Enterprise Synchronization Dashboard Telemetry Serializer.
    """
    is_active = serializers.BooleanField()
    last_sync_at = serializers.DateTimeField(allow_null=True)
    next_scheduled_sync = serializers.DateTimeField(allow_null=True)
    last_successful_sync = serializers.DateTimeField(allow_null=True)
    last_failed_sync = serializers.DateTimeField(allow_null=True)
    last_error = serializers.CharField(allow_blank=True)
    
    # Account & File metadata
    connected_user_email = serializers.CharField(allow_blank=True)
    connected_user_name = serializers.CharField(allow_blank=True)
    file_name = serializers.CharField(allow_blank=True)
    sheet_name = serializers.CharField(allow_blank=True)

    # Telemetry Counters
    total_imported = serializers.IntegerField()
    total_updated = serializers.IntegerField()
    total_skipped = serializers.IntegerField()
    total_archived = serializers.IntegerField()
    total_conflicts = serializers.IntegerField()
    total_orders_in_db = serializers.IntegerField()
    sync_duration_seconds = serializers.FloatField(allow_null=True)

    # Validation & Diagnostics
    validation_errors = serializers.ListField(child=serializers.DictField(), default=list)

    # Status Indicators
    current_webhook_status = serializers.CharField()
    webhook_expires_at = serializers.DateTimeField(allow_null=True)
    current_oauth_token_status = serializers.CharField()
    manual_sync_button_enabled = serializers.BooleanField()

    # Recent Audit Logs
    last_sync_logs = SyncLogSerializer(many=True, default=list)

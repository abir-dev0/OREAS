from django.contrib import admin
from orders.models import Order, OrderSyncHistory, SyncLog

@admin.register(OrderSyncHistory)
class OrderSyncHistoryAdmin(admin.ModelAdmin):
    list_display = ('order', 'source_row_number', 'created_at')
    readonly_fields = ('order', 'sync_log', 'raw_payload', 'source_row_number', 'created_at')

@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = (
        'order_number', 'customer_name', 'source_system', 'status',
        'is_archived', 'has_conflict', 'is_manually_edited', 'total_price', 'order_date'
    )
    list_filter = ('source_system', 'status', 'is_archived', 'has_conflict', 'is_manually_edited', 'order_date')
    search_fields = ('order_number', 'customer_name', 'customer_phone', 'product_name')
    readonly_fields = ('imported_at', 'last_synced_at', 'created_at', 'updated_at')

@admin.register(SyncLog)
class SyncLogAdmin(admin.ModelAdmin):
    list_display = (
        'source', 'status', 'duration_seconds', 'imported_count',
        'updated_count', 'skipped_count', 'archived_count', 'conflict_count', 'failed_count', 'started_at'
    )
    list_filter = ('source', 'status', 'started_at')
    readonly_fields = ('started_at', 'completed_at', 'duration_seconds', 'validation_report', 'details')

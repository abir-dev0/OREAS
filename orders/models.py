from django.db import models
from django.utils import timezone

class Order(models.Model):
    SOURCE_CHOICES = [
        ('excel_online', 'Excel Online'),
        ('shopify', 'Shopify'),
        ('whatsapp', 'WhatsApp'),
        ('google_sheets', 'Google Sheets'),
        ('manual', 'Manual Entry'),
        ('api', 'External API'),
    ]

    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('confirmed', 'Confirmed'),
        ('processing', 'Processing'),
        ('shipped', 'Shipped'),
        ('delivered', 'Delivered'),
        ('cancelled', 'Cancelled'),
        ('returned', 'Returned'),
    ]

    # Core Identifiers
    order_number = models.CharField(max_length=100, unique=True, db_index=True, help_text="Unique business identifier for the order")
    
    # Customer Details
    customer_name = models.CharField(max_length=255, blank=True, default='')
    customer_phone = models.CharField(max_length=100, blank=True, default='')
    customer_email = models.EmailField(blank=True, default='')
    
    # Order Attributes
    source = models.CharField(max_length=50, choices=SOURCE_CHOICES, default='excel_online')
    product_name = models.CharField(max_length=255, blank=True, default='')
    quantity = models.IntegerField(default=1)
    total_price = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    status = models.CharField(max_length=50, choices=STATUS_CHOICES, default='pending')
    order_date = models.DateTimeField(null=True, blank=True)
    extra_attributes = models.JSONField(default=dict, blank=True, help_text="Unmapped custom fields from source")

    # Enterprise Requirement 3: Source Tracking Metadata
    source_system = models.CharField(max_length=50, default='excel_online', db_index=True)
    source_file_id = models.CharField(max_length=255, blank=True, default='')
    source_row_number = models.IntegerField(null=True, blank=True)
    source_last_modified = models.DateTimeField(null=True, blank=True)
    imported_at = models.DateTimeField(default=timezone.now)
    last_synced_at = models.DateTimeField(null=True, blank=True)

    # Enterprise Requirement 2: Soft Deletion
    is_archived = models.BooleanField(default=False, db_index=True)
    archived_at = models.DateTimeField(null=True, blank=True)
    archived_reason = models.CharField(max_length=255, blank=True, default='')

    # Enterprise Requirement 4: Sync Conflict Detection
    is_manually_edited = models.BooleanField(default=False, help_text="Set to True if edited inside OREAS after last sync")
    has_conflict = models.BooleanField(default=False, db_index=True, help_text="Set to True if incoming sync data conflicts with manual edits")
    conflict_data = models.JSONField(default=dict, blank=True, help_text="Stores local vs incoming conflicting field values")

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-order_date', '-created_at']
        verbose_name = "Order"
        verbose_name_plural = "Orders"

    def __str__(self):
        return f"Order #{self.order_number} - {self.customer_name} ({self.source_system})"


class OrderSyncHistory(models.Model):
    """
    Enterprise Requirement 1: Audit history preserving raw imported payloads per sync version.
    """
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='history')
    sync_log = models.ForeignKey('SyncLog', null=True, blank=True, on_delete=models.SET_NULL, related_name='order_histories')
    raw_payload = models.JSONField(default=dict, help_text="Complete raw row values as imported from source")
    source_row_number = models.IntegerField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name = "Order Sync History"
        verbose_name_plural = "Order Sync Histories"

    def __str__(self):
        return f"History for Order #{self.order.order_number} @ {self.created_at.strftime('%Y-%m-%d %H:%M:%S')}"


class SyncLog(models.Model):
    """
    Detailed execution telemetry audit log.
    """
    STATUS_CHOICES = [
        ('running', 'Running'),
        ('success', 'Success'),
        ('failed', 'Failed'),
        ('partial', 'Partial Failure'),
    ]

    source = models.CharField(max_length=50, default='excel_online')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='running')
    started_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    duration_seconds = models.FloatField(null=True, blank=True)

    # Telemetry Counters
    imported_count = models.IntegerField(default=0, help_text="New orders created")
    updated_count = models.IntegerField(default=0, help_text="Existing orders updated")
    skipped_count = models.IntegerField(default=0, help_text="Unchanged orders skipped")
    archived_count = models.IntegerField(default=0, help_text="Disappeared orders soft-deleted")
    conflict_count = models.IntegerField(default=0, help_text="Orders flagged with sync conflicts")
    failed_count = models.IntegerField(default=0, help_text="Rows failing validation")

    # Enterprise Requirement 5: Data Validation Report
    validation_report = models.JSONField(default=list, blank=True, help_text="List of row validation issues")
    error_message = models.TextField(blank=True, default='')
    details = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ['-started_at']
        verbose_name = "Sync Log"
        verbose_name_plural = "Sync Logs"

    def __str__(self):
        return f"SyncLog [{self.source}] - {self.status} @ {self.started_at.strftime('%Y-%m-%d %H:%M:%S')}"

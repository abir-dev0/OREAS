from django.db import models
from django.utils import timezone
from core.encryption import encrypt_value, decrypt_value

class OneDriveToken(models.Model):
    """
    Stores encrypted OAuth tokens for personal Microsoft OneDrive integration.
    """
    user_email = models.EmailField(blank=True, default='')
    user_name = models.CharField(max_length=255, blank=True, default='')
    
    access_token_encrypted = models.TextField()
    refresh_token_encrypted = models.TextField()
    expires_at = models.DateTimeField()
    
    # Webhook Subscription State
    subscription_id = models.CharField(max_length=255, blank=True, default='')
    subscription_expires_at = models.DateTimeField(null=True, blank=True)
    client_state = models.CharField(max_length=255, blank=True, default='')
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def set_tokens(self, access_token: str, refresh_token: str, expires_in_seconds: int):
        self.access_token_encrypted = encrypt_value(access_token)
        self.refresh_token_encrypted = encrypt_value(refresh_token)
        self.expires_at = timezone.now() + timezone.timedelta(seconds=expires_in_seconds)

    def get_access_token(self) -> str:
        return decrypt_value(self.access_token_encrypted)

    def get_refresh_token(self) -> str:
        return decrypt_value(self.refresh_token_encrypted)

    @property
    def is_access_token_valid(self) -> bool:
        if not self.expires_at:
            return False
        # Buffer 5 minutes
        return timezone.now() + timezone.timedelta(minutes=5) < self.expires_at

    @property
    def is_webhook_active(self) -> bool:
        if not self.subscription_id or not self.subscription_expires_at:
            return False
        return timezone.now() < self.subscription_expires_at

    @property
    def token_status(self) -> str:
        if not self.access_token_encrypted:
            return 'disconnected'
        if timezone.now() >= self.expires_at:
            return 'expired'
        if timezone.now() + timezone.timedelta(minutes=15) >= self.expires_at:
            return 'expiring_soon'
        return 'valid'

    def __str__(self):
        return f"OneDriveToken ({self.user_email or 'Connected User'}) - {self.token_status}"


class ExcelSyncSettings(models.Model):
    """
    Configuration and telemetry state for Excel Online Synchronization.
    """
    is_active = models.BooleanField(default=True, help_text="Master toggle to enable or disable Excel Online sync")
    file_item_id = models.CharField(max_length=255, blank=True, default='', help_text="OneDrive File item_id")
    file_name = models.CharField(max_length=255, blank=True, default='', help_text="Human readable file name")
    sheet_name = models.CharField(max_length=255, blank=True, default='', help_text="Specific sheet name or blank for first sheet")
    header_row = models.IntegerField(default=1, help_text="Row index containing column headers (1-based)")
    unique_key_field = models.CharField(max_length=100, default='order_number', help_text="Order model field used for deduplication")
    
    # Share Link Auto-Sync Configuration (No Azure Needed)
    share_url = models.URLField(max_length=1024, blank=True, default='', help_text="OneDrive / SharePoint / Google Drive public or shared view link")
    auto_sync_enabled = models.BooleanField(default=True, help_text="Enable automatic background periodic fetching from share_url")
    sync_interval_minutes = models.IntegerField(default=10, help_text="Periodic sync interval in minutes")

    # Dynamic Column Mapping: {"Excel Header Name": "order_model_field_name"}
    column_mapping = models.JSONField(
        default=dict,
        blank=True,
        help_text="JSON object mapping Excel headers (key) to Order model attributes (value)"
    )

    # Historical Telemetry State
    last_sync_at = models.DateTimeField(null=True, blank=True)
    last_successful_sync = models.DateTimeField(null=True, blank=True)
    last_failed_sync = models.DateTimeField(null=True, blank=True)
    last_error = models.TextField(blank=True, default='')

    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Excel Sync Settings"
        verbose_name_plural = "Excel Sync Settings"

    def __str__(self):
        status_str = "Active" if self.is_active else "Disabled"
        return f"ExcelSyncSettings ({status_str}) - File: {self.file_name or 'Unset'}"

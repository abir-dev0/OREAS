from django.contrib import admin
from excel_sync.models import OneDriveToken, ExcelSyncSettings

@admin.register(OneDriveToken)
class OneDriveTokenAdmin(admin.ModelAdmin):
    list_display = ('user_email', 'user_name', 'token_status', 'is_webhook_active', 'expires_at', 'updated_at')
    readonly_fields = ('access_token_encrypted', 'refresh_token_encrypted', 'expires_at', 'created_at', 'updated_at')

@admin.register(ExcelSyncSettings)
class ExcelSyncSettingsAdmin(admin.ModelAdmin):
    list_display = ('is_active', 'file_name', 'unique_key_field', 'last_sync_at', 'last_successful_sync', 'last_failed_sync')
    list_filter = ('is_active',)
    readonly_fields = ('last_sync_at', 'last_successful_sync', 'last_failed_sync', 'last_error', 'updated_at')

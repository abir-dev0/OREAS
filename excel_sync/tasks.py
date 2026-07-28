import logging
from celery import shared_task
from django.utils import timezone
from excel_sync.models import OneDriveToken, ExcelSyncSettings
from excel_sync.oauth import ensure_valid_token
from excel_sync.graph import MicrosoftGraphFilesClient
from excel_sync.parser import ExcelOnlineAdapter
from orders.services.importer import OrderImportService

logger = logging.getLogger(__name__)

@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def sync_excel_to_db(self, trigger_source: str = 'webhook'):
    """
    Background Celery task to synchronize Excel Online workbook to PostgreSQL.
    Strictly read-only with respect to Excel.
    """
    settings_obj = ExcelSyncSettings.objects.first()
    if not settings_obj or not settings_obj.is_active:
        logger.info("Excel sync is disabled or unconfigured. Exiting task.")
        return {"status": "skipped", "reason": "Sync disabled or unconfigured"}

    # Option A: Check if share_url is configured (Zero Azure mode)
    if settings_obj.share_url and settings_obj.auto_sync_enabled:
        try:
            logger.info(f"Downloading workbook from share link: {settings_obj.share_url}...")
            from excel_sync.utils import fetch_excel_bytes_from_url
            xlsx_bytes, filename = fetch_excel_bytes_from_url(settings_obj.share_url)
            
            if filename:
                settings_obj.file_name = filename
                settings_obj.save()

            adapter = ExcelOnlineAdapter(settings_obj)
            normalized_records = adapter.parse_workbook(xlsx_bytes)
            
            importer = OrderImportService(source_name='excel_online')
            sync_log = importer.process_import(
                normalized_records=normalized_records,
                unique_key_field=settings_obj.unique_key_field or 'order_number',
                metadata={
                    'file_id': settings_obj.share_url,
                    'last_modified': timezone.now()
                }
            )

            now = timezone.now()
            settings_obj.last_sync_at = now
            if sync_log.status in ('success', 'partial'):
                settings_obj.last_successful_sync = now
                settings_obj.last_error = sync_log.error_message or ''
            else:
                settings_obj.last_failed_sync = now
                settings_obj.last_error = sync_log.error_message or 'Link import failed'
            settings_obj.save()

            return {
                "status": sync_log.status,
                "mode": "share_url",
                "sync_log_id": sync_log.id,
                "imported": sync_log.imported_count,
                "updated": sync_log.updated_count,
                "skipped": sync_log.skipped_count,
                "failed": sync_log.failed_count,
            }
        except Exception as e:
            logger.error(f"Share link sync failed: {e}", exc_info=True)
            now = timezone.now()
            settings_obj.last_sync_at = now
            settings_obj.last_failed_sync = now
            settings_obj.last_error = str(e)
            settings_obj.save()
            return {"status": "failed", "reason": str(e)}

    # Option B: Graph API Mode
    if not settings_obj.file_item_id:
        logger.warning("No OneDrive file_item_id or share_url configured for Excel sync.")
        return {"status": "skipped", "reason": "Missing configuration"}

    token_record = OneDriveToken.objects.first()
    if not token_record or not token_record.access_token_encrypted:
        logger.error("No active OneDrive OAuth token found.")
        settings_obj.last_failed_sync = timezone.now()
        settings_obj.last_error = "OAuth token missing or disconnected"
        settings_obj.save()
        return {"status": "failed", "reason": "No OAuth token"}

    try:
        # Step 1: Ensure valid token
        access_token = ensure_valid_token(token_record)
        client = MicrosoftGraphFilesClient(access_token)

        # Step 2: Download .xlsx binary (Read-only GET)
        logger.info(f"Downloading workbook (item_id: {settings_obj.file_item_id})...")
        xlsx_bytes = client.download_workbook(settings_obj.file_item_id)

        # Step 3: Normalize using ExcelOnlineAdapter
        adapter = ExcelOnlineAdapter(settings_obj)
        normalized_records = adapter.parse_workbook(xlsx_bytes)
        logger.info(f"Parsed {len(normalized_records)} records from Excel.")

        # Step 4: Import via generic OrderImportService with enterprise metadata
        importer = OrderImportService(source_name='excel_online')
        sync_log = importer.process_import(
            normalized_records=normalized_records,
            unique_key_field=settings_obj.unique_key_field or 'order_number',
            metadata={
                'file_id': settings_obj.file_item_id,
                'last_modified': timezone.now()
            }
        )

        # Step 5: Update Telemetry State
        now = timezone.now()
        settings_obj.last_sync_at = now

        if sync_log.status in ('success', 'partial'):
            settings_obj.last_successful_sync = now
            settings_obj.last_error = sync_log.error_message or ''
        else:
            settings_obj.last_failed_sync = now
            settings_obj.last_error = sync_log.error_message or 'Import failed'

        settings_obj.save()

        return {
            "status": sync_log.status,
            "sync_log_id": sync_log.id,
            "imported": sync_log.imported_count,
            "updated": sync_log.updated_count,
            "skipped": sync_log.skipped_count,
            "failed": sync_log.failed_count,
        }

    except Exception as e:
        logger.error(f"Excel sync failed: {e}", exc_info=True)
        now = timezone.now()
        settings_obj.last_sync_at = now
        settings_obj.last_failed_sync = now
        settings_obj.last_error = str(e)
        settings_obj.save()
        raise self.retry(exc=e)


@shared_task
def renew_onedrive_webhook():
    """
    Celery Beat task to renew the 3-day OneDrive change notification subscription.
    Runs every 2 days.
    """
    token_record = OneDriveToken.objects.first()
    if not token_record or not token_record.subscription_id:
        return "No subscription to renew."

    try:
        access_token = ensure_valid_token(token_record)
        client = MicrosoftGraphFilesClient(access_token)
        res = client.renew_change_subscription(token_record.subscription_id)

        exp_str = res.get("expirationDateTime")
        if exp_str:
            dt = timezone.datetime.fromisoformat(exp_str.replace("Z", "+00:00"))
            token_record.subscription_expires_at = dt
            token_record.save()

        return f"Subscription renewed until {exp_str}"
    except Exception as e:
        logger.error(f"Failed to renew webhook subscription: {e}")
        return f"Renewal failed: {e}"


@shared_task
def refresh_onedrive_tokens():
    """
    Celery Beat task to silently refresh OneDrive access token.
    Runs every 50 minutes.
    """
    token_record = OneDriveToken.objects.first()
    if not token_record or not token_record.refresh_token_encrypted:
        return "No refresh token available."

    try:
        ensure_valid_token(token_record)
        return "Token refreshed successfully."
    except Exception as e:
        logger.error(f"Token refresh background task failed: {e}")
        return f"Refresh failed: {e}"

import os
import secrets
import logging
from django.utils import timezone
from django.http import HttpResponse, JsonResponse
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from excel_sync.models import OneDriveToken, ExcelSyncSettings
from excel_sync.oauth import build_authorization_url, exchange_code_for_tokens, get_ms_redirect_uri
from excel_sync.graph import MicrosoftGraphFilesClient
from excel_sync.parser import ExcelOnlineAdapter
from excel_sync.serializers import ExcelSyncSettingsSerializer, ExcelSyncDashboardSerializer
from excel_sync.tasks import sync_excel_to_db
from orders.models import Order, SyncLog

logger = logging.getLogger(__name__)

# Temporary memory store for PKCE verifiers during OAuth flow
_PKCE_STORE = {}

class OAuthStartView(APIView):
    """
    Initiates Microsoft OAuth 2.0 PKCE flow.
    GET /api/excel-sync/oauth/start/
    """
    def get(self, request):
        state = secrets.token_urlsafe(16)
        auth_url, code_verifier = build_authorization_url(state=state)
        _PKCE_STORE[state] = code_verifier
        
        return Response({
            "authorization_url": auth_url,
            "state": state,
            "instructions": "Navigate to authorization_url in browser to authorize OREAS."
        })


class OAuthCallbackView(APIView):
    """
    Receives OAuth callback code from Microsoft.
    GET /api/excel-sync/oauth/callback/?code=...&state=...
    """
    def get(self, request):
        code = request.GET.get('code')
        state = request.GET.get('state')
        error = request.GET.get('error')
        error_description = request.GET.get('error_description')

        if error:
            return Response({"error": error, "description": error_description}, status=status.HTTP_400_BAD_REQUEST)

        if not code:
            return Response({"error": "Missing authorization code"}, status=status.HTTP_400_BAD_REQUEST)

        code_verifier = _PKCE_STORE.pop(state, None) if state else None
        if not code_verifier:
            # Fallback if state expired or lost: generate dummy or reject
            return Response({"error": "Invalid or expired OAuth state parameter."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            tokens = exchange_code_for_tokens(code, code_verifier)
            access_token = tokens['access_token']
            refresh_token = tokens.get('refresh_token', '')
            expires_in = tokens.get('expires_in', 3600)

            # Retrieve user profile
            graph_client = MicrosoftGraphFilesClient(access_token)
            profile = graph_client.get_user_profile()

            token_record, _ = OneDriveToken.objects.get_or_create(pk=1)
            token_record.user_email = profile.get('userPrincipalName') or profile.get('mail') or ''
            token_record.user_name = profile.get('displayName', '')
            token_record.set_tokens(access_token, refresh_token, expires_in)
            token_record.save()

            return Response({
                "message": "OneDrive OAuth authentication successful!",
                "user_email": token_record.user_email,
                "user_name": token_record.user_name,
                "token_status": token_record.token_status
            })

        except Exception as e:
            logger.error(f"OAuth callback failed: {e}", exc_info=True)
            return Response({"error": "Failed to exchange tokens", "details": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class WebhookNotificationView(APIView):
    """
    OneDrive Change Notification Webhook endpoint.
    Handles Microsoft validation check (validationToken query param)
    and receives POST push notifications when workbook updates.
    """
    def get(self, request):
        validation_token = request.GET.get('validationToken')
        if validation_token:
            # Graph API validation check requires plain text response with validationToken
            return HttpResponse(validation_token, content_type='text/plain', status=200)
        return Response({"status": "ready"})

    def post(self, request):
        validation_token = request.GET.get('validationToken')
        if validation_token:
            return HttpResponse(validation_token, content_type='text/plain', status=200)

        data = request.data
        value_list = data.get('value', [])
        
        token_record = OneDriveToken.objects.first()
        expected_client_state = token_record.client_state if token_record else None

        for item in value_list:
            client_state = item.get('clientState')
            if expected_client_state and client_state != expected_client_state:
                logger.warning("Received webhook notification with invalid clientState.")
                continue

            logger.info("OneDrive change notification received! Triggering background sync...")
            sync_excel_to_db.delay(trigger_source='webhook')
            break

        return Response({"status": "accepted"}, status=status.HTTP_202_ACCEPTED)


class SyncSettingsView(APIView):
    """
    Get or Update Excel Synchronization Settings.
    GET/PATCH /api/excel-sync/settings/
    """
    def get_object(self):
        obj, _ = ExcelSyncSettings.objects.get_or_create(
            pk=1,
            defaults={
                'is_active': True,
                'header_row': 1,
                'unique_key_field': 'order_number',
                'column_mapping': {}
            }
        )
        return obj

    def get(self, request):
        obj = self.get_object()
        serializer = ExcelSyncSettingsSerializer(obj)
        return Response(serializer.data)

    def patch(self, request):
        obj = self.get_object()
        serializer = ExcelSyncSettingsSerializer(obj, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class SyncStatusDashboardView(APIView):
    """
    Exposes complete synchronization telemetry and health status for the dedicated Synchronization Dashboard page.
    GET /api/excel-sync/status/
    """
    def get(self, request):
        settings_obj, _ = ExcelSyncSettings.objects.get_or_create(pk=1)
        token_record = OneDriveToken.objects.first()

        latest_logs = list(SyncLog.objects.filter(source='excel_online')[:5])
        latest_log = latest_logs[0] if latest_logs else None

        webhook_status = 'inactive'
        if token_record and token_record.is_webhook_active:
            webhook_status = 'active'

        token_status = token_record.token_status if token_record else 'disconnected'
        manual_button_enabled = bool(settings_obj.is_active and token_record and token_status != 'disconnected')

        next_scheduled_sync = None
        if settings_obj.last_sync_at:
            # Webhook is reactive; periodic fallback sync is estimated every 60 min
            next_scheduled_sync = settings_obj.last_sync_at + timezone.timedelta(minutes=60)

        dashboard_data = {
            'is_active': settings_obj.is_active,
            'last_sync_at': settings_obj.last_sync_at,
            'next_scheduled_sync': next_scheduled_sync,
            'last_successful_sync': settings_obj.last_successful_sync,
            'last_failed_sync': settings_obj.last_failed_sync,
            'last_error': settings_obj.last_error,
            
            'connected_user_email': token_record.user_email if token_record else '',
            'connected_user_name': token_record.user_name if token_record else '',
            'file_name': settings_obj.file_name or 'Operational Orders Workbook',
            'sheet_name': settings_obj.sheet_name or 'Sheet 1 (Active)',

            'total_imported': latest_log.imported_count if latest_log else 0,
            'total_updated': latest_log.updated_count if latest_log else 0,
            'total_skipped': latest_log.skipped_count if latest_log else 0,
            'total_archived': latest_log.archived_count if latest_log else Order.objects.filter(is_archived=True).count(),
            'total_conflicts': latest_log.conflict_count if latest_log else Order.objects.filter(has_conflict=True).count(),
            'total_orders_in_db': Order.objects.count(),
            'sync_duration_seconds': latest_log.duration_seconds if latest_log else None,

            'validation_errors': latest_log.validation_report if latest_log else [],
            'current_webhook_status': webhook_status,
            'webhook_expires_at': token_record.subscription_expires_at if token_record else None,
            'current_oauth_token_status': token_status,
            'manual_sync_button_enabled': manual_button_enabled,
            'last_sync_logs': latest_logs,
        }

        serializer = ExcelSyncDashboardSerializer(dashboard_data)
        return Response(serializer.data)


class ManualSyncTriggerView(APIView):
    """
    Triggers an immediate background Excel sync task.
    POST /api/excel-sync/trigger/
    """
    def post(self, request):
        settings_obj = ExcelSyncSettings.objects.first()
        if not settings_obj or not settings_obj.is_active:
            return Response({"error": "Excel sync is currently disabled."}, status=status.HTTP_400_BAD_REQUEST)

        task_res = sync_excel_to_db.delay(trigger_source='manual_button')
        return Response({
            "message": "Excel synchronization task triggered.",
            "task_id": task_res.id
        }, status=status.HTTP_202_ACCEPTED)


class InspectFileHeadersView(APIView):
    """
    Inspects column headers in an uploaded .xlsx file or from configured OneDrive file.
    POST /api/excel-sync/inspect-headers/
    """
    def post(self, request):
        header_row = int(request.data.get('header_row', 1))

        if 'file' in request.FILES:
            uploaded_file = request.FILES['file']
            xlsx_bytes = uploaded_file.read()
            headers = ExcelOnlineAdapter.inspect_headers(xlsx_bytes, header_row=header_row)
            return Response({"headers": headers, "source": "uploaded_file"})

        settings_obj = ExcelSyncSettings.objects.first()
        token_record = OneDriveToken.objects.first()

        if not settings_obj or not settings_obj.file_item_id or not token_record:
            return Response({"error": "No file uploaded and OneDrive file is unconfigured."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            from excel_sync.oauth import ensure_valid_token
            access_token = ensure_valid_token(token_record)
            client = MicrosoftGraphFilesClient(access_token)
            xlsx_bytes = client.download_workbook(settings_obj.file_item_id)
            headers = ExcelOnlineAdapter.inspect_headers(xlsx_bytes, header_row=header_row)
            return Response({"headers": headers, "source": "onedrive_file"})
        except Exception as e:
            return Response({"error": f"Failed to fetch headers: {e}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class DirectFileUploadSyncView(APIView):
    """
    Direct Excel File Drag & Drop Sync Endpoint.
    POST /api/excel-sync/upload-sync/
    Form-Data: file (file upload)
    """
    def post(self, request):
        if 'file' not in request.FILES:
            return Response({"error": "No .xlsx file provided in request.FILES['file']"}, status=status.HTTP_400_BAD_REQUEST)

        uploaded_file = request.FILES['file']
        if not uploaded_file.name.endswith(('.xlsx', '.xls', '.xlsm')):
            return Response({"error": "Invalid file format. Please upload an Excel workbook (.xlsx)"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            xlsx_bytes = uploaded_file.read()
            settings_obj, _ = ExcelSyncSettings.objects.get_or_create(pk=1)

            # Store uploaded file name
            settings_obj.file_name = uploaded_file.name
            settings_obj.save()

            # Parse using ExcelOnlineAdapter
            adapter = ExcelOnlineAdapter(settings_obj)
            normalized_records = adapter.parse_workbook(xlsx_bytes)

            # Run enterprise OrderImportService
            from orders.services.importer import OrderImportService
            importer = OrderImportService(source_name='excel_online')
            sync_log = importer.process_import(
                normalized_records=normalized_records,
                unique_key_field=settings_obj.unique_key_field or 'order_number',
                metadata={
                    'file_id': uploaded_file.name,
                    'last_modified': timezone.now()
                }
            )

            # Update telemetry state
            now = timezone.now()
            settings_obj.last_sync_at = now

            if sync_log.status in ('success', 'partial'):
                settings_obj.last_successful_sync = now
                settings_obj.last_error = sync_log.error_message or ''
            else:
                settings_obj.last_failed_sync = now
                settings_obj.last_error = sync_log.error_message or 'Direct upload sync failed'

            settings_obj.save()

            return Response({
                "message": f"Successfully synchronized '{uploaded_file.name}'",
                "status": sync_log.status,
                "file_name": uploaded_file.name,
                "imported": sync_log.imported_count,
                "updated": sync_log.updated_count,
                "skipped": sync_log.skipped_count,
                "archived": sync_log.archived_count,
                "conflicts": sync_log.conflict_count,
                "failed": sync_log.failed_count,
                "validation_errors": sync_log.validation_report,
                "sync_log_id": sync_log.id
            }, status=status.HTTP_200_OK)

        except Exception as e:
            logger.error(f"Direct file upload sync failed: {e}", exc_info=True)
            return Response({"error": f"Failed to process Excel file: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class LinkSyncView(APIView):
    """
    Automated Live Link Sync Endpoint (No Azure Required).
    POST /api/excel-sync/link-sync/
    Body: {"share_url": "https://onedrive.live.com/..."}
    """
    def post(self, request):
        share_url = request.data.get('share_url', '').strip()
        settings_obj, _ = ExcelSyncSettings.objects.get_or_create(pk=1)

        if not share_url and not settings_obj.share_url:
            return Response({"error": "Veuillez fournir un lien de partage OneDrive / Excel Online (share_url)."}, status=status.HTTP_400_BAD_REQUEST)

        target_url = share_url or settings_obj.share_url

        try:
            from excel_sync.utils import fetch_excel_bytes_from_url
            xlsx_bytes, filename = fetch_excel_bytes_from_url(target_url)

            # Update saved settings
            settings_obj.share_url = target_url
            settings_obj.file_name = filename or settings_obj.file_name or "Operational Orders Workbook"
            settings_obj.save()

            # Parse and import
            adapter = ExcelOnlineAdapter(settings_obj)
            normalized_records = adapter.parse_workbook(xlsx_bytes)

            from orders.services.importer import OrderImportService
            importer = OrderImportService(source_name='excel_online')
            sync_log = importer.process_import(
                normalized_records=normalized_records,
                unique_key_field=settings_obj.unique_key_field or 'order_number',
                metadata={
                    'file_id': target_url,
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
                settings_obj.last_error = sync_log.error_message or 'Link sync failed'
            settings_obj.save()

            return Response({
                "message": f"Synchronisé avec succès depuis le lien '{filename}'",
                "status": sync_log.status,
                "file_name": filename,
                "share_url": target_url,
                "imported": sync_log.imported_count,
                "updated": sync_log.updated_count,
                "skipped": sync_log.skipped_count,
                "archived": sync_log.archived_count,
                "conflicts": sync_log.conflict_count,
                "failed": sync_log.failed_count,
                "validation_errors": sync_log.validation_report,
                "sync_log_id": sync_log.id
            }, status=status.HTTP_200_OK)

        except Exception as e:
            logger.error(f"Link sync failed for URL {target_url}: {e}", exc_info=True)
            return Response({"error": f"Impossible de télécharger ou lire le fichier depuis ce lien. Vérifiez que le lien est public ou accessible en lecture. Détail: {str(e)}"}, status=status.HTTP_400_BAD_REQUEST)


from django.urls import path
from excel_sync.views import (
    OAuthStartView, OAuthCallbackView, WebhookNotificationView,
    SyncSettingsView, SyncStatusDashboardView, ManualSyncTriggerView,
    InspectFileHeadersView, DirectFileUploadSyncView, LinkSyncView
)

urlpatterns = [
    path('oauth/start/', OAuthStartView.as_view(), name='excel-oauth-start'),
    path('oauth/callback/', OAuthCallbackView.as_view(), name='excel-oauth-callback'),
    path('webhook/', WebhookNotificationView.as_view(), name='excel-webhook'),
    path('settings/', SyncSettingsView.as_view(), name='excel-settings'),
    path('status/', SyncStatusDashboardView.as_view(), name='excel-status'),
    path('trigger/', ManualSyncTriggerView.as_view(), name='excel-trigger'),
    path('inspect-headers/', InspectFileHeadersView.as_view(), name='excel-inspect-headers'),
    path('upload-sync/', DirectFileUploadSyncView.as_view(), name='excel-upload-sync'),
    path('link-sync/', LinkSyncView.as_view(), name='excel-link-sync'),
]


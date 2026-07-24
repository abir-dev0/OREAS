from rest_framework import viewsets, status
from rest_framework.response import Response
from core.models import Brand, PlatformSettings
from core.serializers import BrandSerializer, PlatformSettingsSerializer


class BrandViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Brand.objects.all()
    serializer_class = BrandSerializer


class PlatformSettingsViewSet(viewsets.ModelViewSet):
    queryset = PlatformSettings.objects.all()
    serializer_class = PlatformSettingsSerializer

    def get_object(self):
        """
        Return the single platform settings instance.
        Create one if it doesn't exist.
        """
        obj, created = PlatformSettings.objects.get_or_create(
            pk=1,
            defaults={
                'candidate_threshold': 85.0,
                'sync_frequency': 'hourly',
                'auto_shopify_integration': True,
                'analysis_language': 'Français + Darija + Anglais'
            }
        )
        return obj

    def list(self, request):
        """
        Return the single platform settings instance.
        """
        obj = self.get_object()
        serializer = self.get_serializer(obj)
        return Response(serializer.data)

    def create(self, request):
        """
        Prevent creation of multiple settings instances.
        """
        return Response(
            {"error": "Platform settings already exist. Use PUT/PATCH to update."},
            status=status.HTTP_400_BAD_REQUEST
        )

    def destroy(self, request, *args, **kwargs):
        """
        Prevent deletion of platform settings.
        """
        return Response(
            {"error": "Platform settings cannot be deleted."},
            status=status.HTTP_403_FORBIDDEN
        )


from rest_framework.views import APIView
from instagram.tasks import sync_all_active_instagram_accounts
from marketing.tasks import sync_all_active_marketing_accounts

class SyncAllView(APIView):
    """
    Triggers background synchronization for all active Instagram profiles
    and Meta Ads Manager accounts configured in OREAS.
    """
    def post(self, request):
        res_ig = sync_all_active_instagram_accounts.delay()
        res_mkt = sync_all_active_marketing_accounts.delay()
        return Response({
            "status": "Global synchronization task scheduled.",
            "instagram_task_id": res_ig.id,
            "marketing_task_id": res_mkt.id
        }, status=status.HTTP_202_ACCEPTED)


from django.urls import path, include
from rest_framework.routers import DefaultRouter
from core.views import BrandViewSet, PlatformSettingsViewSet, SyncAllView

router = DefaultRouter()
router.register(r'brands', BrandViewSet, basename='brands')
router.register(r'settings', PlatformSettingsViewSet, basename='settings')

urlpatterns = [
    path('sync-all/', SyncAllView.as_view(), name='sync-all'),
    path('', include(router.urls)),
]

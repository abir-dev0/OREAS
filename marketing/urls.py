from django.urls import path, include
from rest_framework.routers import DefaultRouter
from marketing.views import (
    MetaAdAccountViewSet, ProductTestViewSet, MetaCampaignViewSet,
    MetaAdSetViewSet, MetaAdViewSet, MetaAdPerformanceInsightViewSet,
    MarketingOrderViewSet
)

router = DefaultRouter()
router.register(r'accounts', MetaAdAccountViewSet, basename='accounts')
router.register(r'tests', ProductTestViewSet, basename='tests')
router.register(r'campaigns', MetaCampaignViewSet, basename='campaigns')
router.register(r'adsets', MetaAdSetViewSet, basename='adsets')
router.register(r'ads', MetaAdViewSet, basename='ads')
router.register(r'insights', MetaAdPerformanceInsightViewSet, basename='insights')
router.register(r'orders', MarketingOrderViewSet, basename='orders')

urlpatterns = [
    path('', include(router.urls)),
]

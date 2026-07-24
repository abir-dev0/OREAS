from django.urls import path, include
from rest_framework.routers import DefaultRouter
from instagram.views import (
    InstagramAccountViewSet, InstagramMediaViewSet,
    InstagramCompetitorViewSet, InstagramCompetitorMediaViewSet,
    OAuthConnectView, OAuthCallbackView
)

router = DefaultRouter()
router.register(r'accounts', InstagramAccountViewSet, basename='accounts')
router.register(r'media', InstagramMediaViewSet, basename='media')
router.register(r'competitors', InstagramCompetitorViewSet, basename='competitors')
router.register(r'competitor-media', InstagramCompetitorMediaViewSet, basename='competitor-media')

urlpatterns = [
    path('oauth/connect/', OAuthConnectView.as_view(), name='oauth_connect'),
    path('oauth/callback/', OAuthCallbackView.as_view(), name='oauth_callback'),
    path('', include(router.urls)),
]

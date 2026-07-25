from django.urls import path, include
from rest_framework.routers import DefaultRouter
from products.views import ProductViewSet, ShopifyCallbackView, ShopifyDebugTokenView

router = DefaultRouter()
router.register(r'', ProductViewSet, basename='products')

urlpatterns = [
    path('callback/', ShopifyCallbackView.as_view(), name='shopify_callback'),
    path('debug-token/', ShopifyDebugTokenView.as_view(), name='shopify_debug_token'),
    path('', include(router.urls)),
]


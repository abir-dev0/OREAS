from django.urls import path, include
from rest_framework.routers import DefaultRouter
from products.views import (
    ProductViewSet,
    ShopifyCustomerViewSet,
    ShopifyCallbackView,
    ShopifySyncProductsView,
    ShopifySyncOrdersView,
    ShopifySyncCustomersView,
)

router = DefaultRouter()
router.register(r'items', ProductViewSet, basename='products')
router.register(r'customers', ShopifyCustomerViewSet, basename='shopify-customers')

urlpatterns = [
    path('callback/', ShopifyCallbackView.as_view(), name='shopify_callback'),
    path('sync-products/', ShopifySyncProductsView.as_view(), name='shopify_sync_products'),
    path('sync-orders/', ShopifySyncOrdersView.as_view(), name='shopify_sync_orders'),
    path('sync-customers/', ShopifySyncCustomersView.as_view(), name='shopify_sync_customers'),
    path('', include(router.urls)),
]

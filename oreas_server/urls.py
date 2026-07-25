"""
URL configuration for oreas_server project.
"""
from django.contrib import admin
from django.urls import path, include
from django.http import JsonResponse
from products.views import ShopifyAppLaunchView, ShopifyCallbackView

def health_check(request):
    return JsonResponse({
        "status": "ok",
        "service": "OREAS Backend API",
        "version": "1.0.0"
    })

urlpatterns = [
    path('', ShopifyAppLaunchView.as_view(), name='app_launch'),
    path('health/', health_check, name='health_check'),
    path('admin/', admin.site.urls),
    path('api/shopify/callback/', ShopifyCallbackView.as_view(), name='shopify_direct_callback'),
    path('api/instagram/', include('instagram.urls')),
    path('api/core/', include('core.urls')),
    path('api/marketing/', include('marketing.urls')),
    path('api/products/', include('products.urls')),
]



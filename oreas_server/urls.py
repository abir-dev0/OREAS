"""
URL configuration for oreas_server project.
"""
from django.contrib import admin
from django.urls import path, include
from django.http import JsonResponse

def health_check(request):
    return JsonResponse({
        "status": "ok",
        "service": "OREAS Backend API",
        "version": "1.0.0"
    })

urlpatterns = [
    path('', health_check, name='health_check'),
    path('admin/', admin.site.urls),
    path('api/instagram/', include('instagram.urls')),
    path('api/core/', include('core.urls')),
    path('api/marketing/', include('marketing.urls')),
    path('api/products/', include('products.urls')),
]

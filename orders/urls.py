from django.urls import path, include
from rest_framework.routers import DefaultRouter
from orders.views import (
    OrderViewSet, SyncLogListView, OrderConflictListView, OrderConflictResolveView
)

router = DefaultRouter()
router.register(r'', OrderViewSet, basename='orders')

urlpatterns = [
    path('logs/', SyncLogListView.as_view(), name='sync-logs'),
    path('conflicts/', OrderConflictListView.as_view(), name='order-conflicts'),
    path('conflicts/<int:pk>/resolve/', OrderConflictResolveView.as_view(), name='order-conflict-resolve'),
    path('', include(router.urls)),
]

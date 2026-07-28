from rest_framework import viewsets, generics, status
from rest_framework.views import APIView
from rest_framework.response import Response
from orders.models import Order, SyncLog
from orders.serializers import OrderSerializer, SyncLogSerializer

class OrderViewSet(viewsets.ModelViewSet):
    queryset = Order.objects.all()
    serializer_class = OrderSerializer
    search_fields = ['order_number', 'customer_name', 'customer_phone', 'product_name']
    filterset_fields = ['source', 'status', 'is_archived', 'has_conflict', 'is_manually_edited']

    def perform_update(self, serializer):
        # Requirement 4: Mark order as manually edited inside OREAS when modified via API
        serializer.save(is_manually_edited=True)


class SyncLogListView(generics.ListAPIView):
    queryset = SyncLog.objects.all()
    serializer_class = SyncLogSerializer


class OrderConflictListView(generics.ListAPIView):
    """
    Lists all orders flagged with synchronization conflicts.
    GET /api/orders/conflicts/
    """
    queryset = Order.objects.filter(has_conflict=True)
    serializer_class = OrderSerializer


class OrderConflictResolveView(APIView):
    """
    Resolves a synchronization conflict for an order.
    POST /api/orders/conflicts/<id>/resolve/
    Body: {"action": "keep_local" | "apply_incoming"}
    """
    def post(self, request, pk):
        try:
            order = Order.objects.get(pk=pk, has_conflict=True)
        except Order.DoesNotExist:
            return Response({"error": "Order not found or has no active conflict."}, status=status.HTTP_404_NOT_FOUND)

        action = request.data.get('action')
        if action not in ('keep_local', 'apply_incoming'):
            return Response({"error": "Invalid action. Must be 'keep_local' or 'apply_incoming'."}, status=status.HTTP_400_BAD_REQUEST)

        if action == 'apply_incoming':
            incoming_payload = order.conflict_data.get('incoming_payload', {})
            for key, val in incoming_payload.items():
                if hasattr(order, key):
                    setattr(order, key, val)
            order.is_manually_edited = False

        order.has_conflict = False
        order.conflict_data = {}
        order.save()

        return Response({
            "message": f"Conflict resolved using '{action}' strategy.",
            "order": OrderSerializer(order).data
        })

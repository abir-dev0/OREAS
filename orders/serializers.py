from rest_framework import serializers
from orders.models import Order, OrderSyncHistory, SyncLog

class OrderSyncHistorySerializer(serializers.ModelSerializer):
    class Meta:
        model = OrderSyncHistory
        fields = '__all__'

class OrderSerializer(serializers.ModelSerializer):
    history = OrderSyncHistorySerializer(many=True, read_only=True)

    class Meta:
        model = Order
        fields = '__all__'

class SyncLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = SyncLog
        fields = '__all__'

from rest_framework import viewsets, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from django.shortcuts import redirect
from django.conf import settings
from products.models import Product
from instagram.serializers import ProductSerializer

class ProductViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Product.objects.all().order_by('-created_at')
    serializer_class = ProductSerializer

class ShopifyCallbackView(APIView):
    """
    Shopify OAuth / App launch callback endpoint.
    Handles redirects from Shopify Admin / Dev Dashboard.
    """
    permission_classes = [AllowAny]

    def get(self, request):
        shop = request.query_params.get('shop')
        code = request.query_params.get('code')
        
        # If launched/installed from Shopify Admin, redirect to frontend app root
        app_url = getattr(settings, 'SHOPIFY_APP_URL', 'https://dev.oreass.com')
        if shop:
            return redirect(f"{app_url}/?shop={shop}")

        return Response({
            "status": "ok",
            "message": "Shopify OAuth callback endpoint active.",
            "shop": shop,
            "code_present": bool(code)
        }, status=status.HTTP_200_OK)

    def post(self, request):
        return Response({
            "status": "ok",
            "message": "Shopify payload received."
        }, status=status.HTTP_200_OK)


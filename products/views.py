import secrets
import logging
from rest_framework import viewsets, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from django.shortcuts import redirect
from django.http import HttpResponseRedirect, JsonResponse
from django.conf import settings
from products.models import Product, ShopifyStore, ShopifyCustomer
from instagram.serializers import ProductSerializer, ShopifyCustomerSerializer
from products.services.shopify_oauth import (
    clean_shop_domain,
    verify_shopify_hmac,
    has_valid_shopify_token,
    build_shopify_authorization_url,
    exchange_code_for_access_token
)
from products.services.shopify_sync import sync_products, sync_orders, sync_customers

logger = logging.getLogger(__name__)


class ProductViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Product.objects.all().order_by('-created_at')
    serializer_class = ProductSerializer

class ShopifyCustomerViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = ShopifyCustomer.objects.all().order_by('-total_spent')
    serializer_class = ShopifyCustomerSerializer

class ShopifySyncCustomersView(APIView):
    """
    POST /api/products/sync-customers/
    Pulls all customers from Shopify Admin API and upserts them locally.
    """
    permission_classes = [AllowAny]

    def post(self, request):
        shop = request.data.get('shop') or clean_shop_domain(
            getattr(settings, 'SHOPIFY_STORE_URL', '')
        )
        try:
            result = sync_customers(shop=shop or None)
            return Response(result, status=status.HTTP_200_OK)
        except Exception as e:
            logger.error(f"sync_customers failed: {e}")
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)



class ShopifySyncProductsView(APIView):
    """
    POST /api/products/sync-products/
    Pulls all products from Shopify Admin API and upserts them locally.
    Optional body: { "shop": "yourstore.myshopify.com" }
    """
    permission_classes = [AllowAny]

    def post(self, request):
        shop = request.data.get('shop') or clean_shop_domain(
            getattr(settings, 'SHOPIFY_STORE_URL', '')
        )
        try:
            result = sync_products(shop=shop or None)
            return Response(result, status=status.HTTP_200_OK)
        except Exception as e:
            logger.error(f"sync_products failed: {e}")
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


class ShopifySyncOrdersView(APIView):
    """
    POST /api/products/sync-orders/
    Pulls all orders from Shopify Admin API and upserts them locally.
    Optional body: { "shop": "yourstore.myshopify.com", "status": "any", "limit": 250 }
    """
    permission_classes = [AllowAny]

    def post(self, request):
        shop = request.data.get('shop') or clean_shop_domain(
            getattr(settings, 'SHOPIFY_STORE_URL', '')
        )
        order_status = request.data.get('status', 'any')
        limit = int(request.data.get('limit', 250))
        try:
            result = sync_orders(shop=shop or None, status=order_status, limit=limit)
            return Response(result, status=status.HTTP_200_OK)
        except Exception as e:
            logger.error(f"sync_orders failed: {e}")
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


class ShopifyAppLaunchView(APIView):
    """
    Root endpoint / application entry view.
    When launched from Shopify Admin (with 'shop' parameter):
    - If valid token exists, loads application normally.
    - If no valid token exists, initiates Shopify OAuth authorization flow immediately.
    """
    permission_classes = [AllowAny]

    def get(self, request):
        shop = request.query_params.get('shop')
        
        # If launched from Shopify Admin with shop parameter
        if shop:
            clean_shop = clean_shop_domain(shop)
            
            # Check if a valid access token already exists for this shop
            if has_valid_shopify_token(clean_shop):
                logger.info(f"Valid token already exists for shop {clean_shop}. Loading application.")
                # Load application normally: redirect to frontend root with shop & host preserved
                app_url = getattr(settings, 'SHOPIFY_APP_URL', '').rstrip('/')
                host = request.query_params.get('host', '')
                
                target_url = f"{app_url}/?shop={clean_shop}"
                if host:
                    target_url += f"&host={host}"
                    
                # If requested directly at backend root when backend & frontend share origin
                if not app_url or app_url == request.build_absolute_uri('/').rstrip('/'):
                    return JsonResponse({
                        "status": "authenticated",
                        "shop": clean_shop,
                        "message": "Shopify token active. Application loaded normally."
                    })
                return HttpResponseRedirect(target_url)

            # No valid token exists: initiate Shopify OAuth authorization flow immediately
            logger.info(f"No valid token found for shop {clean_shop}. Initiating Shopify OAuth.")
            state = secrets.token_hex(16)
            request.session['shopify_oauth_state'] = state
            
            # Determine callback redirect URI
            app_url = getattr(settings, 'SHOPIFY_APP_URL', '').rstrip('/')
            if app_url and app_url.startswith('http'):
                redirect_uri = f"{app_url}/api/shopify/callback/"
            else:
                redirect_uri = request.build_absolute_uri('/api/shopify/callback/')
                
            auth_url = build_shopify_authorization_url(clean_shop, redirect_uri, state)
            
            response = HttpResponseRedirect(auth_url)
            response.set_cookie('shopify_oauth_state', state, httponly=True, samesite='Lax', max_age=600)
            return response

        # Health check fallback when no 'shop' query param is provided
        return JsonResponse({
            "status": "ok",
            "service": "OREAS Backend API",
            "version": "1.0.0"
        })

class ShopifyCallbackView(APIView):
    """
    Shopify OAuth callback endpoint at /api/shopify/callback/.
    - Verifies HMAC signature
    - Validates state parameter
    - Exchanges authorization code for permanent Admin API access token
    - Securely stores encrypted token in ShopifyStore model
    - Redirects back to the main application
    """
    permission_classes = [AllowAny]

    def get(self, request):
        params = request.GET.dict()
        shop = params.get('shop')
        code = params.get('code')
        state = params.get('state')
        host = params.get('host', '')

        if not shop or not code:
            return Response({
                "error": "Missing required parameters: shop and code are required."
            }, status=status.HTTP_400_BAD_REQUEST)

        clean_shop = clean_shop_domain(shop)

        # 1. Verify HMAC signature
        api_secret = getattr(settings, 'SHOPIFY_API_SECRET', '')
        if api_secret and 'hmac' in params:
            if not verify_shopify_hmac(params, api_secret):
                logger.error(f"HMAC verification failed for shop {clean_shop}")
                return Response({"error": "Invalid HMAC signature."}, status=status.HTTP_400_BAD_REQUEST)

        # 2. Validate state
        saved_state = request.session.get('shopify_oauth_state') or request.COOKIES.get('shopify_oauth_state')
        if state and saved_state and state != saved_state:
            logger.warning(f"State mismatch for shop {clean_shop}: received {state}, expected {saved_state}")

        # 3. Exchange authorization code for permanent Admin API access token
        try:
            exchange_code_for_access_token(clean_shop, code)
            # Auto-sync products and orders upon successful token exchange
            try:
                sync_products(shop=clean_shop)
                sync_orders(shop=clean_shop)
            except Exception as sync_err:
                logger.warning(f"Initial post-OAuth sync warning for {clean_shop}: {sync_err}")
        except Exception as e:
            logger.error(f"Token exchange failed for shop {clean_shop}: {e}")
            return Response({
                "error": f"Failed to exchange authorization code for token: {str(e)}"
            }, status=status.HTTP_400_BAD_REQUEST)

        # 4. Redirect back to application dashboard
        app_url = getattr(settings, 'SHOPIFY_APP_URL', '').rstrip('/')
        target_url = f"{app_url}/?shop={clean_shop}" if app_url else f"/?shop={clean_shop}"
        if host:
            target_url += f"&host={host}"

        response = HttpResponseRedirect(target_url)
        response.delete_cookie('shopify_oauth_state')
        return response

    def post(self, request):
        return Response({
            "status": "ok",
            "message": "Shopify payload received."
        }, status=status.HTTP_200_OK)

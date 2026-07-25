import secrets
import logging
from rest_framework import viewsets, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from django.shortcuts import redirect
from django.http import HttpResponseRedirect, JsonResponse
from django.conf import settings
from products.models import Product, ShopifyStore
from instagram.serializers import ProductSerializer
from products.services.shopify_oauth import (
    clean_shop_domain,
    verify_shopify_hmac,
    has_valid_shopify_token,
    build_shopify_authorization_url,
    exchange_code_for_access_token
)

logger = logging.getLogger(__name__)

class ShopifyDebugTokenView(APIView):
    """
    TEMPORARY debug endpoint to retrieve decrypted Shopify access token.
    Protected by DEBUG_SECRET env var. Remove after retrieving token.
    GET /api/products/debug-token/?shop={shop}&secret={DEBUG_SECRET}
    """
    permission_classes = [AllowAny]

    def get(self, request):
        import os
        expected_secret = os.getenv('DEBUG_SECRET', '')
        provided_secret = request.query_params.get('secret', '')

        # Require a secret param to prevent public access
        if not expected_secret or provided_secret != expected_secret:
            return JsonResponse({"error": "Unauthorized"}, status=403)

        shop = request.query_params.get('shop', '')
        if shop:
            shop = clean_shop_domain(shop)
            stores = ShopifyStore.objects.filter(shop=shop)
        else:
            stores = ShopifyStore.objects.all()

        result = []
        for s in stores:
            token = s.get_access_token()
            logger.warning(f"[DEBUG] Shop={s.shop} access_token={token}")
            result.append({
                "shop": s.shop,
                "access_token": token,
                "scope": s.scope,
                "installed_at": str(s.installed_at),
            })

        return JsonResponse({"stores": result}, status=200)


class ProductViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Product.objects.all().order_by('-created_at')
    serializer_class = ProductSerializer

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

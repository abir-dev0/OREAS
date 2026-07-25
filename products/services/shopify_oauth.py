import hmac
import hashlib
import secrets
import logging
import requests
from typing import Optional, Dict, Any
from django.conf import settings
from django.utils import timezone
from products.models import ShopifyStore

logger = logging.getLogger(__name__)

DEFAULT_SCOPES = "write_products,read_products,read_orders,write_orders"

def clean_shop_domain(shop: str) -> str:
    if not shop:
        return ""
    clean = shop.strip().lower()
    clean = clean.replace('https://', '').replace('http://', '').split('/')[0]
    return clean

def verify_shopify_hmac(query_dict: Dict[str, Any], secret: Optional[str] = None) -> bool:
    """
    Verifies Shopify HMAC signature from query parameters dictionary.
    Docs: https://shopify.dev/docs/apps/auth/oauth/getting-started#step-2-verify-the-installation-request
    """
    secret = secret or getattr(settings, 'SHOPIFY_API_SECRET', '')
    if not secret:
        logger.warning("SHOPIFY_API_SECRET is not configured.")
        return False
        
    received_hmac = query_dict.get('hmac')
    if not received_hmac:
        return False

    # Extract all keys except hmac and signature
    filtered_items = []
    for k, v in query_dict.items():
        if k in ('hmac', 'signature'):
            continue
        # Handle list parameter values if present
        if isinstance(v, list):
            val_str = ','.join(map(str, v))
        else:
            val_str = str(v)
        filtered_items.append((k, val_str))

    # Sort lexicographically by key
    filtered_items.sort(key=lambda x: x[0])
    
    # Join into key=value query string
    message = '&'.join(f"{k}={v}" for k, v in filtered_items)
    
    computed_hmac = hmac.new(
        secret.encode('utf-8'),
        message.encode('utf-8'),
        hashlib.sha256
    ).hexdigest()

    return hmac.compare_digest(computed_hmac.lower(), received_hmac.lower())

def has_valid_shopify_token(shop: str) -> bool:
    """
    Checks whether a valid Admin API access token exists for the given shop.
    Checks ShopifyStore database model first, then falls back to settings.
    """
    shop = clean_shop_domain(shop)
    if not shop:
        return False

    # 1. Check DB for stored token
    store_obj = ShopifyStore.objects.filter(shop=shop).first()
    if store_obj and store_obj.is_valid():
        return True

    # 2. Check if global SHOPIFY_STORE_URL and SHOPIFY_ACCESS_TOKEN match this shop
    global_store = clean_shop_domain(getattr(settings, 'SHOPIFY_STORE_URL', ''))
    global_token = getattr(settings, 'SHOPIFY_ACCESS_TOKEN', '')
    if global_token and not global_token.startswith("your_"):
        if global_store and (global_store == shop or global_store.split('.')[0] == shop.split('.')[0]):
            return True

    return False

def build_shopify_authorization_url(shop: str, redirect_uri: str, state: str) -> str:
    """
    Constructs the Shopify OAuth authorization URL.
    https://{shop}/admin/oauth/authorize?client_id={api_key}&scope={scopes}&redirect_uri={redirect_uri}&state={state}
    """
    shop = clean_shop_domain(shop)
    client_id = getattr(settings, 'SHOPIFY_API_KEY', '')
    scopes = getattr(settings, 'SHOPIFY_SCOPES', DEFAULT_SCOPES)
    
    auth_url = (
        f"https://{shop}/admin/oauth/authorize?"
        f"client_id={client_id}"
        f"&scope={scopes}"
        f"&redirect_uri={redirect_uri}"
        f"&state={state}"
    )
    return auth_url

def exchange_code_for_access_token(shop: str, code: str) -> Dict[str, Any]:
    """
    Exchanges authorization code for permanent Admin API access token.
    POST https://{shop}/admin/oauth/access_token
    """
    shop = clean_shop_domain(shop)
    client_id = getattr(settings, 'SHOPIFY_API_KEY', '')
    client_secret = getattr(settings, 'SHOPIFY_API_SECRET', '')
    
    url = f"https://{shop}/admin/oauth/access_token"
    payload = {
        "client_id": client_id,
        "client_secret": client_secret,
        "code": code
    }
    
    response = requests.post(url, json=payload, timeout=15)
    response.raise_for_status()
    data = response.json()
    
    token = data.get("access_token")
    scope = data.get("scope", "")
    
    if not token:
        raise ValueError(f"No access_token returned by Shopify for {shop}: {data}")

    # Store token in database
    store_obj, _ = ShopifyStore.objects.get_or_create(shop=shop)
    store_obj.set_access_token(token)
    store_obj.scope = scope
    store_obj.save()
    
    logger.info(f"Successfully obtained and saved permanent Shopify access token for {shop}")
    return data

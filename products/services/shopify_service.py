import logging
import requests
from typing import List, Dict, Any, Optional
from django.conf import settings

logger = logging.getLogger(__name__)

API_VERSION = "2024-01"

class ShopifyAdminClient:
    """
    Shopify Admin REST API client using Custom/Private App access token authentication.
    Docs: https://shopify.dev/docs/api/admin-rest
    """
    def __init__(self, store_url: Optional[str] = None, access_token: Optional[str] = None):
        self.store_url = (store_url or getattr(settings, 'SHOPIFY_STORE_URL', '') or '').strip()
        # Clean domain if full URL was pasted
        self.store_url = self.store_url.replace('https://', '').replace('http://', '').rstrip('/')
        
        self.access_token = (access_token or getattr(settings, 'SHOPIFY_ACCESS_TOKEN', '') or '').strip()
        
        self.session = requests.Session()
        if self.access_token:
            self.session.headers.update({
                "X-Shopify-Access-Token": self.access_token,
                "Content-Type": "application/json"
            })

    def is_configured(self) -> bool:
        return bool(self.store_url and self.access_token and not self.access_token.startswith("your_"))

    def _get(self, path: str, params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        if not self.is_configured():
            raise ValueError("Shopify credentials not properly configured in settings / .env")

        url = f"https://{self.store_url}/admin/api/{API_VERSION}/{path}"
        try:
            response = self.session.get(url, params=params, timeout=15)
            response.raise_for_status()
            return response.json()
        except requests.RequestException as e:
            logger.error(f"Shopify API Error on {path}: {e}")
            if 'response' in locals() and response is not None:
                logger.error(f"Shopify Response Body: {response.text}")
            raise e

    def _post(self, path: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        if not self.is_configured():
            raise ValueError("Shopify credentials not properly configured in settings / .env")

        url = f"https://{self.store_url}/admin/api/{API_VERSION}/{path}"
        try:
            response = self.session.post(url, json=payload, timeout=20)
            response.raise_for_status()
            return response.json()
        except requests.RequestException as e:
            logger.error(f"Shopify API POST Error on {path}: {e}")
            if 'response' in locals() and response is not None:
                logger.error(f"Shopify Response Body: {response.text}")
            raise e

    def get_shop_info(self) -> Dict[str, Any]:
        """Fetch shop details to verify credentials and store info."""
        data = self._get("shop.json")
        return data.get("shop", {})

    def fetch_products(self, limit: int = 250) -> List[Dict[str, Any]]:
        """Fetch all products from Shopify."""
        data = self._get("products.json", params={"limit": limit})
        return data.get("products", [])

    def fetch_orders(self, status: str = "any", limit: int = 250) -> List[Dict[str, Any]]:
        """Fetch all orders from Shopify."""
        data = self._get("orders.json", params={"status": status, "limit": limit})
        return data.get("orders", [])

    def fetch_customers(self, limit: int = 250) -> List[Dict[str, Any]]:
        """Fetch all customers from Shopify."""
        data = self._get("customers.json", params={"limit": limit})
        return data.get("customers", [])

    def create_product(self, product_data: Dict[str, Any]) -> Dict[str, Any]:
        """Create a new product on Shopify."""
        data = self._post("products.json", payload={"product": product_data})
        return data.get("product", {})



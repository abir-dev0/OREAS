import os
import django
from urllib.parse import urlencode

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'oreas_server.settings')
django.setup()

from django.conf import settings

client_id = os.getenv('SHOPIFY_API_KEY', getattr(settings, 'SHOPIFY_API_KEY', ''))
store_domain = os.getenv('SHOPIFY_STORE_URL', getattr(settings, 'SHOPIFY_STORE_URL', ''))
redirect_uri = os.getenv('SHOPIFY_APP_URL', getattr(settings, 'SHOPIFY_APP_URL', ''))

params = {
    "client_id": client_id,
    "scope": "read_orders,read_products,read_inventory",
    "redirect_uri": redirect_uri,
}

install_url = f"https://{store_domain}/admin/oauth/authorize?{urlencode(params)}"
print("Generated Shopify Install URL:")
print(install_url)

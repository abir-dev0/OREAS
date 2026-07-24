import os
import requests
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'oreas_server.settings')
django.setup()

from django.conf import settings
from products.services.shopify_service import ShopifyAdminClient

api_key = settings.SHOPIFY_API_KEY
api_secret = settings.SHOPIFY_API_SECRET
store_url = settings.SHOPIFY_STORE_URL

print(f"Store URL: {store_url}")
print(f"API Key (Client ID): {api_key}")
print(f"API Secret: {api_secret[:10]}...")

# Test Basic Auth or token exchange
session = requests.Session()

# 1. Try requesting shop info with basic auth using Client ID and Secret
url = f"https://{api_key}:{api_secret}@{store_url}/admin/api/2024-01/shop.json"
try:
    res = session.get(url, timeout=10)
    print(f"Basic Auth Status: {res.status_code}")
    if res.status_code == 200:
        print("SUCCESS! Shop Data:", res.json())
    else:
        print("Basic Auth Response:", res.text[:200])
except Exception as e:
    print(f"Basic auth error: {e}")

# 2. Try fetching access token if app is installed
url_oauth = f"https://{store_url}/admin/oauth/access_token"
payload = {
    "client_id": api_key,
    "client_secret": api_secret,
}
try:
    res2 = session.post(url_oauth, json=payload, timeout=10)
    print(f"OAuth Token Request Status: {res2.status_code}")
    print("OAuth Response:", res2.text[:200])
except Exception as e:
    print(f"OAuth error: {e}")

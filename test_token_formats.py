import os
import requests
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'oreas_server.settings')
django.setup()

from django.conf import settings

token = os.getenv('SHOPIFY_ACCESS_TOKEN', getattr(settings, 'SHOPIFY_ACCESS_TOKEN', ''))
store = os.getenv('SHOPIFY_STORE_URL', getattr(settings, 'SHOPIFY_STORE_URL', ''))

print("Test 1: Header X-Shopify-Access-Token")
res1 = requests.get(f"https://{store}/admin/api/2024-01/shop.json", headers={"X-Shopify-Access-Token": token})
print(f"Res1: {res1.status_code} -> {res1.text[:200]}")

print("Test 2: OAuth / Admin API Authorization Bearer")
res2 = requests.get(f"https://{store}/admin/api/2024-01/shop.json", headers={"Authorization": f"Bearer {token}"})
print(f"Res2: {res2.status_code} -> {res2.text[:200]}")

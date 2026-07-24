import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'oreas_server.settings')
django.setup()

from products.services.shopify_service import ShopifyAdminClient

client = ShopifyAdminClient()
print(f"Testing connection to Shopify store: {client.store_url}...")

try:
    shop = client.get_shop_info()
    print(f"SUCCESS: Connected to Shopify Store '{shop.get('name')}' ({shop.get('domain')})")
    print(f"Currency: {shop.get('currency')}, Email: {shop.get('email')}")
    
    products = client.fetch_products(limit=10)
    print(f"\nFetched {len(products)} products from Shopify:")
    for p in products:
        price = p.get('variants', [{}])[0].get('price', 'N/A')
        print(f" - [{p.get('id')}] {p.get('title')} (Price: {price} MAD, Handle: {p.get('handle')})")
        
    orders = client.fetch_orders(limit=10)
    print(f"\nFetched {len(orders)} orders from Shopify:")
    for o in orders:
        print(f" - Order #{o.get('order_number')} ({o.get('id')}): {o.get('total_price')} {o.get('currency')} - Status: {o.get('financial_status')}")

except Exception as e:
    print(f"ERROR connecting to Shopify: {e}")

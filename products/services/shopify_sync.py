import logging
from typing import Optional
from django.utils import timezone
from django.utils.text import slugify
from core.models import Brand
from products.models import Product, ShopifyStore
from products.services.shopify_service import ShopifyAdminClient
from marketing.models import MarketingOrder

logger = logging.getLogger(__name__)


def _get_client(shop: Optional[str] = None) -> ShopifyAdminClient:
    """
    Build a ShopifyAdminClient from the DB-stored token for the given shop,
    falling back to settings env vars.
    """
    if shop:
        store = ShopifyStore.objects.filter(shop=shop).first()
        if store and store.is_valid():
            return ShopifyAdminClient(store_url=shop, access_token=store.get_access_token())
    # Fallback: use env / settings values
    return ShopifyAdminClient()


def sync_products(shop: Optional[str] = None) -> dict:
    """
    Pull all active products from Shopify and upsert them into the local Product model.
    Matches by shopify_product_id. Creates or updates.
    Returns a summary dict.
    """
    client = _get_client(shop)
    
    # Ensure a Brand exists (default brand for this store)
    brand, _ = Brand.objects.get_or_create(
        slug='oreas',
        defaults={'name': 'OREAS'}
    )
    
    # Fetch all products (up to 250 per Shopify REST page)
    raw_products = client.fetch_products(limit=250)
    
    created = 0
    updated = 0
    skipped = 0

    for p in raw_products:
        shopify_id = str(p.get('id', ''))
        if not shopify_id:
            skipped += 1
            continue

        title = p.get('title', 'Untitled')
        handle = p.get('handle', slugify(title))
        description = p.get('body_html', '') or ''
        status = p.get('status', 'active')

        # Get price from first variant
        price = None
        variants = p.get('variants', [])
        if variants:
            try:
                price = float(variants[0].get('price', 0) or 0) or None
            except (TypeError, ValueError):
                price = None

        # Get primary image URL
        image_url = None
        images = p.get('images', [])
        if images:
            image_url = images[0].get('src')
        elif p.get('image'):
            image_url = p['image'].get('src')

        product, created_flag = Product.objects.update_or_create(
            shopify_product_id=shopify_id,
            defaults={
                'brand': brand,
                'title': title,
                'handle': handle,
                'description': description,
                'price': price,
                'image_url': image_url,
            }
        )

        if created_flag:
            created += 1
        else:
            updated += 1

    logger.info(f"Shopify product sync complete: {created} created, {updated} updated, {skipped} skipped.")
    return {
        'status': 'success',
        'products_fetched': len(raw_products),
        'created': created,
        'updated': updated,
        'skipped': skipped,
    }


def sync_orders(shop: Optional[str] = None, status: str = 'any', limit: int = 250) -> dict:
    """
    Pull orders from Shopify and upsert them into the local MarketingOrder model.
    - Matches orders by order_id (Shopify order ID as string).
    - Maps line items to Product via shopify_product_id.
    - Skips orders whose product is not found locally.
    Returns a summary dict.
    """
    client = _get_client(shop)
    raw_orders = client.fetch_orders(status=status, limit=limit)

    created = 0
    updated = 0
    skipped = 0
    errors = []

    for o in raw_orders:
        order_id = str(o.get('id', ''))
        if not order_id:
            skipped += 1
            continue

        # Map Shopify financial_status -> our shopify_status choices
        financial_status = o.get('financial_status', 'open')
        fulfillment_status = o.get('fulfillment_status') or 'open'
        if fulfillment_status == 'fulfilled':
            shopify_status = 'fulfilled'
        elif financial_status == 'refunded' or o.get('cancelled_at'):
            shopify_status = 'cancelled'
        else:
            shopify_status = 'open'

        total_price = float(o.get('total_price', 0) or 0)
        created_at_str = o.get('created_at', '')

        # Parse created_at timestamp
        from django.utils.dateparse import parse_datetime
        created_at = parse_datetime(created_at_str) if created_at_str else timezone.now()
        if created_at and created_at.tzinfo is None:
            from django.utils import timezone as tz
            created_at = tz.make_aware(created_at)

        line_items = o.get('line_items', [])
        if not line_items:
            skipped += 1
            continue

        for item in line_items:
            shopify_product_id = str(item.get('product_id', ''))
            if not shopify_product_id or shopify_product_id == 'None':
                skipped += 1
                continue

            # Find matching local product
            try:
                product = Product.objects.get(shopify_product_id=shopify_product_id)
            except Product.DoesNotExist:
                logger.debug(f"Product {shopify_product_id} not found locally — run sync_products first.")
                skipped += 1
                continue

            item_price = float(item.get('price', total_price) or total_price)
            cogs = float(product.cogs or 0)

            # Use order_id + item variant_id as unique order line ref
            line_order_id = f"{order_id}-{item.get('variant_id', item.get('id', ''))}"

            order_obj, created_flag = MarketingOrder.objects.update_or_create(
                order_id=line_order_id,
                defaults={
                    'product': product,
                    'price': item_price,
                    'cogs': cogs,
                    'shopify_status': shopify_status,
                    'created_at': created_at,
                }
            )

            if created_flag:
                created += 1
            else:
                updated += 1

    logger.info(f"Shopify order sync complete: {created} created, {updated} updated, {skipped} skipped.")
    return {
        'status': 'success',
        'orders_fetched': len(raw_orders),
        'lines_created': created,
        'lines_updated': updated,
        'skipped': skipped,
    }


def sync_customers(shop: Optional[str] = None) -> dict:
    """
    Pull all customers from Shopify and upsert into ShopifyCustomer model.
    """
    from products.models import ShopifyCustomer
    client = _get_client(shop)
    raw_customers = client.fetch_customers(limit=250)

    created = 0
    updated = 0
    skipped = 0

    for c in raw_customers:
        cust_id = str(c.get('id', ''))
        if not cust_id:
            skipped += 1
            continue

        first_name = c.get('first_name', '') or ''
        last_name = c.get('last_name', '') or ''
        email = c.get('email')
        phone = c.get('phone')
        orders_count = int(c.get('orders_count', 0) or 0)
        total_spent = float(c.get('total_spent', 0) or 0)

        city = None
        default_address = c.get('default_address') or {}
        if default_address:
            city = default_address.get('city')

        customer_obj, created_flag = ShopifyCustomer.objects.update_or_create(
            shopify_customer_id=cust_id,
            defaults={
                'first_name': first_name,
                'last_name': last_name,
                'email': email,
                'phone': phone,
                'city': city,
                'orders_count': orders_count,
                'total_spent': total_spent,
            }
        )

        if created_flag:
            created += 1
        else:
            updated += 1

    logger.info(f"Shopify customer sync complete: {created} created, {updated} updated, {skipped} skipped.")
    return {
        'status': 'success',
        'customers_fetched': len(raw_customers),
        'created': created,
        'updated': updated,
        'skipped': skipped,
    }


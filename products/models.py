from django.db import models
from core.models import Brand
from core.encryption import encrypt_value, decrypt_value

class Product(models.Model):
    brand = models.ForeignKey(Brand, on_delete=models.CASCADE, related_name='products')
    shopify_product_id = models.CharField(max_length=255, blank=True, null=True)
    title = models.CharField(max_length=255)
    handle = models.SlugField(max_length=255, blank=True)
    description = models.TextField(blank=True)
    price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    cogs = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True, help_text="Cost of Goods Sold (Unit cost)")
    image_url = models.URLField(max_length=1000, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.brand.name} - {self.title}"


class ShopifyStore(models.Model):
    shop = models.CharField(max_length=255, unique=True)
    access_token_encrypted = models.TextField(blank=True)
    scope = models.CharField(max_length=500, blank=True, default='write_products,read_products,read_orders,write_orders')
    installed_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def set_access_token(self, token_str: str):
        self.access_token_encrypted = encrypt_value(token_str)

    def get_access_token(self) -> str:
        return decrypt_value(self.access_token_encrypted)

    def is_valid(self) -> bool:
        token = self.get_access_token()
        return bool(token and not token.startswith("your_"))

    def __str__(self):
        return f"ShopifyStore {self.shop}"


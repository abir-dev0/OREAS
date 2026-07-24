from django.db import models
from core.models import Brand

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

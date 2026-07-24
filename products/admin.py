from django.contrib import admin
from products.models import Product

@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ('title', 'brand', 'price', 'shopify_product_id', 'created_at')
    list_filter = ('brand', 'created_at')
    search_fields = ('title', 'shopify_product_id', 'brand__name')
    prepopulated_fields = {'handle': ('title',)}

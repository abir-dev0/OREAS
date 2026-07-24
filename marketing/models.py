from django.db import models
from core.models import Brand
from products.models import Product
from core.encryption import encrypt_value, decrypt_value

class MetaAdAccount(models.Model):
    brand = models.ForeignKey(Brand, on_delete=models.CASCADE, related_name='meta_ad_accounts')
    ad_account_id = models.CharField(max_length=255, unique=True)  # e.g. act_1234567890
    name = models.CharField(max_length=255, blank=True)
    access_token_encrypted = models.TextField(blank=True, null=True)
    is_active = models.BooleanField(default=True)
    last_sync_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def set_access_token(self, token_str: str):
        self.access_token_encrypted = encrypt_value(token_str)

    def get_access_token(self) -> str:
        if not self.access_token_encrypted:
            return ""
        return decrypt_value(self.access_token_encrypted)

    def __str__(self):
        return f"{self.brand.name} - {self.name or self.ad_account_id}"


class ProductTest(models.Model):
    test_id = models.CharField(max_length=100, unique=True)  # e.g. TEST-1001
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='tests')
    created_at = models.DateTimeField(auto_now_add=True)
    status = models.CharField(max_length=50, default='ACTIVE')  # ACTIVE, COMPLETED, ARCHIVED
    notes = models.TextField(blank=True)

    def __str__(self):
        return f"{self.test_id} - {self.product.title} ({self.status})"


class MetaAdCreative(models.Model):
    creative_id = models.CharField(max_length=255, unique=True)
    name = models.CharField(max_length=255)
    image_url = models.URLField(max_length=1000, blank=True, null=True)
    video_url = models.URLField(max_length=1000, blank=True, null=True)
    body = models.TextField(blank=True, null=True)
    title = models.CharField(max_length=255, blank=True, null=True)
    
    # Meta features for AI training
    format = models.CharField(max_length=50, default='VIDEO')  # VIDEO, IMAGE, CAROUSEL
    hook_type = models.CharField(max_length=100, blank=True, null=True)  # unboxing, dynamic, lifestyle, problem_solving
    has_model = models.BooleanField(default=True)
    video_duration = models.IntegerField(null=True, blank=True)  # in seconds
    editing_style = models.CharField(max_length=100, blank=True, null=True)  # ugc, cinematic, dynamic
    language = models.CharField(max_length=50, default='Darija')

    def __str__(self):
        return f"Creative {self.name} ({self.format})"


class MetaCampaign(models.Model):
    campaign_id = models.CharField(max_length=255, unique=True)
    ad_account = models.ForeignKey(MetaAdAccount, on_delete=models.CASCADE, related_name='campaigns')
    name = models.CharField(max_length=255)
    status = models.CharField(max_length=100)
    objective = models.CharField(max_length=100, blank=True, null=True)
    linked_test = models.ForeignKey(ProductTest, null=True, blank=True, on_delete=models.SET_NULL, related_name='campaigns')
    created_time = models.DateTimeField()
    updated_time = models.DateTimeField()
    synced_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.name} ({self.campaign_id})"


class MetaAdSet(models.Model):
    adset_id = models.CharField(max_length=255, unique=True)
    campaign = models.ForeignKey(MetaCampaign, on_delete=models.CASCADE, related_name='adsets')
    name = models.CharField(max_length=255)
    status = models.CharField(max_length=100)
    daily_budget = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    lifetime_budget = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    optimization_goal = models.CharField(max_length=100, blank=True, null=True)
    billing_event = models.CharField(max_length=100, blank=True, null=True)
    created_time = models.DateTimeField()
    updated_time = models.DateTimeField()

    def __str__(self):
        return f"{self.name} ({self.adset_id})"


class MetaAd(models.Model):
    ad_id = models.CharField(max_length=255, unique=True)
    adset = models.ForeignKey(MetaAdSet, on_delete=models.CASCADE, related_name='ads')
    name = models.CharField(max_length=255)
    status = models.CharField(max_length=100)
    creative = models.ForeignKey(MetaAdCreative, null=True, blank=True, on_delete=models.SET_NULL, related_name='ads')
    created_time = models.DateTimeField()
    updated_time = models.DateTimeField()

    def __str__(self):
        return f"{self.name} ({self.ad_id})"


class MarketingOrder(models.Model):
    SHOPIFY_STATUS_CHOICES = [
        ('open', 'Open'),
        ('cancelled', 'Cancelled'),
        ('fulfilled', 'Fulfilled'),
    ]
    CALL_CENTER_STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('confirmed', 'Confirmed'),
        ('cancelled', 'Cancelled'),
    ]
    DELIVERY_STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('out_for_delivery', 'Out for Delivery'),
        ('delivered', 'Delivered & Paid'),
        ('failed', 'Delivery Failed'),
    ]

    order_id = models.CharField(max_length=255, unique=True)
    campaign = models.ForeignKey(MetaCampaign, on_delete=models.CASCADE, null=True, blank=True, related_name='orders')
    ad = models.ForeignKey(MetaAd, on_delete=models.SET_NULL, null=True, blank=True, related_name='orders')
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='marketing_orders')
    price = models.DecimalField(max_digits=10, decimal_places=2)
    cogs = models.DecimalField(max_digits=10, decimal_places=2, help_text="Product Cost of Goods Sold")
    
    # Cost parameters for full-funnel reporting
    call_center_cost = models.DecimalField(max_digits=10, decimal_places=2, default=15.00) # verification phone cost
    shipping_cost = models.DecimalField(max_digits=10, decimal_places=2, default=40.00)    # delivery shipping cost
    return_cost = models.DecimalField(max_digits=10, decimal_places=2, default=20.00)      # return fee
    
    shopify_status = models.CharField(max_length=50, choices=SHOPIFY_STATUS_CHOICES, default='open')
    call_center_status = models.CharField(max_length=50, choices=CALL_CENTER_STATUS_CHOICES, default='pending')
    delivery_status = models.CharField(max_length=50, choices=DELIVERY_STATUS_CHOICES, default='pending')
    is_returned = models.BooleanField(default=False)
    
    created_at = models.DateTimeField()

    def __str__(self):
        return f"Order {self.order_id} - {self.shopify_status}/{self.call_center_status}/{self.delivery_status}"


class MetaAdPerformanceInsight(models.Model):
    campaign = models.ForeignKey(MetaCampaign, on_delete=models.CASCADE, related_name='insights')
    ad = models.ForeignKey(MetaAd, on_delete=models.CASCADE, null=True, blank=True, related_name='insights')
    date = models.DateField()
    
    # Ad performance metrics
    spend = models.DecimalField(max_digits=12, decimal_places=2, default=0.0)
    impressions = models.IntegerField(default=0)
    clicks = models.IntegerField(default=0)
    reach = models.IntegerField(default=0)
    
    # Full post-purchase funnel conversions
    purchases = models.IntegerField(default=0, help_text="Raw Shopify orders")
    purchases_value = models.DecimalField(max_digits=12, decimal_places=2, default=0.0, help_text="Gross order value")
    
    confirmed_purchases = models.IntegerField(default=0, help_text="Confirmed by Call Center")
    delivered_purchases = models.IntegerField(default=0, help_text="Delivered & Paid")
    returned_purchases = models.IntegerField(default=0, help_text="Returned orders")
    
    # Financial indicators
    total_cogs = models.DecimalField(max_digits=12, decimal_places=2, default=0.0, help_text="Cost of goods sold for delivered items")
    total_call_center_cost = models.DecimalField(max_digits=12, decimal_places=2, default=0.0)
    total_shipping_cost = models.DecimalField(max_digits=12, decimal_places=2, default=0.0)
    total_return_cost = models.DecimalField(max_digits=12, decimal_places=2, default=0.0)
    
    total_expenses = models.DecimalField(max_digits=12, decimal_places=2, default=0.0, help_text="spend + cogs + shipping + call center + returns")
    net_profit = models.DecimalField(max_digits=12, decimal_places=2, default=0.0)
    
    # Ratios
    ctr = models.FloatField(default=0.0)
    cpc = models.DecimalField(max_digits=10, decimal_places=2, default=0.0)
    cpm = models.DecimalField(max_digits=10, decimal_places=2, default=0.0)
    cost_per_result = models.DecimalField(max_digits=10, decimal_places=2, default=0.0)
    roas = models.FloatField(default=0.0, help_text="Gross ROAS (conversions / spend)")
    
    raw_data = models.JSONField(default=dict, blank=True)

    class Meta:
        unique_together = ('campaign', 'ad', 'date')
        ordering = ['-date']

    def __str__(self):
        target = f"Ad {self.ad.name}" if self.ad else f"Campaign {self.campaign.name}"
        return f"Insight {target} on {self.date}"

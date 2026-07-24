from django.db import models

class Brand(models.Model):
    name = models.CharField(max_length=255)
    slug = models.SlugField(unique=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


class PlatformSettings(models.Model):
    """
    Platform-wide settings for OREAS Intelligence.
    """
    candidate_threshold = models.FloatField(default=40.0, help_text="AI score threshold (0-100) for promoting posts to Candidates")
    sync_frequency = models.CharField(max_length=50, default='hourly', choices=[
        ('hourly', 'Every hour'),
        ('6hours', 'Every 6 hours'),
        ('daily', 'Once daily'),
    ])
    auto_shopify_integration = models.BooleanField(default=True, help_text="Auto-create Shopify products for candidates")
    analysis_language = models.CharField(max_length=100, default='Français + Darija + Anglais')
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Platform Settings (updated {self.updated_at.strftime('%Y-%m-%d')})"

    class Meta:
        verbose_name = "Platform Settings"
        verbose_name_plural = "Platform Settings"

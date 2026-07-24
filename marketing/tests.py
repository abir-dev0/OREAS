from django.test import TestCase
from django.utils import timezone
import decimal
from core.models import Brand
from products.models import Product
from marketing.models import (
    MetaAdAccount, ProductTest, MetaAdCreative, 
    MetaCampaign, MetaAdSet, MetaAd, MarketingOrder, 
    MetaAdPerformanceInsight
)
from marketing.tasks import sync_ad_account_data, extract_test_id_and_match_product

class MarketingIntegrationTests(TestCase):
    def setUp(self):
        # Create brand
        self.brand = Brand.objects.create(name="OREAS", slug="oreas")
        
        # Create products to test matching
        self.p1 = Product.objects.create(
            brand=self.brand,
            title="Robe Lin Beige",
            handle="robe-lin-beige",
            price=decimal.Decimal("450.00"),
            cogs=decimal.Decimal("130.00"),
            shopify_product_id="sh_prod_1"
        )
        self.p2 = Product.objects.create(
            brand=self.brand,
            title="Soie Lilas Maxi",
            handle="soie-lilas-maxi",
            price=decimal.Decimal("350.00"),
            cogs=decimal.Decimal("110.00"),
            shopify_product_id="sh_prod_2"
        )
        
        # Create Ad Account with a mock id to trigger mock client in tasks
        self.ad_account = MetaAdAccount.objects.create(
            brand=self.brand,
            ad_account_id="mock_ad_account_test",
            name="Test Ad Account"
        )

    def test_product_test_auto_matching(self):
        # Run matcher on a campaign name with [TEST-1001]
        campaign_name = "US_LA - [TEST-1001] Robe Lin Beige - Conversions"
        test_obj = extract_test_id_and_match_product(campaign_name, self.brand)
        
        self.assertIsNotNone(test_obj)
        self.assertEqual(test_obj.test_id, "TEST-1001")
        self.assertEqual(test_obj.product, self.p1)
        self.assertEqual(test_obj.status, "ACTIVE")

    def test_complete_synchronization_flow(self):
        # Run the celery task synchronously
        sync_ad_account_data(self.ad_account.id)
        
        # Verify Product Tests are auto-created for mock campaigns
        tests = ProductTest.objects.all()
        self.assertEqual(tests.count(), 5) # 5 mock campaigns = 5 tests
        
        # Verify campaigns are synced and linked to tests
        campaigns = MetaCampaign.objects.filter(ad_account=self.ad_account)
        self.assertEqual(campaigns.count(), 5)
        
        c1 = campaigns.get(name__icontains="Robe Lin Beige")
        self.assertIsNotNone(c1.linked_test)
        self.assertEqual(c1.linked_test.product, self.p1)

        # Verify adsets are synced
        self.assertEqual(MetaAdSet.objects.count(), 6)
        
        # Verify creatives are synced
        self.assertEqual(MetaAdCreative.objects.count(), 7) # 7 mock creatives
        
        # Verify ads are synced and linked to creatives
        ads = MetaAd.objects.all()
        self.assertEqual(ads.count(), 7)
        for ad in ads:
            self.assertIsNotNone(ad.creative)

        # Verify orders are populated
        orders = MarketingOrder.objects.all()
        self.assertGreater(orders.count(), 0)
        sample_order = orders.first()
        self.assertIsNotNone(sample_order.ad)
        self.assertIsNotNone(sample_order.campaign)
        self.assertEqual(sample_order.product, sample_order.campaign.linked_test.product)

        # Verify insights (both ad-level and campaign summaries are loaded)
        insights = MetaAdPerformanceInsight.objects.all()
        self.assertGreater(insights.count(), 0)
        
        # Check an ad-level performance insight
        ad_insight = insights.filter(ad__isnull=False).first()
        self.assertIsNotNone(ad_insight.ad)
        self.assertGreater(ad_insight.spend, 0)
        self.assertGreaterEqual(ad_insight.net_profit, -1000000000000000000) # can be profit or loss
        self.assertGreaterEqual(ad_insight.total_expenses, ad_insight.spend)
        
        # Check campaign aggregate insight
        camp_insight = insights.filter(ad__isnull=True).first()
        self.assertNilAd = camp_insight.ad is None
        self.assertTrue(self.assertNilAd)
        self.assertGreater(camp_insight.spend, 0)

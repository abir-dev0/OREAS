from decimal import Decimal
from django.test import TestCase
from orders.models import Order, OrderSyncHistory, SyncLog
from orders.services.importer import OrderImportService

class EnterpriseOrderImportServiceTest(TestCase):

    def setUp(self):
        self.importer = OrderImportService(source_name='excel_online')

    def test_version_history_and_source_tracking(self):
        records = [
            {
                "order_number": "ENT-101",
                "customer_name": "Karim Tazi",
                "customer_phone": "+212600000000",
                "product_name": "Leather Jacket",
                "quantity": 1,
                "total_price": "1500.00",
                "status": "confirmed",
                "_row_number": 2,
                "_raw_payload": {"N° Commande": "ENT-101", "Client": "Karim Tazi"}
            }
        ]

        sync_log = self.importer.process_import(
            records,
            unique_key_field='order_number',
            metadata={'file_id': 'item-abc-123'}
        )

        self.assertEqual(sync_log.status, 'success')
        self.assertEqual(sync_log.imported_count, 1)

        order = Order.objects.get(order_number="ENT-101")
        self.assertEqual(order.source_system, "excel_online")
        self.assertEqual(order.source_file_id, "item-abc-123")
        self.assertEqual(order.source_row_number, 2)
        self.assertFalse(order.is_archived)

        # Check Requirement 1: Audit History created
        history = order.history.all()
        self.assertEqual(history.count(), 1)
        self.assertEqual(history.first().raw_payload, {"N° Commande": "ENT-101", "Client": "Karim Tazi"})

    def test_soft_deletion(self):
        # Initial import of 2 orders
        records_batch1 = [
            {"order_number": "ENT-201", "customer_name": "Client A", "_row_number": 2},
            {"order_number": "ENT-202", "customer_name": "Client B", "_row_number": 3}
        ]
        self.importer.process_import(records_batch1, unique_key_field='order_number')
        self.assertEqual(Order.objects.filter(is_archived=False).count(), 2)

        # Batch 2: ENT-202 disappeared from Excel file
        records_batch2 = [
            {"order_number": "ENT-201", "customer_name": "Client A", "_row_number": 2}
        ]
        sync_log = self.importer.process_import(records_batch2, unique_key_field='order_number')

        self.assertEqual(sync_log.archived_count, 1)

        order202 = Order.objects.get(order_number="ENT-202")
        self.assertTrue(order202.is_archived)
        self.assertIn("Disappeared", order202.archived_reason)

    def test_conflict_detection_and_resolution(self):
        records = [{"order_number": "ENT-301", "customer_name": "Original Name", "_row_number": 2}]
        self.importer.process_import(records, unique_key_field='order_number')

        order = Order.objects.get(order_number="ENT-301")
        
        # Simulate manual update inside OREAS
        order.customer_name = "Manually Edited Name"
        order.is_manually_edited = True
        order.save()

        # Incoming sync has different data in Excel
        incoming_records = [{"order_number": "ENT-301", "customer_name": "Excel Name Update", "_row_number": 2}]
        sync_log = self.importer.process_import(incoming_records, unique_key_field='order_number')

        self.assertEqual(sync_log.conflict_count, 1)
        order.refresh_from_db()
        self.assertTrue(order.has_conflict)
        self.assertEqual(order.customer_name, "Manually Edited Name")  # Preserved local edit

        # Resolve conflict via API
        response = self.client.post(f'/api/orders/conflicts/{order.id}/resolve/', {'action': 'apply_incoming'}, content_type='application/json')
        self.assertEqual(response.status_code, 200)

        order.refresh_from_db()
        self.assertFalse(order.has_conflict)
        self.assertEqual(order.customer_name, "Excel Name Update")

    def test_validation_engine_non_blocking(self):
        records = [
            # Valid row
            {"order_number": "VAL-001", "quantity": 2, "total_price": "100.00", "_row_number": 2},
            # Negative price
            {"order_number": "VAL-002", "quantity": 1, "total_price": "-50.00", "_row_number": 3},
            # Impossible quantity
            {"order_number": "VAL-003", "quantity": 0, "total_price": "50.00", "_row_number": 4},
            # Duplicate order number in same file
            {"order_number": "VAL-001", "quantity": 5, "total_price": "200.00", "_row_number": 5},
        ]

        sync_log = self.importer.process_import(records, unique_key_field='order_number')

        self.assertEqual(sync_log.imported_count, 1)
        self.assertEqual(sync_log.failed_count, 3)
        self.assertEqual(len(sync_log.validation_report), 3)
        self.assertEqual(sync_log.status, 'partial')

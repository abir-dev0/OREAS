import io
import openpyxl
from django.test import TestCase
from excel_sync.models import ExcelSyncSettings, OneDriveToken
from excel_sync.parser import ExcelOnlineAdapter
from orders.models import Order

class ExcelSyncTest(TestCase):

    def setUp(self):
        self.settings = ExcelSyncSettings.objects.create(
            is_active=True,
            header_row=1,
            unique_key_field='order_number',
            column_mapping={
                "N° Commande": "order_number",
                "Client": "customer_name",
                "Téléphone": "customer_phone",
                "Produit": "product_name",
                "Montant": "total_price",
                "Statut": "status"
            }
        )

    def _create_mock_excel_bytes(self) -> bytes:
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.append(["N° Commande", "Client", "Téléphone", "Produit", "Montant", "Statut", "Remarque Custom"])
        ws.append(["EX-9001", "Youssef Bennani", "+212622222222", "Kaftan Luxury", "1200.00", "confirmed", "VIP Client"])
        ws.append(["EX-9002", "Fatima Zahra", "+212633333333", "Djellaba Silk", "650.00", "shipped", "Express Shipping"])

        output = io.BytesIO()
        wb.save(output)
        return output.getvalue()

    def test_excel_online_adapter_parsing(self):
        xlsx_bytes = self._create_mock_excel_bytes()
        adapter = ExcelOnlineAdapter(self.settings)
        records = adapter.parse_workbook(xlsx_bytes)

        self.assertEqual(len(records), 2)
        rec1 = records[0]
        self.assertEqual(rec1['order_number'], "EX-9001")
        self.assertEqual(rec1['customer_name'], "Youssef Bennani")
        self.assertEqual(rec1['total_price'], "1200.00")
        self.assertIn("Remarque Custom", rec1['extra_attributes'])
        self.assertEqual(rec1['extra_attributes']['Remarque Custom'], "VIP Client")

    def test_header_inspection(self):
        xlsx_bytes = self._create_mock_excel_bytes()
        headers = ExcelOnlineAdapter.inspect_headers(xlsx_bytes, header_row=1)
        self.assertEqual(headers, ["N° Commande", "Client", "Téléphone", "Produit", "Montant", "Statut", "Remarque Custom"])

    def test_dashboard_status_endpoint(self):
        response = self.client.get('/api/excel-sync/status/')
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data['is_active'])
        self.assertEqual(data['current_oauth_token_status'], 'disconnected')
        self.assertEqual(data['current_webhook_status'], 'inactive')

import re
import logging
from decimal import Decimal, InvalidOperation
from datetime import datetime
from django.utils import timezone
from django.db import transaction
from orders.models import Order, OrderSyncHistory, SyncLog

logger = logging.getLogger(__name__)

class OrderImportService:
    """
    Enterprise Order Import Engine with:
    1. Historical versioning (OrderSyncHistory)
    2. Soft deletion (archiving disappeared orders)
    3. Granular source tracking metadata
    4. Conflict detection for manual OREAS edits
    5. Row validation reporting (non-blocking)
    """

    def __init__(self, source_name: str = 'excel_online'):
        self.source_name = source_name

    def process_import(
        self,
        normalized_records: list[dict],
        unique_key_field: str = 'order_number',
        metadata: dict = None
    ) -> SyncLog:
        """
        Executes an enterprise import run.
        
        :param normalized_records: List of record dicts. Each record may contain '_raw_row' and '_row_number'.
        :param unique_key_field: Model field used for deduplication.
        :param metadata: Dict containing source metadata e.g. {'file_id': '...', 'last_modified': dt}
        """
        metadata = metadata or {}
        source_file_id = metadata.get('file_id', '')
        source_last_modified = metadata.get('last_modified')

        started_time = timezone.now()
        sync_log = SyncLog.objects.create(
            source=self.source_name,
            status='running',
            started_at=started_time
        )

        imported_count = 0
        updated_count = 0
        skipped_count = 0
        archived_count = 0
        conflict_count = 0
        failed_count = 0

        validation_errors = []
        processed_unique_keys = set()

        for index, record in enumerate(normalized_records, start=1):
            row_number = record.get('_row_number', index)
            raw_payload = record.get('_raw_payload', record)

            # Step 1: Validate row data
            is_valid, validation_msgs, cleaned_data = self._validate_and_clean_record(
                record, index=row_number, unique_key_field=unique_key_field, seen_keys=processed_unique_keys
            )

            if not is_valid:
                failed_count += 1
                for msg in validation_msgs:
                    validation_errors.append({
                        "row": row_number,
                        "field": msg.get("field", "general"),
                        "error": msg.get("error", "Validation error"),
                        "value": msg.get("value")
                    })
                continue

            unique_val = cleaned_data[unique_key_field]
            processed_unique_keys.add(unique_val)

            # Extract defaults payload
            defaults = {k: v for k, v in cleaned_data.items() if k != unique_key_field}
            defaults['source_system'] = self.source_name
            defaults['source_file_id'] = source_file_id
            defaults['source_row_number'] = row_number
            defaults['source_last_modified'] = source_last_modified
            defaults['last_synced_at'] = timezone.now()

            try:
                existing_order = Order.objects.filter(**{unique_key_field: unique_val}).first()

                if not existing_order:
                    # Create new order
                    with transaction.atomic():
                        new_order = Order.objects.create(
                            **{unique_key_field: unique_val},
                            is_archived=False,
                            **defaults
                        )
                        # Requirement 1: Store raw history
                        OrderSyncHistory.objects.create(
                            order=new_order,
                            sync_log=sync_log,
                            raw_payload=self._make_json_serializable(raw_payload),
                            source_row_number=row_number
                        )
                    imported_count += 1

                else:
                    # If order was previously soft-deleted, un-archive it
                    if existing_order.is_archived:
                        existing_order.is_archived = False
                        existing_order.archived_at = None
                        existing_order.archived_reason = ''

                    # Requirement 4: Conflict Detection if order was manually edited in OREAS
                    if existing_order.is_manually_edited:
                        conflicting_fields = {}
                        for key, new_val in defaults.items():
                            if key in ('source_row_number', 'source_last_modified', 'last_synced_at', 'source_file_id'):
                                continue
                            current_val = getattr(existing_order, key, None)
                            if current_val != new_val:
                                conflicting_fields[key] = {
                                    "local_oreas_value": str(current_val),
                                    "incoming_excel_value": str(new_val)
                                }

                        if conflicting_fields:
                            existing_order.has_conflict = True
                            existing_order.conflict_data = {
                                "conflicting_fields": conflicting_fields,
                                "detected_at": timezone.now().isoformat(),
                                "incoming_payload": self._make_json_serializable(defaults)
                            }
                            existing_order.save()
                            conflict_count += 1
                            
                            # Preserve sync history log even on conflict
                            OrderSyncHistory.objects.create(
                                order=existing_order,
                                sync_log=sync_log,
                                raw_payload=self._make_json_serializable(raw_payload),
                                source_row_number=row_number
                            )
                            continue  # Do not overwrite manually edited fields

                    # Check for changes if no manual edit conflict
                    has_changes = False
                    for key, new_val in defaults.items():
                        current_val = getattr(existing_order, key, None)
                        if current_val != new_val:
                            has_changes = True
                            setattr(existing_order, key, new_val)

                    if has_changes:
                        with transaction.atomic():
                            existing_order.save()
                            OrderSyncHistory.objects.create(
                                order=existing_order,
                                sync_log=sync_log,
                                raw_payload=self._make_json_serializable(raw_payload),
                                source_row_number=row_number
                            )
                        updated_count += 1
                    else:
                        skipped_count += 1

            except Exception as e:
                logger.error(f"Error processing row {row_number} (Key: {unique_val}): {e}", exc_info=True)
                failed_count += 1
                validation_errors.append({
                    "row": row_number,
                    "field": "database",
                    "error": f"Database processing error: {str(e)}"
                })

        # Requirement 2: Soft Deletion for missing orders
        if processed_unique_keys:
            missing_orders = Order.objects.filter(
                source_system=self.source_name,
                is_archived=False
            ).exclude(**{f"{unique_key_field}__in": list(processed_unique_keys)})

            now = timezone.now()
            for missing_order in missing_orders:
                missing_order.is_archived = True
                missing_order.archived_at = now
                missing_order.archived_reason = f"Disappeared from {self.source_name} workbook"
                missing_order.save()
                archived_count += 1

        # Finalize SyncLog Telemetry
        completed_time = timezone.now()
        duration = (completed_time - started_time).total_seconds()

        sync_log.completed_at = completed_time
        sync_log.duration_seconds = round(duration, 2)
        sync_log.imported_count = imported_count
        sync_log.updated_count = updated_count
        sync_log.skipped_count = skipped_count
        sync_log.archived_count = archived_count
        sync_log.conflict_count = conflict_count
        sync_log.failed_count = failed_count
        sync_log.validation_report = validation_errors

        if failed_count > 0 and (imported_count > 0 or updated_count > 0):
            sync_log.status = 'partial'
            sync_log.error_message = f"{failed_count} row(s) failed validation during import."
        elif failed_count > 0 and imported_count == 0 and updated_count == 0:
            sync_log.status = 'failed'
            sync_log.error_message = "All rows failed validation."
        else:
            sync_log.status = 'success'

        sync_log.details = {
            "total_processed": len(normalized_records),
            "unique_key_field": unique_key_field,
            "duration_seconds": round(duration, 2),
            "source_file_id": source_file_id
        }
        sync_log.save()

        return sync_log

    def _validate_and_clean_record(self, record: dict, index: int, unique_key_field: str, seen_keys: set) -> tuple[bool, list, dict]:
        """
        Enterprise Requirement 5: Data Validation Engine.
        Validates duplicate keys, dates, negative prices, impossible quantities, phone numbers.
        """
        errors = []
        cleaned = {}

        unique_val = record.get(unique_key_field)

        # 1. Check required unique key
        if not unique_val or str(unique_val).strip() == '':
            errors.append({"field": unique_key_field, "error": f"Missing required unique key '{unique_key_field}'", "value": None})
            return False, errors, cleaned

        unique_val_str = str(unique_val).strip()

        # 2. Check batch duplicates
        if unique_val_str in seen_keys:
            errors.append({"field": unique_key_field, "error": f"Duplicate order key '{unique_val_str}' in same file", "value": unique_val_str})
            return False, errors, cleaned

        cleaned[unique_key_field] = unique_val_str

        # 3. Validate Quantity (must be integer > 0)
        raw_qty = record.get('quantity', 1)
        try:
            qty_int = int(raw_qty) if raw_qty is not None and str(raw_qty).strip() != '' else 1
            if qty_int <= 0:
                errors.append({"field": "quantity", "error": "Impossible quantity: must be greater than 0", "value": raw_qty})
            else:
                cleaned['quantity'] = qty_int
        except (ValueError, TypeError):
            errors.append({"field": "quantity", "error": "Invalid quantity format", "value": raw_qty})

        # 4. Validate Total Price (must be numeric >= 0)
        raw_price = record.get('total_price')
        if raw_price is not None and str(raw_price).strip() != '':
            try:
                price_str = str(raw_price).replace('$', '').replace('€', '').replace('DH', '').replace(',', '.').strip()
                price_dec = Decimal(price_str)
                if price_dec < 0:
                    errors.append({"field": "total_price", "error": "Negative price is not allowed", "value": raw_price})
                else:
                    cleaned['total_price'] = price_dec
            except (InvalidOperation, TypeError):
                errors.append({"field": "total_price", "error": "Invalid price format", "value": raw_price})
        else:
            cleaned['total_price'] = None

        # 5. Validate Order Date
        raw_date = record.get('order_date')
        if raw_date:
            if isinstance(raw_date, datetime):
                cleaned['order_date'] = timezone.make_aware(raw_date) if timezone.is_naive(raw_date) else raw_date
            elif isinstance(raw_date, str) and raw_date.strip():
                try:
                    dt = datetime.fromisoformat(raw_date.replace('Z', '+00:00'))
                    cleaned['order_date'] = timezone.make_aware(dt) if timezone.is_naive(dt) else dt
                except ValueError:
                    errors.append({"field": "order_date", "error": "Invalid date ISO format", "value": raw_date})
            else:
                cleaned['order_date'] = None
        else:
            cleaned['order_date'] = None

        # 6. Sanitize Customer Phone
        raw_phone = record.get('customer_phone', '')
        if raw_phone:
            cleaned_phone = re.sub(r'[^\d+]', '', str(raw_phone))
            cleaned['customer_phone'] = cleaned_phone
        else:
            cleaned['customer_phone'] = ''

        # Transfer string fields cleanly
        for key in ('customer_name', 'customer_email', 'product_name', 'status', 'extra_attributes'):
            if key in record:
                cleaned[key] = record[key]

        if errors:
            return False, errors, cleaned
        return True, [], cleaned

    @staticmethod
    def _make_json_serializable(data):
        """
        Converts non-serializable objects (like datetime or Decimal) to JSON-compatible types.
        """
        if isinstance(data, dict):
            return {k: OrderImportService._make_json_serializable(v) for k, v in data.items() if not k.startswith('_')}
        elif isinstance(data, (list, tuple)):
            return [OrderImportService._make_json_serializable(item) for item in data]
        elif isinstance(data, datetime):
            return data.isoformat()
        elif isinstance(data, Decimal):
            return str(data)
        return data

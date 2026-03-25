"""
Import all historical positions from the Excel Aux sheet:
  Table: RefTableAuxAssetPositionHistOfficial (columns 188-225, starting row 5)

13,977+ rows covering 430 trading days (2024-07-31 to 2026-03-24).
"""
import sys
from datetime import datetime
from django.core.management.base import BaseCommand
from bloomberg.models import PositionSnapshot, BloombergAsset


# Column mapping: col_index (0-based from col 188) -> field_name
COL_MAP = {
    0:  'date',                  # 188
    1:  'fund',                  # 189
    2:  'portfolio',             # 190
    3:  'asset_group',           # 191
    4:  'broker',                # 192
    5:  'asset_market',          # 193
    6:  'asset_ticker',          # 194
    7:  'is_leveraged',          # 195
    8:  'units_open',            # 196
    9:  'units_close',           # 197
    10: 'units_transaction',     # 198
    11: 'units_lending',         # 199
    12: 'units_margin',          # 200
    13: 'currency',              # 201
    14: 'avg_cost',              # 202
    15: 'price_open',            # 203
    16: 'price_close',           # 204
    17: 'price_open_source',     # 205
    18: 'price_close_source',    # 206
    19: 'price_open_date',       # 207
    20: 'price_close_date',      # 208
    21: 'price_open_official',   # 209
    22: 'price_close_official',  # 210
    23: 'delta_open',            # 211
    24: 'delta_close',           # 212
    25: 'underlying_price_open', # 213
    26: 'underlying_price_close',# 214
    27: 'contract_size',         # 215
    28: 'avg_price_transaction', # 216
    29: 'amount_open',           # 217
    30: 'amount_close',          # 218
    31: 'amount_transaction',    # 219
    32: 'pnl_open_position',     # 220
    33: 'pnl_transaction',       # 221
    34: 'pnl_transaction_fee',   # 222
    35: 'pnl_dividend',          # 223
    36: 'pnl_lending',           # 224
    37: 'pnl_total',             # 225
}

FLOAT_FIELDS = {
    'units_open', 'units_close', 'units_transaction', 'units_lending',
    'units_margin', 'avg_cost', 'price_open', 'price_close',
    'delta_open', 'delta_close', 'underlying_price_open', 'underlying_price_close',
    'contract_size', 'avg_price_transaction', 'amount_open', 'amount_close',
    'amount_transaction', 'pnl_open_position', 'pnl_transaction',
    'pnl_transaction_fee', 'pnl_dividend', 'pnl_lending', 'pnl_total',
}

DATE_FIELDS = {'date', 'price_open_date', 'price_close_date'}
BOOL_FIELDS = {'is_leveraged', 'price_open_official', 'price_close_official'}
STR_FIELDS = {
    'fund', 'portfolio', 'asset_group', 'broker', 'asset_market',
    'asset_ticker', 'currency', 'price_open_source', 'price_close_source',
}


def parse_float(val):
    if val is None or val == '' or val == '-9999':
        return None
    try:
        f = float(val)
        return None if f == -9999 else f
    except (ValueError, TypeError):
        return None


def parse_date(val):
    if val is None:
        return None
    if isinstance(val, datetime):
        return val.date()
    try:
        return datetime.strptime(str(val)[:10], '%Y-%m-%d').date()
    except (ValueError, TypeError):
        return None


def parse_bool(val):
    if val is None:
        return False
    if isinstance(val, bool):
        return val
    return str(val).lower() in ('true', '1', 'yes')


class Command(BaseCommand):
    help = "Import historical positions from Excel Aux sheet into PositionSnapshot"

    def add_arguments(self, parser):
        parser.add_argument(
            '--excel', type=str,
            default='perf_analysis.xlsm',
            help='Path to the Excel file'
        )
        parser.add_argument('--clear', action='store_true',
                            help='Clear existing positions before import')

    def handle(self, *args, **options):
        import openpyxl

        excel_path = options['excel']
        self.stdout.write(f"Loading {excel_path}...")
        wb = openpyxl.load_workbook(excel_path, data_only=True, read_only=True)
        ws = wb['Aux']

        # Build asset lookup
        asset_map = {}
        for a in BloombergAsset.objects.all():
            asset_map[a.code_bbg] = a
            if a.name:
                asset_map[a.name] = a

        if options['clear']:
            deleted = PositionSnapshot.objects.all().delete()[0]
            self.stdout.write(f"Cleared {deleted} existing positions")

        # Read all rows from col 188-225 starting at row 5
        rows_to_create = []
        skipped = 0
        row_num = 0

        for row in ws.iter_rows(min_row=5, min_col=188, max_col=225, values_only=True):
            # Stop at first empty date
            if row[0] is None:
                break

            row_num += 1
            record = {}

            for col_idx, field_name in COL_MAP.items():
                val = row[col_idx] if col_idx < len(row) else None

                if field_name in DATE_FIELDS:
                    record[field_name] = parse_date(val)
                elif field_name in FLOAT_FIELDS:
                    record[field_name] = parse_float(val)
                elif field_name in BOOL_FIELDS:
                    record[field_name] = parse_bool(val)
                elif field_name in STR_FIELDS:
                    record[field_name] = str(val).strip() if val else ''
                else:
                    record[field_name] = val

            # Skip if no valid date
            if not record.get('date'):
                skipped += 1
                continue

            # Skip if no asset ticker
            if not record.get('asset_ticker'):
                skipped += 1
                continue

            # Link to BloombergAsset
            ticker = record['asset_ticker']
            record['asset'] = asset_map.get(ticker)

            # Default currency
            if not record.get('currency'):
                record['currency'] = 'USD'

            # Default contract_size
            if record.get('contract_size') is None:
                record['contract_size'] = 1

            rows_to_create.append(PositionSnapshot(**record))

            # Batch insert every 5000
            if len(rows_to_create) >= 5000:
                PositionSnapshot.objects.bulk_create(
                    rows_to_create,
                    update_conflicts=True,
                    unique_fields=['date', 'fund', 'asset_ticker', 'portfolio'],
                    update_fields=[
                        'asset_group', 'broker', 'asset_market', 'asset',
                        'is_leveraged', 'units_open', 'units_close',
                        'units_transaction', 'units_lending', 'units_margin',
                        'currency', 'avg_cost', 'price_open', 'price_close',
                        'price_open_source', 'price_close_source',
                        'price_open_date', 'price_close_date',
                        'price_open_official', 'price_close_official',
                        'delta_open', 'delta_close',
                        'underlying_price_open', 'underlying_price_close',
                        'contract_size', 'avg_price_transaction',
                        'amount_open', 'amount_close', 'amount_transaction',
                        'pnl_open_position', 'pnl_transaction',
                        'pnl_transaction_fee', 'pnl_dividend',
                        'pnl_lending', 'pnl_total',
                    ],
                )
                self.stdout.write(f"  ... {row_num} rows processed")
                rows_to_create = []

        # Final batch
        if rows_to_create:
            PositionSnapshot.objects.bulk_create(
                rows_to_create,
                update_conflicts=True,
                unique_fields=['date', 'fund', 'asset_ticker', 'portfolio'],
                update_fields=[
                    'asset_group', 'broker', 'asset_market', 'asset',
                    'is_leveraged', 'units_open', 'units_close',
                    'units_transaction', 'units_lending', 'units_margin',
                    'currency', 'avg_cost', 'price_open', 'price_close',
                    'price_open_source', 'price_close_source',
                    'price_open_date', 'price_close_date',
                    'price_open_official', 'price_close_official',
                    'delta_open', 'delta_close',
                    'underlying_price_open', 'underlying_price_close',
                    'contract_size', 'avg_price_transaction',
                    'amount_open', 'amount_close', 'amount_transaction',
                    'pnl_open_position', 'pnl_transaction',
                    'pnl_transaction_fee', 'pnl_dividend',
                    'pnl_lending', 'pnl_total',
                ],
            )

        wb.close()

        total = PositionSnapshot.objects.count()
        self.stdout.write(self.style.SUCCESS(
            f"Done. {row_num} rows processed, {skipped} skipped. "
            f"Total positions in DB: {total}"
        ))

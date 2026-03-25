"""
Management command to import data from the Performance Analysis Excel dump
into Bloomberg tables.

Usage:
    python manage.py import_excel_dump
    python manage.py import_excel_dump --dry-run   # preview without saving
"""
import re
from datetime import date, datetime
from django.core.management.base import BaseCommand
from bloomberg.models import (
    BloombergAsset, BloombergField, BloombergFieldGroup,
    BloombergDataPoint, InternalNAV, PositionSnapshot,
)

EXCEL_PATH = (
    r"C:\Users\GabrielSarkis\Fractal Asset Gestão de Recursos Ltda"
    r"\Fractal Asset Gestão de Recursos Ltda - Documents\Gabriel"
    r"\bbg_agent\Performance Analysis - Sarkis - 2026.xlsm"
)

# Bloomberg equity ticker pattern: "TICKER CC" where CC is a 2-letter exchange code
BBG_EQUITY_RE = re.compile(
    r'^[A-Z0-9/]+\s+(US|BZ|BN|GY|CN|LN|JP|HK|FP|NA|SW|IT|GR|ID|IM|AU|SQ|SM|NO|FH|DC|BB|SS|KS|PL)$'
)

# Map asset_class from Risk table -> asset_group in our model
ASSET_CLASS_TO_GROUP = {
    'Equity': 'Stock',
    'Fixed Income': 'Fixed Income',
    'Cash Equivalent': 'Cash',
    'Commodity': 'Commodity',
    'FX': 'FX',
    'Alternatives': 'Alternative',
    'Real Estate': 'Alternative',
}

# Map risk_level text -> integer
RISK_LEVEL_MAP = {
    'Very Low': 1, 'Low': 2, 'Moderate': 3, 'High': 4, 'Very High': 5,
}

# Bloomberg field definitions for the 24 info types found in Distinct table
# Maps Info name -> (bbg_fld mnemonic, method, sph, is_critical)
FIELD_DEFS = {
    'PxClose':              ('PX_LAST',                    'ref', 'Hist', True),
    'Sector':               ('GICS_SECTOR_NAME',           'ref', 'Set',  False),
    'Country':              ('COUNTRY_ISO',                'ref', 'Set',  False),
    'Currency':             ('CRNCY',                      'ref', 'Set',  False),
    'Volatility360D':       ('VOLATILITY_360D',            'ref', 'Hist', False),
    'RawBeta':              ('RAW_BETA',                   'ref', 'Hist', False),
    'ReturnYTD':            ('RETURN_YTD',                 'ref', 'Hist', False),
    'DividendYieldLTM':     ('EQY_DVD_YLD_12M',            'ref', 'Hist', False),
    'PE_1FY_Cal':           ('BEST_PE_RATIO',              'ref', 'Hist', False),
    'TargetReturn_1FY':     ('BEST_TARGET_PRICE',          'ref', 'Hist', False),
    'TotHoldRecommendations': ('TOT_HOLD_REC',            'ref', 'Hist', False),
    'TotBuyRecommendations':  ('TOT_BUY_REC',             'ref', 'Hist', False),
    'TotSellRecommendations': ('TOT_SELL_REC',            'ref', 'Hist', False),
    'YieldToWorst':         ('YLD_YTM_BID',                'ref', 'Hist', True),
    'YieldToMaturity':      ('YLD_YTM_BID',                'ref', 'Hist', False),
    'MacaulayDuration':     ('DUR',                        'ref', 'Hist', False),
    'Convexity':            ('CONVEXITY',                  'ref', 'Hist', False),
    'Maturity':             ('MATURITY',                   'ref', 'Set',  False),
    'Coupon':               ('CPN',                        'ref', 'Set',  False),
    'CouponFrequency':      ('CPN_FREQ',                   'ref', 'Set',  False),
    'CouponNextDate':       ('NXT_CPN_DT',                 'ref', 'Set',  False),
    'CouponType':           ('CPN_TYP',                    'ref', 'Set',  False),
    'RatingSP':             ('RTG_SP',                     'ref', 'Set',  False),
    'IndexPxClose1D':       ('PX_LAST',                    'bdh', 'Hist', True),
}


def is_bbg_ticker(name: str) -> bool:
    """Heuristic: is this name a plausible Bloomberg ticker?"""
    if BBG_EQUITY_RE.match(name):
        return True
    # Single word tickers like CPNG, CVRDA6
    if re.match(r'^[A-Z0-9/]{2,10}$', name):
        return True
    # Index tickers
    if name.endswith(' Index'):
        return True
    return False


def detect_asset_market(name: str) -> str:
    """Guess asset_market from ticker name patterns."""
    nl = name.lower()
    if 'ndo' in nl or ' do ' in nl:
        return 'OPTION'
    if 'swap' in nl:
        return 'SWAP'
    if 'fwd' in nl:
        return 'FORWARD'
    if re.search(r'\d+\.\d+\s+(perp|\d{2}/\d{2}/\d{2})', nl):
        return 'BOND'
    if ' perp' in nl:
        return 'BOND'
    if re.search(r'\s+[CP]\d', name):
        return 'OPTION'
    if 'index' in nl:
        return 'INDEX'
    if 'cds ' in nl:
        return 'CDS'
    if 'cd ' in nl:
        return 'CD'
    if 'govt' in nl:
        return 'GOVT_BOND'
    return ''


class Command(BaseCommand):
    help = 'Import data from Performance Analysis Excel dump into Bloomberg tables'

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true', help='Preview without saving')

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        if dry_run:
            self.stdout.write(self.style.WARNING('DRY RUN — no data will be saved'))

        import openpyxl
        self.stdout.write('Loading Excel file...')
        wb = openpyxl.load_workbook(EXCEL_PATH, data_only=True, read_only=True)
        ws = wb['Aux']
        rows = list(ws.iter_rows(min_row=5, max_row=600, values_only=False))

        self._import_assets(rows, dry_run)
        self._update_asset_groups(rows, dry_run)
        self._import_fields(dry_run)
        self._import_nav(rows, dry_run)
        self._import_distinct_data(rows, dry_run)
        self._import_index_prices(rows, dry_run)
        self._import_current_positions(rows, dry_run)
        self._import_hist_positions(rows, dry_run)

        wb.close()
        self.stdout.write(self.style.SUCCESS('Done!'))

    def _get_row_dict(self, row, col_start, col_end):
        """Extract column values from a row within a range."""
        vals = {}
        for c in row:
            try:
                if c.column and col_start <= c.column <= col_end and c.value is not None:
                    vals[c.column] = c.value
            except AttributeError:
                pass
        return vals

    def _import_assets(self, rows, dry_run):
        """Step 1: Import all assets from Risk MarketExposure table."""
        self.stdout.write('\n=== Step 1: Importing assets from Risk MarketExposure ===')
        created = updated = 0

        for row in rows:
            vals = self._get_row_dict(row, 351, 380)
            if 351 not in vals:
                continue

            name = str(vals[351]).strip()
            if not name:
                continue

            weight = vals.get(352, 100)
            asset_class_raw = str(vals.get(353, '')).strip()
            country = str(vals.get(354, '')).strip()
            currency = str(vals.get(355, '')).strip()
            sector = str(vals.get(356, '')).strip()
            risk_level_raw = str(vals.get(357, '')).strip()
            discretionary = bool(vals.get(358, False))

            risk_level = RISK_LEVEL_MAP.get(risk_level_raw)
            asset_group = ASSET_CLASS_TO_GROUP.get(asset_class_raw, asset_class_raw)
            bbg_flag = is_bbg_ticker(name)
            asset_market = detect_asset_market(name)

            defaults = {
                'name': '',
                'asset_group': asset_group,
                'is_active': True,
                'is_bbg_ticker': bbg_flag,
                'request_bbg_data': bbg_flag,
                'currency': currency or 'USD',
                'asset_market': asset_market,
                'asset_class': asset_class_raw,
                'country': country,
                'risk_currency': currency,
                'sector': sector,
                'risk_level': risk_level,
                'risk_weight': float(weight) * 100 if isinstance(weight, (int, float)) and weight <= 1 else float(weight or 100),
                'is_discretionary': discretionary,
            }

            if dry_run:
                self.stdout.write(f'  {"[BBG]" if bbg_flag else "[INT]"} {name} -> group={asset_group}, market={asset_market}')
                created += 1
            else:
                obj, was_created = BloombergAsset.objects.update_or_create(
                    code_bbg=name,
                    defaults=defaults,
                )
                if was_created:
                    created += 1
                else:
                    updated += 1

        self.stdout.write(self.style.SUCCESS(f'  Assets: {created} created, {updated} updated'))

    def _update_asset_groups(self, rows, dry_run):
        """Step 2: Update asset_group from Position Assets + Historical Assets (more specific groups)."""
        self.stdout.write('\n=== Step 2: Updating asset groups from Position/Historical Assets ===')
        updated = 0

        for row in rows:
            # Position Assets: 321=Portfolio, 322=AssetGroup, 323=Asset
            pa = self._get_row_dict(row, 321, 325)
            if 323 in pa and 322 in pa:
                ticker = str(pa[323]).strip()
                group = str(pa[322]).strip()
                if not dry_run:
                    n = BloombergAsset.objects.filter(code_bbg=ticker).update(asset_group=group)
                    updated += n
                else:
                    self.stdout.write(f'  {ticker} -> asset_group={group}')
                    updated += 1

            # Historical Assets: 326=Portfolio, 327=AssetGroup, 328=Asset
            ha = self._get_row_dict(row, 326, 330)
            if 328 in ha and 327 in ha:
                ticker = str(ha[328]).strip()
                group = str(ha[327]).strip()
                if not dry_run:
                    BloombergAsset.objects.filter(code_bbg=ticker).update(asset_group=group)
                    # Don't double-count
                else:
                    self.stdout.write(f'  {ticker} -> asset_group={group}')

        self.stdout.write(self.style.SUCCESS(f'  Updated {updated} assets'))

    def _import_fields(self, dry_run):
        """Step 3: Create BloombergField entries for all 24 info types."""
        self.stdout.write('\n=== Step 3: Creating BloombergField entries ===')
        created = 0

        for name, (bbg_fld, method, sph, is_critical) in FIELD_DEFS.items():
            if dry_run:
                self.stdout.write(f'  {name} -> {bbg_fld} ({method}/{sph})')
                created += 1
            else:
                _, was_created = BloombergField.objects.update_or_create(
                    name=name,
                    defaults={
                        'bbg_fld': bbg_fld,
                        'method': method,
                        'sph': sph,
                        'is_critical': is_critical,
                        'is_active': True,
                    },
                )
                if was_created:
                    created += 1

        self.stdout.write(self.style.SUCCESS(f'  Fields: {created} created'))

    def _import_nav(self, rows, dry_run):
        """Step 4: Import NAV history."""
        self.stdout.write('\n=== Step 4: Importing NAV history ===')
        created = skipped = 0

        for row in rows:
            vals = self._get_row_dict(row, 279, 287)
            if 279 not in vals or 280 not in vals:
                continue

            fund = str(vals[279]).strip()
            nav_date_raw = vals[280]
            if isinstance(nav_date_raw, datetime):
                nav_date = nav_date_raw.date()
            elif isinstance(nav_date_raw, date):
                nav_date = nav_date_raw
            else:
                skipped += 1
                continue

            total_nav = float(vals.get(281, 0) or 0)
            total_shares = float(vals.get(282, 0) or 0)
            nav_per_share = float(vals.get(283, 0) or 0)

            if dry_run:
                if created < 5:
                    self.stdout.write(f'  {fund} {nav_date} NAV={total_nav:.2f} shares={total_shares:.2f} per_share={nav_per_share:.6f}')
                created += 1
            else:
                _, was_created = InternalNAV.objects.update_or_create(
                    fund=fund,
                    date=nav_date,
                    defaults={
                        'total_nav': total_nav,
                        'total_shares': total_shares,
                        'nav_per_share': nav_per_share,
                    },
                )
                if was_created:
                    created += 1

        self.stdout.write(self.style.SUCCESS(f'  NAV records: {created} created, {skipped} skipped'))

    def _import_distinct_data(self, rows, dry_run):
        """Step 5: Import Distinct data as BloombergDataPoints."""
        self.stdout.write('\n=== Step 5: Importing Distinct data (asset info snapshots) ===')
        created = skipped = 0

        # Pre-load lookups
        if not dry_run:
            asset_map = {a.code_bbg: a for a in BloombergAsset.objects.all()}
            field_map = {f.name: f for f in BloombergField.objects.all()}
        else:
            asset_map = {}
            field_map = {}

        for row in rows:
            vals = self._get_row_dict(row, 331, 341)
            if 334 not in vals or 335 not in vals:
                continue

            asset_ticker = str(vals[334]).strip()
            info_name = str(vals[335]).strip()
            date_raw = vals.get(332)
            str_val = vals.get(336)
            flt_val = vals.get(337)

            if isinstance(date_raw, datetime):
                dp_date = date_raw.date()
            elif isinstance(date_raw, date):
                dp_date = date_raw
            else:
                dp_date = date.today()

            if info_name not in FIELD_DEFS:
                skipped += 1
                continue

            if dry_run:
                if created < 10:
                    self.stdout.write(f'  {asset_ticker}/{info_name} = {flt_val or str_val} @ {dp_date}')
                created += 1
                continue

            asset = asset_map.get(asset_ticker)
            field = field_map.get(info_name)
            if not asset or not field:
                skipped += 1
                continue

            _, was_created = BloombergDataPoint.objects.update_or_create(
                asset=asset,
                field=field,
                date=dp_date,
                date_ref='',
                defaults={
                    'value': float(flt_val) if flt_val is not None else None,
                    'value_str': str(str_val) if str_val else '',
                },
            )
            if was_created:
                created += 1

        self.stdout.write(self.style.SUCCESS(f'  Data points: {created} created, {skipped} skipped'))

    def _import_index_prices(self, rows, dry_run):
        """Step 6: Import Indexes Price as BloombergDataPoints."""
        self.stdout.write('\n=== Step 6: Importing Indexes Price history ===')
        created = skipped = 0

        # Pre-load or create index assets
        if not dry_run:
            field_map = {f.name: f for f in BloombergField.objects.all()}
        else:
            field_map = {}

        index_assets_seen = set()

        for row in rows:
            vals = self._get_row_dict(row, 301, 312)
            if 304 not in vals or 302 not in vals:
                continue

            asset_ticker = str(vals[304]).strip()
            date_raw = vals[302]
            info_name = str(vals.get(305, '')).strip()
            flt_val = vals.get(307)

            if isinstance(date_raw, datetime):
                dp_date = date_raw.date()
            elif isinstance(date_raw, date):
                dp_date = date_raw
            else:
                skipped += 1
                continue

            if dry_run:
                if created < 5:
                    self.stdout.write(f'  {asset_ticker}/{info_name} = {flt_val} @ {dp_date}')
                created += 1
                continue

            # Ensure index asset exists
            if asset_ticker not in index_assets_seen:
                BloombergAsset.objects.update_or_create(
                    code_bbg=asset_ticker,
                    defaults={
                        'name': asset_ticker,
                        'asset_group': 'Index',
                        'is_active': True,
                        'is_bbg_ticker': True,
                        'request_bbg_data': True,
                        'asset_market': 'INDEX',
                    },
                )
                index_assets_seen.add(asset_ticker)

            asset = BloombergAsset.objects.get(code_bbg=asset_ticker)
            # Map to IndexPxClose1D field
            field = field_map.get(info_name) or field_map.get('IndexPxClose1D')
            if not field:
                skipped += 1
                continue

            _, was_created = BloombergDataPoint.objects.update_or_create(
                asset=asset,
                field=field,
                date=dp_date,
                date_ref='',
                defaults={
                    'value': float(flt_val) if flt_val is not None else None,
                    'value_str': '',
                },
            )
            if was_created:
                created += 1

        self.stdout.write(self.style.SUCCESS(f'  Index prices: {created} created, {skipped} skipped'))

    def _parse_position_row(self, vals, col_offset, has_date=False):
        """Parse a position row given column offset. Returns dict or None."""
        # Column mapping relative to offset:
        # +0=Fund, +1=Portfolio, +2=AssetGroup, +3=Broker, +4=AssetMarket, +5=Asset,
        # +6=IsLeveraged, +7=UnitsOpen, +8=UnitsClose, +9=UnitsTx, +10=UnitsLending,
        # +11=UnitsMargin, +12=Currency, +13=AvgCost, +14=PriceOpen, +15=PriceClose,
        # +16=PxOpenSource, +17=PxCloseSource, +18=PxOpenDate, +19=PxCloseDate,
        # +20=PxOpenOfficial, +21=PxCloseOfficial, +22=DeltaOpen, +23=DeltaClose,
        # +24=UndPxOpen, +25=UndPxClose, +26=ContractSize, +27=AvgPxTx,
        # +28=AmountOpen, +29=AmountClose, +30=AmountTx,
        # +31=PnlOpen, +32=PnlTx, +33=PnlTxFee, +34=PnlDiv, +35=PnlLending, +36=PnlTotal
        o = col_offset
        asset_col = o + 5
        if asset_col not in vals:
            return None

        def fv(col):
            v = vals.get(col)
            if v is None:
                return None
            try:
                return float(v)
            except (ValueError, TypeError):
                return None

        def sv(col):
            v = vals.get(col)
            return str(v).strip() if v is not None else ''

        def dv(col):
            v = vals.get(col)
            if isinstance(v, datetime):
                return v.date()
            if isinstance(v, date):
                return v
            return None

        return {
            'fund': sv(o + 0),
            'portfolio': sv(o + 1),
            'asset_group': sv(o + 2),
            'broker': sv(o + 3),
            'asset_market': sv(o + 4),
            'asset_ticker': sv(o + 5),
            'is_leveraged': bool(vals.get(o + 6, False)),
            'units_open': fv(o + 7) or 0,
            'units_close': fv(o + 8) or 0,
            'units_transaction': fv(o + 9) or 0,
            'units_lending': fv(o + 10) or 0,
            'units_margin': fv(o + 11) or 0,
            'currency': sv(o + 12) or 'USD',
            'avg_cost': fv(o + 13),
            'price_open': fv(o + 14),
            'price_close': fv(o + 15),
            'price_open_source': sv(o + 16),
            'price_close_source': sv(o + 17),
            'price_open_date': dv(o + 18),
            'price_close_date': dv(o + 19),
            'price_open_official': bool(vals.get(o + 20, True)),
            'price_close_official': bool(vals.get(o + 21, True)),
            'delta_open': fv(o + 22),
            'delta_close': fv(o + 23),
            'underlying_price_open': fv(o + 24),
            'underlying_price_close': fv(o + 25),
            'contract_size': fv(o + 26) or 1,
            'avg_price_transaction': fv(o + 27),
            'amount_open': fv(o + 28),
            'amount_close': fv(o + 29),
            'amount_transaction': fv(o + 30),
            'pnl_open_position': fv(o + 31),
            'pnl_transaction': fv(o + 32),
            'pnl_transaction_fee': fv(o + 33),
            'pnl_dividend': fv(o + 34),
            'pnl_lending': fv(o + 35),
            'pnl_total': fv(o + 36),
        }

    def _save_position(self, pos_date, data, asset_map, dry_run):
        """Save a single position snapshot. Returns True if created."""
        if dry_run:
            return True

        asset = asset_map.get(data['asset_ticker'])
        _, was_created = PositionSnapshot.objects.update_or_create(
            date=pos_date,
            fund=data['fund'],
            asset_ticker=data['asset_ticker'],
            portfolio=data['portfolio'],
            defaults={
                'asset': asset,
                'asset_group': data['asset_group'],
                'broker': data['broker'],
                'asset_market': data['asset_market'],
                'is_leveraged': data['is_leveraged'],
                'units_open': data['units_open'],
                'units_close': data['units_close'],
                'units_transaction': data['units_transaction'],
                'units_lending': data['units_lending'],
                'units_margin': data['units_margin'],
                'currency': data['currency'],
                'avg_cost': data['avg_cost'],
                'price_open': data['price_open'],
                'price_close': data['price_close'],
                'price_open_source': data['price_open_source'],
                'price_close_source': data['price_close_source'],
                'price_open_date': data['price_open_date'],
                'price_close_date': data['price_close_date'],
                'price_open_official': data['price_open_official'],
                'price_close_official': data['price_close_official'],
                'delta_open': data['delta_open'],
                'delta_close': data['delta_close'],
                'underlying_price_open': data['underlying_price_open'],
                'underlying_price_close': data['underlying_price_close'],
                'contract_size': data['contract_size'],
                'avg_price_transaction': data['avg_price_transaction'],
                'amount_open': data['amount_open'],
                'amount_close': data['amount_close'],
                'amount_transaction': data['amount_transaction'],
                'pnl_open_position': data['pnl_open_position'],
                'pnl_transaction': data['pnl_transaction'],
                'pnl_transaction_fee': data['pnl_transaction_fee'],
                'pnl_dividend': data['pnl_dividend'],
                'pnl_lending': data['pnl_lending'],
                'pnl_total': data['pnl_total'],
            },
        )
        return was_created

    def _import_current_positions(self, rows, dry_run):
        """Step 7: Import current positions (All Position Origin, cols 25-61)."""
        self.stdout.write('\n=== Step 7: Importing current positions ===')
        created = 0
        asset_map = {a.code_bbg: a for a in BloombergAsset.objects.all()} if not dry_run else {}

        # Current positions use today's date (or latest price_close_date)
        pos_date = date.today()

        for row in rows:
            vals = self._get_row_dict(row, 25, 82)
            data = self._parse_position_row(vals, col_offset=25)
            if not data or not data['asset_ticker']:
                continue

            # Use price_close_date as the position date if available
            actual_date = data.get('price_close_date') or pos_date

            if dry_run:
                if created < 5:
                    self.stdout.write(
                        f'  {actual_date} | {data["fund"]} | {data["asset_ticker"]} | '
                        f'units={data["units_close"]} | amt={data["amount_close"]} | pnl={data["pnl_total"]}'
                    )
                created += 1
            else:
                if self._save_position(actual_date, data, asset_map, dry_run):
                    created += 1

        self.stdout.write(self.style.SUCCESS(f'  Current positions: {created} created'))

    def _import_hist_positions(self, rows, dry_run):
        """Step 8: Import historical positions (Hist Position Official, cols 188-225)."""
        self.stdout.write('\n=== Step 8: Importing historical positions ===')
        created = skipped = 0
        asset_map = {a.code_bbg: a for a in BloombergAsset.objects.all()} if not dry_run else {}

        for row in rows:
            vals = self._get_row_dict(row, 188, 235)
            if 188 not in vals:
                continue

            # Date is in col 188, positions start at col 189
            date_raw = vals[188]
            if isinstance(date_raw, datetime):
                pos_date = date_raw.date()
            elif isinstance(date_raw, date):
                pos_date = date_raw
            else:
                skipped += 1
                continue

            data = self._parse_position_row(vals, col_offset=189)
            if not data or not data['asset_ticker']:
                skipped += 1
                continue

            if dry_run:
                if created < 5:
                    self.stdout.write(
                        f'  {pos_date} | {data["fund"]} | {data["asset_ticker"]} | '
                        f'units={data["units_close"]} | amt={data["amount_close"]} | pnl={data["pnl_total"]}'
                    )
                created += 1
            else:
                if self._save_position(pos_date, data, asset_map, dry_run):
                    created += 1

        self.stdout.write(self.style.SUCCESS(f'  Historical positions: {created} created, {skipped} skipped'))

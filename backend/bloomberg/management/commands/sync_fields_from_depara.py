"""
Sync BloombergField entries from the de_para worksheet and create BloombergFieldGroup mappings.

1. Update existing BloombergField entries with correct bbg_fld from de_para
2. Create new BloombergField entries for Bloomberg-sourced fields
3. Create BloombergFieldGroup mappings for each asset group
"""
import openpyxl
from django.core.management.base import BaseCommand
from bloomberg.models import BloombergField, BloombergFieldGroup


# ── de_para: Field -> (bbg_fld, FieldClass, Source) ──────────────────────────
# Only Bloomberg-sourced fields (Source=BLOOMBERG with a QueryBBG value).
# FieldClass determines which asset groups get the field.

DE_PARA_BLOOMBERG = {
    # --- IssueInfo (Set fields, all BBG assets) ---
    'ISIN':                     ('ID_ISIN',                         'IssueInfo'),
    'DateIssue':                ('ISSUE_DT',                        'IssueInfo'),
    'FIGI':                     ('ID_BB_GLOBAL',                    'IssueInfo'),
    'CUSIP':                    ('ID_CUSIP',                        'IssueInfo'),
    'Calendar':                 ('CDR_COUNTRY_CODE',                'IssueInfo'),
    'Country':                  ('COUNTRY',                         'IssueInfo'),
    'CountryRisk':              ('CNTRY_OF_RISK',                   'IssueInfo'),
    'Currency':                 ('CRNCY',                           'IssueInfo'),
    'SecurityType':             ('SECURITY_TYP',                    'IssueInfo'),
    'Sector':                   ('GICS_SECTOR_NAME',                'IssueInfo'),
    'Industry':                 ('GICS_INDUSTRY_NAME',              'IssueInfo'),
    'SubIndustry':              ('GICS_SUB_INDUSTRY_NAME',          'IssueInfo'),
    'IndustryGroup':            ('GICS_INDUSTRY_GROUP_NAME',        'IssueInfo'),
    'SEDOL':                    ('ID_SEDOL1',                       'IssueInfo'),
    'Ticker':                   ('TICKER',                          'IssueInfo'),
    'CountryISO':               ('CNTRY_ISSUE_ISO',                 'IssueInfo'),
    'SecurityName':             ('SECURITY_NAME',                   'IssueInfo'),
    'CIK':                      ('CENTRAL_INDEX_KEY_NUMBER',        'IssueInfo'),
    'Maturity':                 ('MATURITY',                        'IssueInfo'),

    # --- Price (Hist fields, all BBG assets) ---
    'PxClose':                  ('PX_LAST',                         'Price'),
    'PxOpen':                   ('PX_OPEN',                         'Price'),
    'Return':                   ('CHG_PCT_1D',                      'Price'),
    'ReturnYTD':                ('CHG_PCT_YTD',                     'Price'),
    'Return1M':                 ('CHG_PCT_1M',                      'Price'),
    'ReturnWTD':                ('CHG_PCT_WTD',                     'Price'),
    'ReturnQTD':                ('CHG_PCT_QTD',                     'Price'),
    'Return1Y':                 ('CHG_PCT_1YR',                     'Price'),
    'ReturnMTD':                ('CHG_PCT_MTD',                     'Price'),
    'NetChg':                   ('CHG_NET_1D',                      'Price'),
    'Return52HIGH':             ('CHG_PCT_HIGH_52WEEK',             'Price'),
    'Return52LOW':              ('CHG_PCT_LOW_52WEEK',              'Price'),
    'PxCloseDT':                ('PX_CLOSE_DT',                     'Price'),
    'PxCloseYTD':               ('PX_CLOSE_YTD',                    'Price'),
    'PxCloseWTD':               ('PX_CLOSE_WTD',                    'Price'),
    'PxCloseQTD':               ('PX_CLOSE_QTD',                    'Price'),
    'PxCloseMTD':               ('PX_CLOSE_MTD',                    'Price'),
    'AnnualizedVolatility30D':  ('VOLATILITY_30D',                  'Price'),
    'AnnualizedVolatility90D':  ('VOLATILITY_90D',                  'Price'),
    'AnnualizedVolatility360D': ('VOLATILITY_360D',                 'Price'),
    'Volume':                   ('PX_VOLUME',                       'Price'),
    'Return5D':                 ('CHG_PCT_5D',                      'Price'),
    'RawBeta':                  ('EQY_RAW_BETA',                    'Price'),

    # --- Dividend (Hist, Stock only) ---
    'IsStockDividendExdate':    ('EQY_DVD_SPL_EX_FLAG',             'Dividend'),
    'IsSplitExdate':            ('EQY_DVD_STK_EX_FLAG',             'Dividend'),
    'IsDividendExDate':         ('EQY_DVD_EX_FLAG',                 'Dividend'),
    'IsRightsExDate':           ('EQY_DVD_RIGHT_EX_FLAG',           'Dividend'),
    'DividendPayDate':          ('DVD_PAY_DT',                      'Dividend'),
    'DividendType':             ('DVD_TYP_LAST',                    'Dividend'),
    'DividendExDate':           ('DVD_EX_DT',                       'Dividend'),
    'DividendPerShare':         ('DVD_SH_LAST',                     'Dividend'),
    'DividendPerShareLTM':      ('TRAIL_12M_DVD_PER_SH',           'Dividend'),
    'StockDividendExDate':      ('EQY_DVD_STK_EX_DT_CURR',         'Dividend'),
    'StockDividendPayDate':     ('EQY_DVD_STK_PAY_DT_CURR',        'Dividend'),
    'StockDividendAdjFactor':   ('EQY_DVD_STK_ADJ_FCT_CURR',       'Dividend'),

    # --- PE (Hist, Stock only) ---
    'PE_1FY_Cal':               ('BEST_PE_RATIO_1FY_CAL',          'PE'),
    'PE_1FY_Bld':               ('BEST_PE_RATIO_1FY_BLD',          'PE'),
    'PE_Avg5Y':                 ('BEST_PE_RATIO_Avg5Y',            'PE'),
    'TotHoldRecommendations':   ('TOT_HOLD_REC',                   'PE'),
    'TotBuyRecommendations':    ('TOT_BUY_REC',                    'PE'),
    'TotSellRecommendations':   ('TOT_SELL_REC',                   'PE'),
    'RatingSP':                 ('RTG_SP',                          'PE'),

    # --- EPS (Hist, Stock only) ---
    'EPS_1BY':                  ('BEST_EPS_1BY',                    'EPS'),
    'EPS_0FY':                  ('BEST_EPS_0FY',                    'EPS'),
    'EPS_1FY':                  ('BEST_EPS_1FY',                    'EPS'),
    'EPS_2FY':                  ('BEST_EPS_2FY',                    'EPS'),
    'EPS_3FY':                  ('BEST_EPS_3FY',                    'EPS'),
    'EPSRevision1W_1FY':        ('BEST_EPS_1WK_PCT_CHG_1FY',       'EPS'),
    'EPSRevision4W_1FY':        ('BEST_EPS_4WK_PCT_CHG_1FY',       'EPS'),
    'EPSRevision6M_1FY':        ('BEST_EPS_6MO_PCT_CHG_1FY',       'EPS'),

    # --- TargetPrice (Hist, Stock only) ---
    'TargetPrice_1FY':          ('BEST_TARGET_PRICE_1FY',           'TargetPrice'),

    # --- Book (Hist, Stock only) ---
    'BookValue':                ('TOT_COMMON_EQY',                  'Book'),
    'BookValuePerShare':        ('BOOK_VAL_PER_SH',                 'Book'),

    # --- Shares (Hist, Stock only) ---
    'SharesOutstanding':        ('BS_SH_OUT',                       'Shares'),
    'ShortIntRatio':            ('SHORT_INT_RATIO',                 'Shares'),
    'ShortInt':                 ('SHORT_INT',                       'Shares'),
    'EquityFloat':              ('EQY_FLOAT',                       'Shares'),
    'CurrentSharesOutstanding': ('EQY_SH_OUT',                      'Shares'),

    # --- Capital (Hist, Stock only) ---
    'TotalNumberOfSharesRepurchased_1BY':  ('BS_TOTAL_#_OF_SHARES_REPURCHASED',  'Capital'),
    'TotalValueOfSharesRepurchased_1BY':   ('BS_TOT_VAL_OF_SHARES_REPURCHASED',  'Capital'),
    'CurrentMarketCap':         ('CUR_MKT_CAP',                     'Capital'),
    'CurrentMarketCap_USD':     ('CRNCY_ADJ_MKT_CAP',              'Capital'),

    # --- Growth (Hist, Stock only) ---
    'LongTermGrowth_bbg':       ('BEST_EST_LONG_TERM_GROWTH',       'Growth'),
    'PEG_bbg':                  ('BEST_PEG_RATIO',                  'Growth'),

    # --- FinancialStatements (Hist, Stock only) ---
    'FreeCashFlowYield':        ('FREE_CASH_FLOW_YIELD',            'FinancialStatements'),
    'OperatingRoic':            ('OPERATING_ROIC',                  'FinancialStatements'),
    'EbitMargin':               ('EBIT_MARGIN',                     'FinancialStatements'),
    'EbitdaMargin':             ('EBITDA_MARGIN',                   'FinancialStatements'),
    'NetDebtToEbitda':          ('NET_DEBT_TO_EBITDA',              'FinancialStatements'),

    # --- DerivativePrice (Hist, Derivative only) ---
    'ImpliedVolatility':        ('IVOL',                            'DerivativePrice'),
    'Delta':                    ('DELTA',                           'DerivativePrice'),
    'Gamma':                    ('GAMMA',                           'DerivativePrice'),
    'Vega':                     ('VEGA',                            'DerivativePrice'),
    'Theta':                    ('OPT_THETA',                       'DerivativePrice'),
    'Rho':                      ('RHO',                             'DerivativePrice'),
    'UnderlyingPxClose':        ('OPT_UNDL_PX',                     'DerivativePrice'),

    # --- FixedIncomeParameters (Hist, Fixed Income only) ---
    'MacaulayDuration':         ('DUR_MID',                         'FixedIncomeParameters'),
    'Convexity':                ('CNVX_MID',                        'FixedIncomeParameters'),
    'YieldToMaturity':          ('YLD_YTM_MID',                     'FixedIncomeParameters'),
    'YieldToWorst':             ('YLD_CNV_LAST',                    'FixedIncomeParameters'),
    'PxDirty':                  ('PX_DIRTY_MID',                    'FixedIncomeParameters'),
    'Coupon':                   ('CPN',                             'FixedIncomeParameters'),
    'CouponFrequency':          ('CPN_FREQ',                        'FixedIncomeParameters'),
    'CouponType':               ('CPN_TYP',                         'FixedIncomeParameters'),
    'CouponNextDate':           ('NXT_CPN_DT',                      'FixedIncomeParameters'),
}

# Fields that existed before with names we keep but need to remove (replaced by de_para names)
FIELDS_TO_REMOVE = [
    'DividendYieldLTM',      # CALC, not a direct BBG field
    'TargetReturn_1FY',      # CALC, not a direct BBG field
    'Volatility360D',        # replaced by AnnualizedVolatility360D
    'IndexPxClose1D',        # special bdh field, keep separately
]

# Special field: IndexPxClose1D uses bdh method (historical time-series)
SPECIAL_FIELDS = {
    'IndexPxClose1D': {
        'bbg_fld': 'PX_LAST',
        'method': 'bdh',
        'sph': 'Hist',
        'is_critical': True,
        'frequency': '1D',
    },
}

# Which FieldClasses apply to which asset groups
FIELD_CLASS_TO_ASSET_GROUPS = {
    'IssueInfo':              ['Stock', 'Fixed Income', 'Index', 'Crypto'],
    'Price':                  ['Stock', 'Fixed Income', 'Index', 'Crypto'],
    'Dividend':               ['Stock'],
    'PE':                     ['Stock'],
    'EPS':                    ['Stock'],
    'TargetPrice':            ['Stock'],
    'Book':                   ['Stock'],
    'Shares':                 ['Stock'],
    'Capital':                ['Stock'],
    'Growth':                 ['Stock'],
    'FinancialStatements':    ['Stock'],
    'DerivativePrice':        [],  # No derivative assets currently
    'FixedIncomeParameters':  ['Fixed Income'],
}

# Fields that are "Set" (static, fetched once) vs "Hist" (fetched daily)
SET_FIELD_CLASSES = {'IssueInfo'}
# Within IssueInfo, some fields change over time — still treat as Set for sph

# Fields that are critical (fetched even at high quota)
CRITICAL_FIELDS = {'PxClose', 'YieldToWorst'}


def determine_sph(field_name, field_class):
    """Determine sph (Set vs Hist) for a field."""
    if field_class == 'IssueInfo':
        return 'Set'
    # Bond coupons and maturity are static
    if field_name in ('Coupon', 'CouponFrequency', 'CouponType', 'CouponNextDate', 'Maturity'):
        return 'Set'
    return 'Hist'


class Command(BaseCommand):
    help = "Sync BloombergField entries from de_para mapping and create FieldGroup mappings"

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true',
                            help='Show what would be done without making changes')

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        if dry_run:
            self.stdout.write("=== DRY RUN ===\n")

        self._sync_fields(dry_run)
        self._create_field_groups(dry_run)

        self.stdout.write(self.style.SUCCESS("Done."))

    def _sync_fields(self, dry_run):
        """Update existing and create new BloombergField entries."""
        self.stdout.write("\n--- Syncing BloombergField entries ---\n")

        updated = 0
        created = 0
        skipped = 0

        for name, (bbg_fld, field_class) in DE_PARA_BLOOMBERG.items():
            sph = determine_sph(name, field_class)
            method = 'ref'  # All de_para Bloomberg fields are ref (snapshot)
            is_critical = name in CRITICAL_FIELDS
            frequency = '1D'

            try:
                field = BloombergField.objects.get(name=name)
                # Update if bbg_fld or other attrs changed
                changes = []
                if field.bbg_fld != bbg_fld:
                    changes.append(f"bbg_fld: {field.bbg_fld} -> {bbg_fld}")
                    if not dry_run:
                        field.bbg_fld = bbg_fld
                if field.method != method:
                    changes.append(f"method: {field.method} -> {method}")
                    if not dry_run:
                        field.method = method
                if field.sph != sph:
                    changes.append(f"sph: {field.sph} -> {sph}")
                    if not dry_run:
                        field.sph = sph
                if field.is_critical != is_critical:
                    changes.append(f"is_critical: {field.is_critical} -> {is_critical}")
                    if not dry_run:
                        field.is_critical = is_critical

                if changes:
                    if not dry_run:
                        field.save()
                    self.stdout.write(f"  UPDATED {name}: {', '.join(changes)}")
                    updated += 1
                else:
                    skipped += 1

            except BloombergField.DoesNotExist:
                if not dry_run:
                    BloombergField.objects.create(
                        name=name, bbg_fld=bbg_fld, method=method,
                        sph=sph, frequency=frequency, is_critical=is_critical,
                    )
                self.stdout.write(f"  CREATED {name} ({bbg_fld}, {method}, {sph})")
                created += 1

        # Handle special fields
        for name, attrs in SPECIAL_FIELDS.items():
            try:
                field = BloombergField.objects.get(name=name)
                changes = []
                for k, v in attrs.items():
                    if getattr(field, k) != v:
                        changes.append(f"{k}: {getattr(field, k)} -> {v}")
                        if not dry_run:
                            setattr(field, k, v)
                if changes:
                    if not dry_run:
                        field.save()
                    self.stdout.write(f"  UPDATED {name}: {', '.join(changes)}")
                    updated += 1
            except BloombergField.DoesNotExist:
                if not dry_run:
                    BloombergField.objects.create(name=name, **attrs)
                self.stdout.write(f"  CREATED {name} (special)")
                created += 1

        # Deactivate old fields that were replaced
        for old_name in FIELDS_TO_REMOVE:
            try:
                field = BloombergField.objects.get(name=old_name)
                # Only deactivate if it's not in the de_para (some were renamed)
                if old_name not in DE_PARA_BLOOMBERG and old_name not in SPECIAL_FIELDS:
                    if field.is_active:
                        if not dry_run:
                            field.is_active = False
                            field.save()
                        self.stdout.write(f"  DEACTIVATED {old_name} (replaced by de_para)")
            except BloombergField.DoesNotExist:
                pass

        self.stdout.write(f"\nFields: {created} created, {updated} updated, {skipped} unchanged")

    def _create_field_groups(self, dry_run):
        """Create BloombergFieldGroup mappings."""
        self.stdout.write("\n--- Creating BloombergFieldGroup mappings ---\n")

        if not dry_run:
            # Clear existing mappings to rebuild
            deleted_count = BloombergFieldGroup.objects.count()
            BloombergFieldGroup.objects.all().delete()
            if deleted_count:
                self.stdout.write(f"  Cleared {deleted_count} existing mappings")

        created = 0

        # Map de_para fields to asset groups
        for name, (bbg_fld, field_class) in DE_PARA_BLOOMBERG.items():
            asset_groups = FIELD_CLASS_TO_ASSET_GROUPS.get(field_class, [])
            if not asset_groups:
                continue

            try:
                field = BloombergField.objects.get(name=name)
            except BloombergField.DoesNotExist:
                if dry_run:
                    # In dry run, field may not exist yet
                    for ag in asset_groups:
                        self.stdout.write(f"  WOULD MAP {ag} -> {name}")
                        created += 1
                    continue
                else:
                    continue

            for ag in asset_groups:
                if not dry_run:
                    BloombergFieldGroup.objects.create(asset_group=ag, field=field)
                created += 1

        # Map IndexPxClose1D to Index group
        try:
            idx_field = BloombergField.objects.get(name='IndexPxClose1D')
            if not dry_run:
                BloombergFieldGroup.objects.create(
                    asset_group='Index', field=idx_field,
                    start_date='2020-01-01',
                )
            created += 1
        except BloombergField.DoesNotExist:
            pass

        self.stdout.write(f"\nField groups: {created} mappings created")

        # Summary by asset group
        if not dry_run:
            self.stdout.write("\nSummary by asset group:")
            for ag in ['Stock', 'Fixed Income', 'Index', 'Crypto']:
                count = BloombergFieldGroup.objects.filter(asset_group=ag).count()
                self.stdout.write(f"  {ag}: {count} fields")

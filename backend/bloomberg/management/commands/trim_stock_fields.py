"""
One-time management command to reduce Stock field groups from 88 to 9 essential fields,
and set appropriate fetch frequencies.

Usage:
    python manage.py trim_stock_fields          # Dry run
    python manage.py trim_stock_fields --apply  # Apply changes
"""

from django.core.management.base import BaseCommand
from bloomberg.models import BloombergField, BloombergFieldGroup


# The 9 Stock fields the user wants, with their frequencies
STOCK_FIELDS = {
    # Daily (1D) — critical market data
    'PxClose':           {'bbg_fld': 'PX_LAST',          'frequency': '1D', 'is_critical': True},
    'NetChg':            {'bbg_fld': 'CHG_NET_1D',       'frequency': '1D', 'is_critical': False},
    'CurrentMarketCap':  {'bbg_fld': 'CUR_MKT_CAP',     'frequency': '1D', 'is_critical': False},

    # Weekly (1W) — dividend data + YTD return
    'DividendPerShare':  {'bbg_fld': 'DVD_SH_LAST',     'frequency': '1W', 'is_critical': False},
    'DividendPayDate':   {'bbg_fld': 'DVD_PAY_DT',      'frequency': '1W', 'is_critical': False},
    'DividendExDate':    {'bbg_fld': 'DVD_EX_DT',       'frequency': '1W', 'is_critical': False},
    'PxCloseYTD':        {'bbg_fld': 'PX_CLOSE_YTD',    'frequency': '1W', 'is_critical': False},

    # Monthly (1M) — static/slowly-changing data
    'CountryRisk':       {'bbg_fld': 'CNTRY_OF_RISK',   'frequency': '1M', 'is_critical': False},
    'Sector':            {'bbg_fld': 'GICS_SECTOR_NAME', 'frequency': '1M', 'is_critical': False},
}


class Command(BaseCommand):
    help = 'Trim Stock field groups to 9 essential fields with frequency tiers'

    def add_arguments(self, parser):
        parser.add_argument('--apply', action='store_true', help='Apply changes (default is dry run)')

    def handle(self, *args, **options):
        apply = options['apply']
        prefix = '' if apply else '[DRY RUN] '

        # Get all Stock field groups
        stock_fgs = BloombergFieldGroup.objects.filter(asset_group='Stock').select_related('field')
        self.stdout.write(f'Current Stock field groups: {stock_fgs.count()}')

        keep_names = set(STOCK_FIELDS.keys())
        to_delete = []
        to_keep = []

        for fg in stock_fgs:
            if fg.field.name in keep_names:
                to_keep.append(fg)
            else:
                to_delete.append(fg)

        self.stdout.write(f'\nKeeping {len(to_keep)} field groups:')
        for fg in to_keep:
            cfg = STOCK_FIELDS[fg.field.name]
            self.stdout.write(f'  + {fg.field.name} ({fg.field.bbg_fld}) -> {cfg["frequency"]}')

        self.stdout.write(f'\nDeleting {len(to_delete)} field groups:')
        for fg in to_delete:
            self.stdout.write(f'  x {fg.field.name} ({fg.field.bbg_fld})')

        if apply:
            # Delete unwanted field groups
            deleted_count = BloombergFieldGroup.objects.filter(
                asset_group='Stock',
            ).exclude(
                field__name__in=keep_names,
            ).delete()[0]
            self.stdout.write(self.style.SUCCESS(f'\nDeleted {deleted_count} Stock field groups.'))

            # Update frequencies on the kept fields
            for field_name, cfg in STOCK_FIELDS.items():
                updated = BloombergField.objects.filter(name=field_name).update(
                    frequency=cfg['frequency'],
                    is_critical=cfg['is_critical'],
                )
                if updated:
                    self.stdout.write(f'  Updated {field_name}: frequency={cfg["frequency"]}, is_critical={cfg["is_critical"]}')

            remaining = BloombergFieldGroup.objects.filter(asset_group='Stock').count()
            self.stdout.write(self.style.SUCCESS(f'\nDone. Stock field groups remaining: {remaining}'))
        else:
            self.stdout.write(self.style.WARNING(f'\n{prefix}No changes made. Use --apply to apply.'))

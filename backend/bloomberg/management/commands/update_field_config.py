"""
Management command to update field frequencies and trim Stock field groups.
Designed to run on Railway via: railway run python manage.py update_field_config --apply

Usage:
    python manage.py update_field_config          # Dry run
    python manage.py update_field_config --apply  # Apply changes
"""

from django.core.management.base import BaseCommand
from bloomberg.models import BloombergField, BloombergFieldGroup


# Stock fields to KEEP (9 essential) with their target frequencies
STOCK_FIELDS_KEEP = {
    'PxClose':           {'frequency': '1D', 'is_critical': True},
    'NetChg':            {'frequency': '1D', 'is_critical': False},
    'CurrentMarketCap':  {'frequency': '1D', 'is_critical': False},
    'DividendPerShare':  {'frequency': '1W', 'is_critical': False},
    'DividendPayDate':   {'frequency': '1W', 'is_critical': False},
    'DividendExDate':    {'frequency': '1W', 'is_critical': False},
    'PxCloseYTD':        {'frequency': '1W', 'is_critical': False},
    'CountryRisk':       {'frequency': '1M', 'is_critical': False},
    'Sector':            {'frequency': '1M', 'is_critical': False},
}


class Command(BaseCommand):
    help = 'Update field frequencies and trim Stock field groups to 9 essentials'

    def add_arguments(self, parser):
        parser.add_argument('--apply', action='store_true', help='Apply changes (default is dry run)')

    def handle(self, *args, **options):
        apply = options['apply']
        tag = '' if apply else '[DRY RUN] '

        # --- Step 1: Trim Stock field groups ---
        stock_fgs = BloombergFieldGroup.objects.filter(asset_group='Stock').select_related('field')
        keep_names = set(STOCK_FIELDS_KEEP.keys())

        to_delete = [fg for fg in stock_fgs if fg.field.name not in keep_names]
        to_keep = [fg for fg in stock_fgs if fg.field.name in keep_names]

        self.stdout.write(f'{tag}Stock field groups: {stock_fgs.count()} total')
        self.stdout.write(f'{tag}  Keeping: {len(to_keep)}')
        for fg in to_keep:
            cfg = STOCK_FIELDS_KEEP[fg.field.name]
            self.stdout.write(f'{tag}    {fg.field.name} ({fg.field.bbg_fld}) -> {cfg["frequency"]}')
        self.stdout.write(f'{tag}  Deleting: {len(to_delete)}')

        if apply and to_delete:
            delete_ids = [fg.id for fg in to_delete]
            deleted = BloombergFieldGroup.objects.filter(id__in=delete_ids).delete()[0]
            self.stdout.write(self.style.SUCCESS(f'  Deleted {deleted} Stock field groups'))

        # --- Step 2: Update frequencies on Stock fields ---
        for field_name, cfg in STOCK_FIELDS_KEEP.items():
            try:
                field = BloombergField.objects.get(name=field_name)
                old_freq = field.frequency
                if field.frequency != cfg['frequency'] or field.is_critical != cfg['is_critical']:
                    if apply:
                        field.frequency = cfg['frequency']
                        field.is_critical = cfg['is_critical']
                        field.save(update_fields=['frequency', 'is_critical'])
                    self.stdout.write(f'{tag}  {field_name}: {old_freq} -> {cfg["frequency"]}, critical={cfg["is_critical"]}')
            except BloombergField.DoesNotExist:
                self.stdout.write(self.style.WARNING(f'{tag}  {field_name}: NOT FOUND'))

        # --- Summary ---
        if apply:
            remaining = BloombergFieldGroup.objects.filter(asset_group='Stock').count()
            total = BloombergFieldGroup.objects.count()
            self.stdout.write(self.style.SUCCESS(
                f'\nDone. Stock: {remaining} field groups. Total across all groups: {total}'
            ))
        else:
            self.stdout.write(self.style.WARNING(f'\n{tag}No changes. Use --apply to apply.'))

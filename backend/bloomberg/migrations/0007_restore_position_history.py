"""
Restore the daily position history (PositionSnapshot) from the repository fixture for any
fund/date that is missing in the database. Production lost 2024-09-04 -> 2026-03-23, which the
performance engine (finance/perf) needs for per-asset P&L before the statement cutover.
Idempotent: only dates absent for a fund are inserted; existing rows are never touched.
"""
import json
import os

from django.db import migrations


def restore(apps, schema_editor):
    PositionSnapshot = apps.get_model('bloomberg', 'PositionSnapshot')
    path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'fixtures', 'bloomberg_data.json')
    if not os.path.exists(path):
        return
    with open(path) as fh:
        rows = [r['fields'] for r in json.load(fh) if r.get('model') == 'bloomberg.positionsnapshot']
    existing = set(PositionSnapshot.objects.values_list('fund', 'date'))
    field_names = {f.name for f in PositionSnapshot._meta.get_fields() if getattr(f, 'concrete', False)}
    objs = []
    for f in rows:
        if (f['fund'], _date(f['date'])) in existing:
            continue
        data = {k: v for k, v in f.items() if k in field_names and k not in ('id', 'asset', 'created_at')}
        objs.append(PositionSnapshot(**data))
    PositionSnapshot.objects.bulk_create(objs, batch_size=1000)


def _date(s):
    import datetime as dt
    return dt.date.fromisoformat(s[:10])


class Migration(migrations.Migration):
    dependencies = [('bloomberg', '0006_create_bbg_agent_user')]
    operations = [migrations.RunPython(restore, migrations.RunPython.noop)]

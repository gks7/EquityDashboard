"""One-off repair of Stock rows holding NaN / Infinity.

Postgres accepts NaN and Infinity in a ``double precision`` column, but DRF's
JSONRenderer runs with ``allow_nan=False`` and raises ``ValueError: Out of range
float values are not JSON compliant`` while rendering. A single poisoned row
therefore returned HTTP 500 for every endpoint serializing a Stock
(``/api/stocks/``, ``/api/portfolio/``), which blanked the Portfolio page and
the dashboard.

The write path is fixed in ``finance.services.finite``; this cleans up rows
written before that. It runs automatically on deploy because the Procfile calls
``manage.py migrate`` at boot. Idempotent, and a no-op once the table is clean.
"""

import math

from django.db import migrations

FLOAT_FIELDS = ("current_price", "previous_close", "forward_pe")


def _bad(value):
    return isinstance(value, float) and not math.isfinite(value)


def _scrub_json(value):
    if _bad(value):
        return None, True
    if isinstance(value, dict):
        changed = False
        out = {}
        for k, v in value.items():
            out[k], c = _scrub_json(v)
            changed = changed or c
        return out, changed
    if isinstance(value, list):
        changed = False
        out = []
        for v in value:
            cleaned, c = _scrub_json(v)
            out.append(cleaned)
            changed = changed or c
        return out, changed
    return value, False


def clean_non_finite(apps, schema_editor):
    Stock = apps.get_model("finance", "Stock")

    for stock in Stock.objects.all().iterator():
        dirty = []

        for field in FLOAT_FIELDS:
            if _bad(getattr(stock, field, None)):
                setattr(stock, field, None)
                dirty.append(field)

        financials = getattr(stock, "financials", None)
        if financials is not None:
            cleaned, changed = _scrub_json(financials)
            if changed:
                stock.financials = cleaned
                dirty.append("financials")

        if dirty:
            stock.save(update_fields=dirty)


def noop(apps, schema_editor):
    """Nothing to undo — the original NaN values carried no information."""


class Migration(migrations.Migration):

    dependencies = [
        ("finance", "0018_fundconfig_base_cotas"),
    ]

    operations = [
        migrations.RunPython(clean_non_finite, noop),
    ]

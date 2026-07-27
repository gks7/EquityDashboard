"""Repair Stock rows holding NaN / Infinity in their float columns.

Postgres accepts NaN and Infinity in a ``double precision`` column, but DRF's
JSONRenderer refuses to serialize them, so a single bad row makes every
endpoint that touches ``StockSerializer`` (``/api/stocks/``, ``/api/portfolio/``)
return HTTP 500. Values used to arrive here from yfinance via
``update_stock_price``; run this once to clean up rows written before that was
fixed.

    python manage.py clean_nonfinite_stocks --dry-run
    python manage.py clean_nonfinite_stocks
"""

import math

from django.core.management.base import BaseCommand

from finance.models import Stock

FLOAT_FIELDS = ("current_price", "previous_close", "forward_pe")


def _bad(value):
    return isinstance(value, float) and not math.isfinite(value)


def _scrub_json(value):
    """Return (cleaned, changed) for a nested JSON structure."""
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


class Command(BaseCommand):
    help = "Null out NaN/Infinity values in Stock float and JSON fields."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Report the offending rows without writing anything.",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        repaired = 0

        for stock in Stock.objects.all().iterator():
            dirty = []

            for field in FLOAT_FIELDS:
                if _bad(getattr(stock, field)):
                    setattr(stock, field, None)
                    dirty.append(field)

            if stock.financials is not None:
                cleaned, changed = _scrub_json(stock.financials)
                if changed:
                    stock.financials = cleaned
                    dirty.append("financials")

            if not dirty:
                continue

            repaired += 1
            self.stdout.write(f"  {stock.ticker}: {', '.join(dirty)}")
            if not dry_run:
                stock.save(update_fields=dirty)

        if repaired == 0:
            self.stdout.write(self.style.SUCCESS("No non-finite values found."))
            return

        verb = "would be repaired" if dry_run else "repaired"
        self.stdout.write(self.style.SUCCESS(f"{repaired} stock row(s) {verb}."))

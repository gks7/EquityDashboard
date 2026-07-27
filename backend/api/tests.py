"""Regression tests for the NaN poisoning that returned HTTP 500 on every
endpoint serializing a Stock (``/api/stocks/``, ``/api/portfolio/``).

Note: Postgres stores NaN / Infinity in a ``double precision`` column, which is
how the bad rows survived in production. SQLite silently coerces them to NULL,
so the tests below exercise the serializers and helpers against in-memory
instances rather than relying on a database round trip.
"""

import io

from django.contrib.auth.models import User
from django.core.management import call_command
from django.test import TestCase
from openpyxl import Workbook
from rest_framework import serializers
from rest_framework.renderers import JSONRenderer
from rest_framework.test import APIClient

from api.serializers import PortfolioItemSerializer, StockSerializer, json_safe
from finance.management.commands.clean_nonfinite_stocks import _bad, _scrub_json
from finance.models import PortfolioItem, PortfolioSnapshot, Stock
from finance.services import finite

NAN = float("nan")
INF = float("inf")


class FiniteHelperTests(TestCase):
    def test_non_finite_becomes_none(self):
        for value in (NAN, INF, -INF, None, "not a number"):
            self.assertIsNone(finite(value), value)

    def test_real_numbers_survive(self):
        self.assertEqual(finite(12.5), 12.5)
        self.assertEqual(finite("3"), 3.0)
        self.assertEqual(finite(0), 0.0)

    def test_nan_is_truthy(self):
        """The original guard was `if not current_price`, which NaN sails past."""
        self.assertTrue(bool(NAN))

    def test_json_safe_walks_nested_structures(self):
        payload = {"a": NAN, "b": [1.0, INF], "c": {"d": 2.5}, "e": "text"}
        self.assertEqual(
            json_safe(payload),
            {"a": None, "b": [1.0, None], "c": {"d": 2.5}, "e": "text"},
        )


class UnguardedRendererTests(TestCase):
    """Documents the failure mode the fix protects against."""

    def test_json_renderer_rejects_non_finite_floats(self):
        class Unguarded(serializers.Serializer):
            price = serializers.FloatField()

        with self.assertRaises(ValueError) as ctx:
            JSONRenderer().render(Unguarded({"price": NAN}).data)
        self.assertIn("JSON compliant", str(ctx.exception))


class StockSerializerNonFiniteTests(TestCase):
    def test_renders_without_raising(self):
        # SQLite coerces NaN to NULL on write, so poison the in-memory instance
        # to mimic a row loaded from Postgres.
        poisoned = Stock.objects.create(ticker="NANCO", company_name="Poisoned Co")
        poisoned.current_price, poisoned.forward_pe, poisoned.previous_close = NAN, INF, -INF
        healthy = Stock.objects.create(ticker="GOOD", company_name="Fine Co",
                                       current_price=100.0)

        data = [StockSerializer(s).data for s in (poisoned, healthy)]
        rendered = JSONRenderer().render(data)  # this is what used to 500

        self.assertNotIn(b":NaN", rendered)
        self.assertNotIn(b":Infinity", rendered)
        self.assertIsNone(data[0]["current_price"])
        self.assertIsNone(data[0]["forward_pe"])
        self.assertIsNone(data[0]["previous_close"])
        self.assertEqual(data[1]["current_price"], 100.0)

    def test_nested_stock_details_are_scrubbed(self):
        stock = Stock.objects.create(ticker="NANCO", company_name="Poisoned Co")
        snapshot = PortfolioSnapshot.objects.create(date="2026-07-27")
        item = PortfolioItem.objects.create(
            snapshot=snapshot, stock=stock, ticker="NANCO", asset_type="Equity",
            quantity=10.0, average_cost=5.0, market_value=50.0)
        item.stock.current_price = NAN

        data = PortfolioItemSerializer(item).data
        JSONRenderer().render(data)

        self.assertIsNone(data["stock_details"]["current_price"])
        self.assertEqual(data["current_value"], 50.0)


class PortfolioEndpointTests(TestCase):
    def test_list_returns_200(self):
        stock = Stock.objects.create(ticker="GOOD", company_name="Fine Co",
                                     current_price=100.0)
        snapshot = PortfolioSnapshot.objects.create(date="2026-07-27")
        PortfolioItem.objects.create(snapshot=snapshot, stock=stock, ticker="GOOD",
                                     asset_type="Equity", quantity=10.0,
                                     average_cost=5.0, market_value=50.0)

        client = APIClient()
        client.force_authenticate(user=User.objects.create_user("tester", password="pw"))

        res = client.get("/api/portfolio/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()[0]["ticker"], "GOOD")


class CleanNonFiniteCommandTests(TestCase):
    def test_bad_detects_only_non_finite_floats(self):
        self.assertTrue(_bad(NAN))
        self.assertTrue(_bad(INF))
        self.assertFalse(_bad(0.0))
        self.assertFalse(_bad(None))
        self.assertFalse(_bad("text"))

    def test_scrubs_nested_json(self):
        cleaned, changed = _scrub_json([{"revenue": NAN, "year": 2025}])
        self.assertTrue(changed)
        self.assertEqual(cleaned, [{"revenue": None, "year": 2025}])

    def test_leaves_clean_json_untouched(self):
        payload = [{"revenue": 1.0, "year": 2025}]
        cleaned, changed = _scrub_json(payload)
        self.assertFalse(changed)
        self.assertEqual(cleaned, payload)

    def test_command_runs_on_a_clean_table(self):
        Stock.objects.create(ticker="GOOD", company_name="Fine Co", current_price=1.0)
        call_command("clean_nonfinite_stocks", verbosity=0)
        call_command("clean_nonfinite_stocks", "--dry-run", verbosity=0)


def _workbook(rows):
    wb = Workbook()
    ws = wb.active
    ws.title = "Data"
    for row in rows:
        ws.append(row)
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    buf.name = "DashboardData.xlsx"
    return buf


class UploadExcelEmptyTests(TestCase):
    """An unparseable sheet must not leave a blank snapshot for the UI to jump to."""

    def test_unrecognised_sheet_is_rejected(self):
        res = APIClient().post(
            "/api/snapshots/upload_excel/",
            {"file": _workbook([["Coluna A", "Coluna B"], ["x", 1]])},
            format="multipart",
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn("columns_detected", res.json())
        self.assertEqual(PortfolioSnapshot.objects.count(), 0)

    def test_valid_sheet_still_works(self):
        res = APIClient().post(
            "/api/snapshots/upload_excel/",
            {"file": _workbook([["Ticker", "Quantity", "PX_LAST"], ["PETR4 BZ", 100, 38.5]])},
            format="multipart",
        )
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.json()["items_created"], 1)
        self.assertEqual(PortfolioSnapshot.objects.count(), 1)

    def test_header_below_a_title_row_is_found(self):
        res = APIClient().post(
            "/api/snapshots/upload_excel/",
            {"file": _workbook([
                ["Bloomberg export", None, None],
                [None, None, None],
                ["Ticker", "Quantity", "PX_LAST"],
                ["PETR4 BZ", 100, 38.5],
            ])},
            format="multipart",
        )
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.json()["items_created"], 1)


class DataMigrationTests(TestCase):
    """The 0019 migration duplicates the scrubbing logic on purpose — migrations
    must not import app code that can change under them. Keep the two in sync."""

    def test_migration_helpers_match_the_command(self):
        import importlib

        migration = importlib.import_module(
            "finance.migrations.0019_clean_nonfinite_stocks"
        )

        for value in (NAN, INF, -INF, 0.0, 1.5, None, "text"):
            self.assertEqual(migration._bad(value), _bad(value), value)

        payload = [{"revenue": NAN, "year": 2025, "nested": {"x": INF}}]
        self.assertEqual(migration._scrub_json(payload), _scrub_json(payload))

    def test_migration_is_applied(self):
        from django.db.migrations.loader import MigrationLoader
        from django.db import connection

        loader = MigrationLoader(connection)
        self.assertIn(("finance", "0019_clean_nonfinite_stocks"), loader.graph.nodes)

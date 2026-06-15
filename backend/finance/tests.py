import datetime

from django.test import TestCase

from finance.models import FundConfig, DailyCash, PortfolioSnapshot, PortfolioItem
from finance.services import compute_calculated_nav


class CalculatedNavTests(TestCase):
    def setUp(self):
        # Default config: shares=32,435,667, mgmt 1% / 255 days, perf 10%, HWM 1.1364
        self.cfg = FundConfig.get_solo()

    def test_returns_none_without_snapshots(self):
        self.assertIsNone(compute_calculated_nav())

    def test_gross_value_uses_market_value_plus_cash(self):
        snap = PortfolioSnapshot.objects.create(date=datetime.date(2026, 6, 12))
        PortfolioItem.objects.create(snapshot=snap, ticker='AAA', quantity=1, market_value=20_000_000)
        PortfolioItem.objects.create(snapshot=snap, ticker='BBB', quantity=1, market_value=17_000_000)
        DailyCash.objects.create(date=datetime.date(2026, 6, 12), cash=200_000)

        r = compute_calculated_nav()
        self.assertEqual(r['latest']['asset_value'], 37_000_000.0)
        self.assertEqual(r['latest']['cash'], 200_000.0)
        self.assertEqual(r['latest']['gross_asset_value'], 37_200_000.0)

    def test_market_value_falls_back_to_qty_price_cross(self):
        snap = PortfolioSnapshot.objects.create(date=datetime.date(2026, 6, 12))
        # No market_value -> 100 * 50 * 2.0 = 10,000
        PortfolioItem.objects.create(snapshot=snap, ticker='AAA', quantity=100, price=50, cross_usd=2.0)
        r = compute_calculated_nav()
        self.assertEqual(r['latest']['asset_value'], 10_000.0)

    def test_fee_math_above_hwm(self):
        snap = PortfolioSnapshot.objects.create(date=datetime.date(2026, 6, 12))
        PortfolioItem.objects.create(snapshot=snap, ticker='AAA', quantity=1, market_value=37_700_000)

        r = compute_calculated_nav()
        L = r['latest']
        shares = self.cfg.shares

        # Gross cota
        self.assertAlmostEqual(L['gross_cota'], 37_700_000 / shares, places=6)
        # One day's management fee accrual = GAV * 1% / 255
        expected_mgmt = 37_700_000 * 0.01 / 255
        self.assertAlmostEqual(L['mgmt_fee_day'], round(expected_mgmt, 2), places=2)
        self.assertAlmostEqual(L['mgmt_fee_accrued'], round(expected_mgmt, 2), places=2)
        # Performance provision = 10% * (cota_after_mgmt - HWM) * shares
        cota_after_mgmt = (37_700_000 - expected_mgmt) / shares
        expected_perf = max(0.0, cota_after_mgmt - 1.1364) * shares * 0.10
        self.assertAlmostEqual(L['perf_fee_provision'], round(expected_perf, 2), places=1)
        # Net NAV = GAV - mgmt - perf
        self.assertAlmostEqual(
            L['net_nav'], round(37_700_000 - expected_mgmt - expected_perf, 2), places=1
        )

    def test_no_performance_fee_below_hwm(self):
        snap = PortfolioSnapshot.objects.create(date=datetime.date(2026, 6, 12))
        # Cota well below the 1.1364 HWM -> no performance provision
        PortfolioItem.objects.create(snapshot=snap, ticker='AAA', quantity=1, market_value=30_000_000)
        r = compute_calculated_nav()
        self.assertEqual(r['latest']['perf_fee_provision'], 0.0)

    def test_mgmt_fee_accrues_only_after_paid_through(self):
        for i, day in enumerate([10, 11, 12]):
            snap = PortfolioSnapshot.objects.create(date=datetime.date(2026, 6, day))
            PortfolioItem.objects.create(snapshot=snap, ticker='AAA', quantity=1, market_value=30_000_000)
        # Mark fees paid through Jun 11 -> only Jun 12 contributes to the accrued liability
        self.cfg.mgmt_fee_paid_through = datetime.date(2026, 6, 11)
        self.cfg.save()

        r = compute_calculated_nav()
        one_day = round(30_000_000 * 0.01 / 255, 2)
        self.assertAlmostEqual(r['latest']['mgmt_fee_accrued'], one_day, places=2)

    def test_mgmt_fee_resets_monthly_by_default(self):
        # No explicit paid-through date: only the latest snapshot's month accrues,
        # so prior-month snapshots do not inflate the unpaid liability.
        for day in [datetime.date(2026, 5, 28), datetime.date(2026, 5, 29)]:
            snap = PortfolioSnapshot.objects.create(date=day)
            PortfolioItem.objects.create(snapshot=snap, ticker='AAA', quantity=1, market_value=30_000_000)
        for day in [datetime.date(2026, 6, 1), datetime.date(2026, 6, 2)]:
            snap = PortfolioSnapshot.objects.create(date=day)
            PortfolioItem.objects.create(snapshot=snap, ticker='AAA', quantity=1, market_value=30_000_000)

        r = compute_calculated_nav()
        # Only the two June days accrue (May is a prior, already-paid month).
        two_days = round(30_000_000 * 0.01 / 255, 2) * 2
        self.assertAlmostEqual(r['latest']['mgmt_fee_accrued'], two_days, places=2)
        self.assertEqual(r['mgmt_accrual_start'], '2026-05-31')

    def test_mtd_and_ytd_returns(self):
        # Below the HWM so no perf fee; tiny mgmt fee. Net cota tracks gross closely.
        # Points: end of prior year, end of prior month, and current.
        pts = [
            (datetime.date(2025, 12, 31), 30_000_000),
            (datetime.date(2026, 5, 30), 31_000_000),
            (datetime.date(2026, 6, 13), 31_500_000),
        ]
        for day, mv in pts:
            snap = PortfolioSnapshot.objects.create(date=day)
            PortfolioItem.objects.create(snapshot=snap, ticker='AAA', quantity=1, market_value=mv)
        # Avoid mgmt accrual muddying the ratios for this assertion.
        self.cfg.mgmt_fee_rate = 0.0
        self.cfg.save()

        r = compute_calculated_nav()
        # MTD base = May 30 (last point before June), YTD base = Dec 31 (prior year)
        self.assertAlmostEqual(r['mtd_return_pct'], (31_500_000 / 31_000_000 - 1) * 100, places=3)
        self.assertAlmostEqual(r['ytd_return_pct'], (31_500_000 / 30_000_000 - 1) * 100, places=3)

    def test_cash_carries_forward(self):
        s1 = PortfolioSnapshot.objects.create(date=datetime.date(2026, 6, 11))
        PortfolioItem.objects.create(snapshot=s1, ticker='AAA', quantity=1, market_value=10_000_000)
        DailyCash.objects.create(date=datetime.date(2026, 6, 11), cash=500_000)
        # No cash entry for Jun 12 -> should carry forward 500,000
        s2 = PortfolioSnapshot.objects.create(date=datetime.date(2026, 6, 12))
        PortfolioItem.objects.create(snapshot=s2, ticker='AAA', quantity=1, market_value=10_000_000)

        r = compute_calculated_nav()
        self.assertEqual(r['latest']['cash'], 500_000.0)

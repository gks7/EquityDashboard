import datetime as dt
from unittest import mock

from django.test import TestCase

from finance import utm
from finance.models import UtmPrice, UtmRebalance

D = dt.date


def _px(rows):
    UtmPrice.objects.bulk_create([UtmPrice(date=d, ticker=t, close=c, dividend=v) for d, t, c, v in rows])


class UtmEngineTests(TestCase):
    def setUp(self):
        days = [D(2026, 1, 5), D(2026, 1, 6), D(2026, 1, 7), D(2026, 1, 8)]
        rows = []
        for i, d in enumerate(days):
            rows += [(d, 'SPY', 100 + i, 0), (d, 'QQQ', 100, 0), (d, 'AAA', [10, 11, 11, 12.1][i], 0),
                     (d, 'BBB', [20, 20, 22, 22][i], 0), (d, 'CCC', [50, 50, 50, 55][i], 0)]
        rows[-3] = (days[-1], 'AAA', 12.1, 0.5)   # AAA pays 0.50 on the last day
        _px(rows)
        utm.add_rebalance(days[0], {'AAA': 100, 'BBB': 50})                  # $2,000
        # Day 2 close: CCC replaces BBB and the portfolio doubles (an aporte).
        utm.add_rebalance(days[1], {'AAA': 200, 'CCC': 44})
        self.days = days

    def test_aporte_is_not_return(self):
        p = utm.compute(today=D(2026, 1, 8))
        s = p['series']
        r = [s[i][1] / s[i - 1][1] - 1 for i in range(1, len(s))]
        # Day 2: old basket earns 1,100+1,000 on 2,000.
        self.assertAlmostEqual(r[0], 2100 / 2000 - 1)
        # Day 3: nothing moves for the new basket, even though the value doubled at day 2's close.
        self.assertAlmostEqual(r[1], 0.0)
        # Day 4: AAA +10% plus dividend, CCC +10%.
        v0 = 200 * 11 + 44 * 50
        self.assertAlmostEqual(r[2], (200 * (12.1 + 0.5) + 44 * 55) / v0 - 1)
        reb = p['rebalances'][-1]
        self.assertEqual(reb['ins'], ['CCC'])
        self.assertEqual(reb['outs'], ['BBB'])
        self.assertAlmostEqual(reb['flow'], (200 * 11 + 44 * 50) - (100 * 11 + 50 * 20))
        self.assertEqual(reb['signal'], 'Aporte')
        # The name that left is scored over the next period: BBB 20 -> 22.
        self.assertAlmostEqual(reb['out_ret']['BBB'], 0.10)

    def test_pending_rebalance_waits_for_its_close(self):
        utm.add_rebalance(D(2026, 1, 9), {'AAA': 1})
        p = utm.compute(today=D(2026, 1, 9))
        self.assertEqual([x['date'] for x in p['pending']], ['2026-01-09'])
        self.assertEqual({h['t'] for h in p['holdings']}, {'AAA', 'CCC'})

    def test_followup_trade_folds_into_rebalance(self):
        utm.add_rebalance(D(2026, 1, 8), {'AAA': 210, 'CCC': 44})   # same names, 2 days later
        p = utm.compute(today=D(2026, 1, 8))
        self.assertEqual([r['date'] for r in p['rebalances']], ['2026-01-05', '2026-01-06'])
        self.assertEqual(p['rebalance'], '2026-01-06')


class UtmCalendarTests(TestCase):
    def test_next_13f(self):
        n = utm.next_13f(D(2026, 11, 11))
        self.assertEqual(n['deadline'], '2026-11-16')          # 14-Nov-2026 is a Saturday
        self.assertEqual(n['expected_rebalance'], '2026-11-17')
        self.assertEqual(n['quarter'], '3T26')
        self.assertEqual(utm.next_13f(D(2026, 11, 17))['quarter'], '4T26')

    def test_norm_ticker(self):
        self.assertEqual(utm.norm_ticker('AMZN US'), 'AMZN')
        self.assertEqual(utm.norm_ticker(' nvda us equity '), 'NVDA')


class UtmRefreshTests(TestCase):
    def test_split_is_scaled_to_stored_basis(self):
        _px([(D(2026, 1, 5), 'SPY', 100, 0), (D(2026, 1, 5), 'QQQ', 100, 0), (D(2026, 1, 5), 'XYZ', 250, 0)])
        utm.add_rebalance(D(2026, 1, 5), {'XYZ': 10})
        fake = {'XYZ': {D(2026, 1, 5): (10.0, 0.0), D(2026, 1, 6): (11.0, 0.0)},
                'SPY': {D(2026, 1, 6): (101.0, 0.0)}, 'QQQ': {D(2026, 1, 6): (100.0, 0.0)}}
        with mock.patch.object(utm, '_yahoo', return_value=fake):
            out = utm.refresh_prices(today=D(2026, 1, 6))
        self.assertTrue(any('split' in w for w in out['warnings']))
        self.assertAlmostEqual(UtmPrice.objects.get(ticker='XYZ', date=D(2026, 1, 6)).close, 275.0)
        self.assertEqual(UtmRebalance.objects.count(), 1)

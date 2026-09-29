import datetime as dt
import unittest

from backend.scripts.sp500 import membership as M, wiki

CONS = """{| class="wikitable" id="constituents"
|-
! Symbol !! Security !! Sector !! Sub !! HQ !! Date added !! CIK !! Founded
|-
|| {{NyseSymbol|AAA}}
|| [[Alpha Corp|Alpha]]
|| Industrials
|| x
|| y
|| 2000-01-01
|| 0000000001
|| 1900
|-
|| {{NasdaqSymbol|NEW}}
|| [[Newco]]
|| Health Care
|| x
|| y
|| 2026-08-05
|| 0000000003
|| 2001
|}"""

CHANGES = """{| class="wikitable sortable" id="changes"
|-
! Effective Date !! Added !! !! Removed !! !! Reason
|-
! Ticker || Security || Ticker || Security
|-
|| August 5, 2026
|| NEW
|| [[Newco]]
|| OLD
|| [[Oldco]]
|| Acquired.
|| <ref>x</ref>
|}"""


class MembershipTest(unittest.TestCase):
    def setUp(self):
        self.reg = {"0000000002": {"ticker": "OLD", "name": "Oldco", "sector": "Energy", "sic": None, "current": True}}
        self.cons = wiki.parse_constituents(CONS)
        self.changes = wiki.parse_changes(CHANGES)

    def test_parsers(self):
        self.assertEqual([c["ticker"] for c in self.cons], ["AAA", "NEW"])
        self.assertEqual(self.cons[0]["name"], "Alpha")
        self.assertEqual(self.changes[0]["removed"], "OLD")

    def test_quarters_frozen_and_rebuilt(self):
        added = M.update_registry(self.reg, self.cons)
        self.assertEqual(sorted(added), ["0000000001", "0000000003"])
        self.assertFalse(self.reg["0000000002"]["current"])
        mem = {"quarters": ["2026Q1", "2026Q2"], "frozen_through": "2026Q2",
               "members": {"0000000001": "11", "0000000002": "11"}}
        out = M.update_membership(mem, self.reg, self.changes, dt.date(2026, 10, 20))
        self.assertEqual(out["quarters"][-2:], ["2026Q3", "2026Q4"])
        self.assertEqual(out["frozen_through"], "2026Q3")
        q = out["quarters"]
        bit = lambda cik, k: out["members"].get(cik, "0" * len(q))[q.index(k)]
        self.assertEqual([bit("0000000001", k) for k in ("2026Q1", "2026Q2", "2026Q3", "2026Q4")], list("1111"))
        self.assertEqual([bit("0000000002", k) for k in ("2026Q1", "2026Q2", "2026Q3", "2026Q4")], list("1100"))
        self.assertEqual([bit("0000000003", k) for k in ("2026Q2", "2026Q3", "2026Q4")], list("011"))
        # a later run must not rewrite the frozen 3Q26
        again = M.update_membership(out, self.reg, [], dt.date(2026, 11, 1))
        self.assertEqual(again["members"], out["members"])

    def test_no_freeze_inside_grace_period_or_without_fresh_changes(self):
        M.update_registry(self.reg, self.cons)
        mem = {"quarters": ["2026Q1", "2026Q2"], "frozen_through": "2026Q2", "members": {}}
        early = M.update_membership(mem, self.reg, self.changes, dt.date(2026, 10, 2))
        self.assertEqual(early["frozen_through"], "2026Q2")
        stale = M.update_membership(mem, self.reg, [], dt.date(2026, 11, 1), can_freeze=False)
        self.assertEqual(stale["frozen_through"], "2026Q2")

    def test_members_at_undoes_later_changes(self):
        M.update_registry(self.reg, self.cons)
        cur = {c for c, r in self.reg.items() if r["current"]}
        s = M.members_at(dt.date(2026, 6, 30), cur, self.changes, self.reg)
        self.assertEqual(s, {"0000000001", "0000000002"})


if __name__ == "__main__":
    unittest.main()

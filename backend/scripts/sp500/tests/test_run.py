import unittest

from backend.scripts.sp500 import run


def facts(rows):
    return {"facts": {"us-gaap": {"Revenues": {"units": {"USD": [
        {"start": s, "end": e, "val": v, "accn": a, "form": "10-Q", "filed": f} for s, e, v, a, f in rows]}}}}}


class FakeClient:
    def __init__(self, data):
        self.data = data

    def companyfacts(self, cik):
        return self.data.get(cik)

    def submissions(self, cik):
        return {"filings": {"recent": {"form": [], "accessionNumber": [], "reportDate": [], "filingDate": [], "primaryDocument": []}}}


class PredecessorTest(unittest.TestCase):
    def test_history_comes_from_old_cik_and_new_cik_wins_overlap(self):
        new = facts([("2026-04-01", "2026-06-30", 116, "n1", "2026-08-03"), ("2025-04-01", "2025-06-30", 82, "n1", "2026-08-03")])
        old = facts([("2025-04-01", "2025-06-30", 81, "o1", "2025-08-04"), ("2026-01-01", "2026-03-31", 85, "o2", "2026-05-04")])
        o = run.fetch_company(FakeClient({"NEW": new, "OLD": old}), "NEW", ["OLD"])
        got = {(r[0], r[1]): r[2] for r in o["facts"]["Revenues"]}
        self.assertEqual(got[(20260401, 20260630)], 116)
        self.assertEqual(got[(20250401, 20250630)], 82)   # current CIK wins
        self.assertEqual(got[(20260101, 20260331)], 85)   # history filled from predecessor


if __name__ == "__main__":
    unittest.main()

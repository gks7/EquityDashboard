import unittest

from backend.scripts.sp500 import sec

INSTANCE = """<?xml version="1.0" encoding="utf-8"?>
<xbrli:xbrl xmlns:xbrli="http://www.xbrl.org/2003/instance" xmlns:us-gaap="http://fasb.org/us-gaap/2025"
  xmlns:xbrldi="http://xbrl.org/2006/xbrldi" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
 <xbrli:context id="q"><xbrli:entity><xbrli:identifier scheme="x">1</xbrli:identifier></xbrli:entity>
  <xbrli:period><xbrli:startDate>2026-04-01</xbrli:startDate><xbrli:endDate>2026-06-30</xbrli:endDate></xbrli:period></xbrli:context>
 <xbrli:context id="i"><xbrli:entity><xbrli:identifier scheme="x">1</xbrli:identifier></xbrli:entity>
  <xbrli:period><xbrli:instant>2026-06-30</xbrli:instant></xbrli:period></xbrli:context>
 <xbrli:context id="seg"><xbrli:entity><xbrli:identifier scheme="x">1</xbrli:identifier>
  <xbrli:segment><xbrldi:explicitMember dimension="a">b</xbrldi:explicitMember></xbrli:segment></xbrli:entity>
  <xbrli:period><xbrli:startDate>2026-04-01</xbrli:startDate><xbrli:endDate>2026-06-30</xbrli:endDate></xbrli:period></xbrli:context>
 <us-gaap:Revenues contextRef="q" unitRef="usd" decimals="-6">12593000000</us-gaap:Revenues>
 <us-gaap:Revenues contextRef="seg" unitRef="usd" decimals="-6">1</us-gaap:Revenues>
 <us-gaap:Assets contextRef="i" unitRef="usd" decimals="-6">109215000000</us-gaap:Assets>
 <us-gaap:EarningsPerShareDiluted contextRef="q" unitRef="usdps" decimals="2">0.53</us-gaap:EarningsPerShareDiluted>
 <us-gaap:NetIncomeLoss contextRef="q" unitRef="usd" xsi:nil="true"/>
</xbrli:xbrl>"""


class SecTest(unittest.TestCase):
    def test_parse_instance_skips_dimensions_and_nil(self):
        p = sec.parse_instance(INSTANCE, filed=20260728)
        self.assertEqual(p["Revenues"], [[20260401, 20260630, 12593000000, 12593000000, 20260728, 20260728]])
        self.assertEqual(p["Assets"][0][:3], [0, 20260630, 109215000000])
        self.assertEqual(p["EarningsPerShareDiluted"][0][2], 0.53)
        self.assertNotIn("NetIncomeLoss", p)

    def test_extract_companyfacts_orig_latest_and_form_filter(self):
        facts = {"facts": {"us-gaap": {"Revenues": {"units": {"USD": [
            {"start": "2025-01-01", "end": "2025-03-31", "val": 10, "accn": "a", "form": "10-Q", "filed": "2025-05-01"},
            {"start": "2025-01-01", "end": "2025-03-31", "val": 11, "accn": "b", "form": "10-Q", "filed": "2026-05-01"},
            {"start": "2025-01-01", "end": "2025-03-31", "val": 99, "accn": "c", "form": "8-K", "filed": "2026-06-01"},
        ]}}}}}
        raw, accns = sec.extract_companyfacts(facts, tags=["Revenues"])
        self.assertEqual(raw["Revenues"], [[20250101, 20250331, 10, 11, 20250501, 20260501]])
        self.assertIn("a", accns)

    def test_pick_instance(self):
        idx = {"directory": {"item": [{"name": "x_cal.xml"}, {"name": "FilingSummary.xml"}, {"name": "abt-20260630_htm.xml"}]}}
        self.assertEqual(sec.pick_instance(idx), "abt-20260630_htm.xml")

    def test_merge_patch_keeps_companyfacts(self):
        base = {"Revenues": [[1, 2, 5, 5, 0, 0]]}
        sec.merge_patch(base, {"Revenues": [[1, 2, 7, 7, 0, 0], [3, 4, 8, 8, 0, 0]]})
        self.assertEqual(base["Revenues"], [[1, 2, 5, 5, 0, 0], [3, 4, 8, 8, 0, 0]])


if __name__ == "__main__":
    unittest.main()

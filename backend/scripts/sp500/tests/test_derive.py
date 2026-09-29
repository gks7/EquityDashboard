import unittest

from backend.scripts.sp500.derive import derive_company


def f(s, e, v, v2=None):
    return [s, e, v, v if v2 is None else v2, 20250101, 20250101]


class DeriveTest(unittest.TestCase):
    def test_september_fiscal_year_and_q4_by_difference(self):
        # FY Oct-Sep like Apple: Dec quarter is calendar 4Q, Q4 (Jul-Sep) only as FY - 9M
        raw = {"Revenues": [
            f(20231001, 20231230, 100), f(20231231, 20240330, 90), f(20240331, 20240629, 80),
            f(20231001, 20240629, 270), f(20231001, 20240928, 400),
            f(20241001, 20241228, 110), f(20241229, 20250329, 95),
        ]}
        m = derive_company(raw, "Information Technology", [(2023, 4), (2024, 1), (2024, 2), (2024, 3), (2024, 4), (2025, 1)])
        self.assertEqual(m[(2023, 4)]["rev"], 100)
        self.assertEqual(m[(2024, 3)]["rev"], 130)  # 400 - 270
        self.assertEqual(m[(2025, 1)]["rev"], 95)

    def test_three_month_value_equal_to_annual_is_rejected(self):
        raw = {"Revenues": [
            f(20240101, 20240331, 10), f(20240101, 20240630, 21), f(20240101, 20240930, 33),
            f(20240101, 20241231, 50), f(20241001, 20241231, 50),  # bad tag: Q4 tagged with FY value
        ]}
        m = derive_company(raw, "Industrials", [(2024, 4)])
        self.assertEqual(m[(2024, 4)]["rev"], 17)

    def test_balance_sheet_and_net_debt(self):
        raw = {
            "OperatingIncomeLoss": [f(20250101, 20250331, 5)],
            "LongTermDebtNoncurrent": [[0, 20250331, 100, 100, 1, 1]],
            "LongTermDebtCurrent": [[0, 20250331, 10, 10, 1, 1]],
            "CashAndCashEquivalentsAtCarryingValue": [[0, 20250331, 30, 30, 1, 1]],
            "ShortTermInvestments": [[0, 20250331, 5, 5, 1, 1]],
        }
        r = derive_company(raw, "Industrials", [(2025, 1)])[(2025, 1)]
        self.assertEqual((r["debt"], r["cash"], r["nd"]), (110, 35, 75))

    def test_financials_skip_ebit(self):
        raw = {"RevenuesNetOfInterestExpense": [f(20250101, 20250331, 40)], "OperatingIncomeLoss": [f(20250101, 20250331, 9)]}
        r = derive_company(raw, "Financials", [(2025, 1)])[(2025, 1)]
        self.assertEqual(r["rev"], 40)
        self.assertNotIn("ebit", r)


if __name__ == "__main__":
    unittest.main()

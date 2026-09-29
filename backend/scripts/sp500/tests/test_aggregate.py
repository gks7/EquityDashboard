import unittest

from backend.scripts.sp500.aggregate import Panel

Q = [(2024, 1), (2024, 2), (2024, 3), (2024, 4), (2025, 1)]


def co(cik, t, s, revs, current=True):
    return {"cik": cik, "t": t, "n": t, "s": s, "current": current,
            "m": {q: {"rev": r} for q, r in zip(Q, revs)}}


class PanelTest(unittest.TestCase):
    def test_point_in_time_and_base_break(self):
        cos = [
            co("1", "AAA", "Industrials", [100, 100, 100, 100, 110]),
            co("2", "BBB", "Energy", [100, 100, 100, 100, 50]),
            co("3", "CCC", "Industrials", [10, 10, 10, 10, 100]),   # 10x: base break, skipped
            co("4", "DDD", "Industrials", [100, 100, 100, 100, 200], current=False),
        ]
        bits = {"1": "11111", "2": "11111", "3": "11111", "4": "11110"}  # DDD left before 1Q25
        p = Panel(cos, Q, bits)
        a = p.aggregate(range(5))
        self.assertAlmostEqual(a["revenue_yoy"][4], (110 + 50) / 200 - 1)
        self.assertAlmostEqual(a["revenue_yoy_ex_energy"][4], 0.10)
        self.assertEqual(a["n"][4], 3)

    def test_last_complete_quarter(self):
        cos = [co(str(i), f"T{i}", "Industrials", [1, 1, 1, 1, 1 if i < 2 else None]) for i in range(10)]
        p = Panel(cos, Q, {str(i): "11111" for i in range(10)})
        self.assertEqual(p.L[p.last_complete()], "4Q24")


if __name__ == "__main__":
    unittest.main()

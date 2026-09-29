"""Nominal GDP and the broad dollar index from FRED, as YoY % per quarter."""

from __future__ import annotations

import csv
import io
import os

import requests

API = "https://api.stlouisfed.org/fred/series/observations"
CSV = "https://fred.stlouisfed.org/graph/fredgraph.csv"


def _quarterly(series: str, avg: bool) -> dict[tuple[int, int], float]:
    key = os.environ.get("FRED_API_KEY")
    rows: list[tuple[str, str]] = []
    if key:
        params = {"series_id": series, "api_key": key, "file_type": "json", "observation_start": "2017-01-01"}
        if avg:
            params.update(frequency="q", aggregation_method="avg")
        r = requests.get(API, params=params, timeout=60)
        r.raise_for_status()
        rows = [(o["date"], o["value"]) for o in r.json()["observations"]]
    else:
        params = {"id": series, "cosd": "2017-01-01"}
        if avg:
            params.update(fq="Quarterly", fam="avg")
        r = requests.get(CSV, params=params, timeout=60, headers={"User-Agent": "AlphaDash"})
        r.raise_for_status()
        rd = csv.reader(io.StringIO(r.text))
        next(rd)
        rows = [(a, b) for a, b in rd]
    out = {}
    for d, v in rows:
        if v in ("", "."):
            continue
        y, m = int(d[:4]), int(d[5:7])
        out[(y, (m - 1) // 3 + 1)] = float(v)
    return out


def yoy_by_quarter(quarters: list[tuple[int, int]]) -> dict[str, list]:
    res = {}
    for name, series, avg in (("gdp_nominal_yoy", "GDP", False), ("usd_broad_yoy", "DTWEXBGS", True)):
        try:
            lv = _quarterly(series, avg)
        except Exception as e:  # macro context is optional; never fail the run for it
            print(f"warning: FRED {series} unavailable: {e}")
            res[name] = [None] * len(quarters)
            continue
        vals = []
        for y, q in quarters:
            a, b = lv.get((y, q)), lv.get((y - 1, q))
            vals.append(round(a / b - 1, 4) if a and b else None)
        res[name] = vals
    return res

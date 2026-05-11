"""
Daily ingestion: pull macro indicators from FRED, compute trailing-10y
z-scores, and write a single JSON file consumed by the Macro page.

Reads the FRED API key from the FRED_API_KEY env var (set as a GitHub
Actions secret in CI).

Usage:
    FRED_API_KEY=xxxx python fetch_macro_data.py [out_path]

Default out_path: frontend/public/data/macro.json
"""

from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
from typing import Dict, List

import numpy as np
import pandas as pd
import requests

FRED_BASE = "https://api.stlouisfed.org/fred/series/observations"

# Indicator config. Keep this list small for the minimal first pass.
# To add an indicator later: append a dict with the FRED series_id,
# display name, section, transform, and sign convention.
INDICATORS: List[Dict] = [
    # --- Headline Inflation ---
    {"id": "CPIAUCSL", "name": "CPI", "section": "Headline Inflation",
     "transform": "yoy_pct", "bad_when_high": True},
    {"id": "CPILFESL", "name": "Core CPI", "section": "Headline Inflation",
     "transform": "yoy_pct", "bad_when_high": True},
    {"id": "PCEPI", "name": "PCE", "section": "Headline Inflation",
     "transform": "yoy_pct", "bad_when_high": True},
    {"id": "PCEPILFE", "name": "Core PCE", "section": "Headline Inflation",
     "transform": "yoy_pct", "bad_when_high": True},

    # --- Inflation Persistence ---
    {"id": "CORESTICKM159SFRBATL", "name": "Sticky CPI",
     "section": "Inflation Persistence",
     "transform": "level", "display_label": "YoY %", "bad_when_high": True},
    {"id": "PCETRIM12M159SFRBDAL", "name": "Trimmed Mean PCE",
     "section": "Inflation Persistence",
     "transform": "level", "display_label": "YoY %", "bad_when_high": True},
    {"id": "T5YIFR", "name": "5Y5Y Forward Inflation",
     "section": "Inflation Persistence",
     "transform": "level", "display_label": "%", "bad_when_high": True},

    # --- Employment ---
    {"id": "UNRATE", "name": "Unemployment Rate", "section": "Employment",
     "transform": "level", "display_label": "%", "bad_when_high": True},
    {"id": "PAYEMS", "name": "Nonfarm Payrolls", "section": "Employment",
     "transform": "mom_diff_k", "bad_when_high": False},
    {"id": "ICSA", "name": "Initial Claims", "section": "Employment",
     "transform": "level_k", "bad_when_high": True},
    {"id": "JTSJOL", "name": "Job Openings", "section": "Employment",
     "transform": "yoy_pct", "bad_when_high": False},
    {"id": "CES0500000003", "name": "Avg Hourly Earnings",
     "section": "Employment",
     "transform": "yoy_pct", "bad_when_high": True},

    # --- Activity ---
    {"id": "INDPRO", "name": "Industrial Production", "section": "Activity",
     "transform": "yoy_pct", "bad_when_high": False},
    {"id": "RSAFS", "name": "Retail Sales", "section": "Activity",
     "transform": "yoy_pct", "bad_when_high": False},
    {"id": "GDPC1", "name": "Real GDP", "section": "Activity",
     "transform": "yoy_pct", "bad_when_high": False, "quarterly": True},
    {"id": "TCU", "name": "Capacity Utilization", "section": "Activity",
     "transform": "level", "display_label": "%", "bad_when_high": False},

    # --- Consumer & Housing ---
    {"id": "UMCSENT", "name": "Consumer Sentiment",
     "section": "Consumer & Housing",
     "transform": "level", "display_label": "Index", "bad_when_high": False},
    {"id": "PERMIT", "name": "Building Permits",
     "section": "Consumer & Housing",
     "transform": "yoy_pct", "bad_when_high": False},
    {"id": "MORTGAGE30US", "name": "30Y Mortgage Rate",
     "section": "Consumer & Housing",
     "transform": "level", "display_label": "%", "bad_when_high": True},

    # --- Credit & Conditions ---
    {"id": "BAMLH0A0HYM2", "name": "HY Credit Spread",
     "section": "Credit & Conditions",
     "transform": "level", "display_label": "%", "bad_when_high": True},
    {"id": "NFCI", "name": "Financial Conditions",
     "section": "Credit & Conditions",
     "transform": "level", "display_label": "Index", "bad_when_high": True},
    {"id": "T10Y2Y", "name": "10Y-2Y Curve",
     "section": "Credit & Conditions",
     "transform": "level", "display_label": "%", "bad_when_high": False},
]

ROLLING_WINDOW_YEARS = 10
DISPLAY_MONTHS = 72  # 6 years of history shown on the heatmap
SPARKLINE_MONTHS = 24

TRANSFORM_LABELS = {
    "yoy_pct": "YoY %",
    "mom_diff_k": "Change (thousands)",
    "level": "Level",
    "level_k": "Thousands",
}


def fetch_fred(series_id: str, api_key: str, quarterly: bool = False) -> pd.Series:
    """Pull full history of a FRED series back to 1950, normalized to month-start."""
    params = {
        "series_id": series_id,
        "api_key": api_key,
        "file_type": "json",
        "observation_start": "1950-01-01",
    }
    resp = requests.get(FRED_BASE, params=params, timeout=30)
    resp.raise_for_status()
    obs = resp.json().get("observations", [])
    if not obs:
        raise RuntimeError(f"No observations returned for {series_id}")

    df = pd.DataFrame(obs)
    df["date"] = pd.to_datetime(df["date"])
    df["value"] = pd.to_numeric(df["value"], errors="coerce")
    df = df.set_index("date").dropna(subset=["value"])
    series = df["value"].resample("MS").last()
    if quarterly:
        # Fill the two non-quarter months so YoY (shift 12 rows) works on a true monthly index.
        series = series.ffill(limit=2)
    series = series.dropna()
    series.name = series_id
    return series


def transform(series: pd.Series, kind: str) -> pd.Series:
    if kind == "yoy_pct":
        return (series / series.shift(12) - 1.0) * 100.0
    if kind == "mom_diff_k":
        # FRED PAYEMS is in thousands of persons; diff gives jobs added in thousands.
        return series.diff()
    if kind == "level":
        return series
    if kind == "level_k":
        return series / 1000.0
    raise ValueError(f"Unknown transform: {kind}")


# ColorBrewer RdYlBu — diverging palette safe for red-green colorblindness
# (deuteranopia/protanopia, ~8% of men). The green end is replaced by blue.
# Keep in sync with PALETTE in frontend/src/lib/macroColors.ts.
_PALETTE_STOPS = [
    (-2.0, (215, 25, 28)),    # #d7191c  red
    (-1.0, (253, 174, 97)),   # #fdae61  orange
    (0.0,  (254, 216, 118)),  # #fed876  warm amber
    (1.0,  (116, 173, 209)),  # #74add1  medium blue
    (2.0,  (44, 123, 182)),   # #2c7bb6  deep blue
]


def z_color(z: float, bad_when_high: bool) -> str:
    """Map z-score to a hex color on a colorblind-safe diverging palette.

    bad_when_high flips the sign so blue always means 'good' regardless of
    the underlying series (e.g. for CPI, a high reading is bad).
    """
    if z is None or (isinstance(z, float) and np.isnan(z)):
        return "#cbd5e1"  # slate-300 — no-data

    score = -z if bad_when_high else z
    score = max(-2.0, min(2.0, score))

    for i in range(len(_PALETTE_STOPS) - 1):
        z0, c0 = _PALETTE_STOPS[i]
        z1, c1 = _PALETTE_STOPS[i + 1]
        if score <= z1:
            t = (score - z0) / (z1 - z0) if z1 > z0 else 0.0
            r = round(c0[0] + t * (c1[0] - c0[0]))
            g = round(c0[1] + t * (c1[1] - c0[1]))
            b = round(c0[2] + t * (c1[2] - c0[2]))
            return "#{:02x}{:02x}{:02x}".format(int(r), int(g), int(b))
    r, g, b = _PALETTE_STOPS[-1][1]
    return "#{:02x}{:02x}{:02x}".format(int(r), int(g), int(b))


def build_indicator(api_key: str, cfg: Dict) -> Dict:
    raw = fetch_fred(cfg["id"], api_key, quarterly=cfg.get("quarterly", False))
    disp = transform(raw, cfg["transform"]).dropna()

    window = ROLLING_WINDOW_YEARS * 12
    mu = disp.rolling(window, min_periods=24).mean()
    sd = disp.rolling(window, min_periods=24).std()
    z = (disp - mu) / sd

    last = disp.index.max()
    cutoff = (last - pd.DateOffset(months=DISPLAY_MONTHS - 1)).replace(day=1)

    cells = []
    for d in pd.date_range(cutoff, last, freq="MS"):
        if d not in disp.index:
            cells.append({"month": d.strftime("%Y-%m"), "value": None, "z": None, "color": "#cbd5e1"})
            continue
        v = float(disp.loc[d])
        zv_raw = z.loc[d]
        zv = float(zv_raw) if pd.notna(zv_raw) else None
        cells.append({
            "month": d.strftime("%Y-%m"),
            "value": round(v, 2),
            "z": round(zv, 3) if zv is not None else None,
            "color": z_color(zv if zv is not None else 0.0, cfg["bad_when_high"]),
        })

    spark_start = (last - pd.DateOffset(months=SPARKLINE_MONTHS - 1)).replace(day=1)
    sp = disp.loc[disp.index >= spark_start]
    sparkline = [
        {"date": d.strftime("%Y-%m"), "value": round(float(v), 2)}
        for d, v in sp.items()
    ]

    return {
        "id": cfg["id"],
        "name": cfg["name"],
        "section": cfg["section"],
        "transform_label": cfg.get("display_label", TRANSFORM_LABELS[cfg["transform"]]),
        "bad_when_high": cfg["bad_when_high"],
        "latest_value": cells[-1]["value"] if cells else None,
        "latest_month": cells[-1]["month"] if cells else None,
        "sparkline": sparkline,
        "cells": cells,
    }


def fetch_recession_months(api_key: str, months_window: List[str]) -> List[str]:
    """Return the subset of months_window that NBER marks as a US recession.

    USREC is a binary FRED series (1 = recession). We keep only the months
    that fall inside the display window so the frontend can shade them.
    """
    raw = fetch_fred("USREC", api_key)
    window_set = set(months_window)
    out: List[str] = []
    for d, v in raw.items():
        if int(v) == 1:
            m = d.strftime("%Y-%m")
            if m in window_set:
                out.append(m)
    return sorted(out)


def main() -> int:
    api_key = os.environ.get("FRED_API_KEY")
    if not api_key:
        print("ERROR: FRED_API_KEY env var not set", file=sys.stderr)
        return 1

    out_path = sys.argv[1] if len(sys.argv) > 1 else "frontend/public/data/macro.json"

    built = []
    for cfg in INDICATORS:
        print(f"Fetching {cfg['id']} ({cfg['name']})...", file=sys.stderr)
        built.append(build_indicator(api_key, cfg))

    section_order = []
    seen = set()
    for cfg in INDICATORS:
        if cfg["section"] not in seen:
            section_order.append(cfg["section"])
            seen.add(cfg["section"])

    sections = [
        {"title": s, "indicators": [i for i in built if i["section"] == s]}
        for s in section_order
    ]

    months_window = sorted({c["month"] for ind in built for c in ind["cells"]})

    print("Fetching USREC (NBER recession indicator)...", file=sys.stderr)
    recession_months = fetch_recession_months(api_key, months_window)

    payload = {
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "rolling_window_years": ROLLING_WINDOW_YEARS,
        "recession_months": recession_months,
        "months_window": months_window,
        "sections": sections,
    }

    os.makedirs(os.path.dirname(out_path) or ".", exist_ok=True)
    with open(out_path, "w") as f:
        json.dump(payload, f, indent=2)
    print(f"Wrote {out_path} ({len(built)} indicators, {len(months_window)} months)", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

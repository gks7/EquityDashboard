"""Daily refresh: SEC + Wikipedia + FRED -> frontend/public/data/sp500.json.

Usage (from the repo root):

    SEC_USER_AGENT="Company you@company.com" python -m backend.scripts.sp500.run \
        [--out frontend/public/data/sp500.json] [--cache .cache/sp500] [--offline]

--offline rebuilds from the cache only (no network), useful for testing.
Exits non-zero, without writing anything, when the sanity checks fail, so a
bad day never overwrites a good file.
"""

from __future__ import annotations

import argparse
import concurrent.futures as cf
import datetime as dt
import gzip
import json
import logging
import sys
import time
from pathlib import Path

from . import aggregate, config as C, derive, macro, membership, sec, wiki

log = logging.getLogger("sp500")

SIC_SECTOR = [  # fallback for companies Wikipedia no longer lists
    ((6000, 6499), "Financials"), ((6700, 6797), "Financials"), ((6799, 6799), "Financials"),
    ((6798, 6798), "Real Estate"), ((6500, 6599), "Real Estate"),
    ((1300, 1399), "Energy"), ((2900, 2999), "Energy"), ((4900, 4999), "Utilities"),
    ((2830, 2836), "Health Care"), ((3840, 3851), "Health Care"), ((8000, 8099), "Health Care"),
    ((3570, 3579), "Information Technology"), ((3660, 3679), "Information Technology"),
    ((7370, 7379), "Information Technology"), ((3825, 3829), "Information Technology"),
    ((4800, 4899), "Communication Services"), ((7800, 7999), "Communication Services"),
    ((2710, 2799), "Communication Services"), ((2000, 2199), "Consumer Staples"),
    ((5200, 5999), "Consumer Discretionary"), ((7000, 7099), "Consumer Discretionary"),
    ((2300, 2399), "Consumer Discretionary"), ((3710, 3716), "Consumer Discretionary"),
    ((2510, 2519), "Consumer Discretionary"), ((3630, 3639), "Consumer Discretionary"),
    ((1000, 1499), "Materials"), ((2600, 2699), "Materials"), ((2800, 2829), "Materials"),
    ((2840, 2899), "Materials"), ((3300, 3399), "Materials"), ((3080, 3089), "Materials"),
    ((3220, 3229), "Materials"),
]


def sic_sector(sic) -> str:
    try:
        x = int(sic)
    except (TypeError, ValueError):
        return "Industrials"
    for (lo, hi), s in SIC_SECTOR:
        if lo <= x <= hi:
            return s
    return "Industrials"


# ---------------------------------------------------------------- fetching
def _cache_path(cache: Path, cik: str) -> Path:
    return cache / f"{cik}.json.gz"


def _read_cache(cache: Path, cik: str):
    p = _cache_path(cache, cik)
    try:
        return json.loads(gzip.decompress(p.read_bytes())) if p.exists() else None
    except (OSError, ValueError, EOFError):
        log.warning("%s: unreadable cache entry ignored", cik)
        return None


def _write_cache(cache: Path, cik: str, obj):
    cache.mkdir(parents=True, exist_ok=True)
    _cache_path(cache, cik).write_bytes(gzip.compress(json.dumps(obj, separators=(",", ":")).encode()))


def fetch_company(client: sec.SecClient, cik: str) -> dict:
    """{'facts': raw facts, 'sic': str, 'patched': [accn], 'latest': report date}."""
    facts_json = client.companyfacts(cik)
    if not facts_json:
        raise LookupError("companyfacts returned 404")
    subs = client.submissions(cik)
    raw, accns = sec.extract_companyfacts(facts_json)
    patched = []
    filings = sec.recent_periodic_filings(subs, limit=3) if subs else []
    for f in filings:
        if f["accn"] in accns or not f["report"] or int(f["report"].replace("-", "")) < C.MIN_FACT_END:
            continue
        # companyfacts sometimes lags or skips a filing: read its XBRL instance directly
        idx = client.filing_index(cik, f["accn"])
        name = sec.pick_instance(idx)
        if not name:
            continue
        xml = client.filing_file(cik, f["accn"], name)
        if not xml:
            continue
        try:
            patch = sec.parse_instance(xml, filed=int(f["filed"].replace("-", "")))
        except Exception as e:
            log.warning("%s: could not parse %s: %s", cik, name, e)
            continue
        if sec.merge_patch(raw, patch):
            patched.append(f["accn"])
    return {"facts": raw, "sic": (subs or {}).get("sic"), "patched": patched,
            "latest": filings[0]["report"] if filings else None,
            "fetched": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")}


def fetch_all(ciks: list[str], cache: Path, offline: bool, workers: int = 6):
    """Returns (data by CIK, CIKs with no data at all, CIKs served from cache)."""
    client = None if offline else sec.SecClient()
    got, failed, stale = {}, [], []

    def job(cik):
        if offline:
            return cik, _read_cache(cache, cik), None
        try:
            obj = fetch_company(client, cik)
            _write_cache(cache, cik, obj)
            return cik, obj, None
        except Exception as e:  # network, 403 block, 404, parse error: fall back to yesterday
            return cik, _read_cache(cache, cik), e

    t0 = time.time()
    with cf.ThreadPoolExecutor(max_workers=1 if offline else workers) as ex:
        for n, (cik, obj, err) in enumerate(ex.map(job, ciks), 1):
            if err:
                if not isinstance(err, sec.SecUnavailable):
                    log.warning("%s: fetch failed (%s)%s", cik, err, ", using cache" if obj else "")
                if obj is not None:
                    stale.append(cik)
            if obj is None:
                failed.append(cik)
            else:
                got[cik] = obj
            if n % 50 == 0:
                log.info("fetched %d/%d (%.0fs)", n, len(ciks), time.time() - t0)
    return got, failed, stale


def _annotate(msg: str):
    """Warning in the log and, on GitHub Actions, on the run summary."""
    log.warning(msg)
    print(f"::warning::{msg}")


# ---------------------------------------------------------------- main
def build(today: dt.date, out_path: Path, cache: Path, offline: bool, data_dir: Path = membership.DATA_DIR,
          skip_web: bool = False) -> dict:
    reg, mem = membership.load(data_dir)
    changes: list[dict] = []
    wiki_ok = False
    if not (offline or skip_web):
        try:
            cons, changes = wiki.fetch_index()
            n_cik = len({c["cik"] for c in cons})
            if n_cik < 495:
                raise ValueError(f"only {n_cik} companies parsed from the constituents table")
            if not changes:
                raise ValueError("no rows parsed from the changes table")
            prev_current = {c for c, r in reg.items() if r.get("current")}
            new_current = {c["cik"] for c in cons}
            if prev_current and len(prev_current ^ new_current) > 40:
                raise ValueError(f"{len(prev_current ^ new_current)} companies changed since yesterday")
            new = membership.update_registry(reg, cons)
            if new:
                log.info("new index members: %s", ", ".join(reg[c]["ticker"] for c in new))
            wiki_ok = True
        except Exception as e:
            _annotate(f"Wikipedia unavailable or unparseable, keeping yesterday's index list: {e}")
            changes = []
    # without a fresh change log, open quarters are still rebuilt but never frozen
    mem = membership.update_membership(mem, reg, changes, today, can_freeze=wiki_ok)
    quarters = C.quarter_list(today)

    ciks = sorted(mem["members"])
    got, failed, stale = fetch_all(ciks, cache, offline)
    for cik, obj in got.items():
        if obj.get("sic") and not reg.get(cik, {}).get("sic"):
            reg.setdefault(cik, {"ticker": cik, "name": cik, "sector": None, "current": False})["sic"] = obj["sic"]
    patched = sum(1 for o in got.values() if o.get("patched"))
    log.info("companies: %d loaded (%d from cache), %d failed, %d patched from XBRL instances",
             len(got), len(stale), len(failed), patched)

    cos = []
    for cik in ciks:
        if cik not in got:
            continue
        r = reg[cik]
        sector = r.get("sector") or sic_sector(r.get("sic"))
        cos.append({"cik": cik, "t": r["ticker"].split("/")[0], "tickers": r["ticker"], "n": r["name"],
                    "s": sector, "current": bool(r.get("current")),
                    "m": derive.derive_company(got[cik]["facts"], sector, quarters)})

    P = aggregate.Panel(cos, quarters, mem["members"])
    kL = P.last_complete()
    QA = list(range(kL + 1))
    rep, n = P.coverage()
    labels = [P.L[k] for k in QA]
    agg = P.aggregate(QA)

    # ---- sanity checks: never publish a broken file
    problems = []
    members_now = len(P.members(kL))
    if len(failed) > 0.03 * len(ciks):
        problems.append(f"{len(failed)} of {len(ciks)} companies failed to load")
    big_failed = [reg[c]["ticker"] for c in failed if reg.get(c, {}).get("current")
                  and reg[c]["ticker"].split("/")[0] in C.LARGEST]
    if big_failed:
        problems.append("no data for large members: " + ", ".join(big_failed))
    if not offline and len(stale) > 0.10 * len(ciks):
        problems.append(f"{len(stale)} of {len(ciks)} companies could only be served from cache (SEC blocked?)")
    elif stale:
        _annotate(f"{len(stale)} companies served from yesterday's cache")
    if members_now < 480:
        problems.append(f"only {members_now} members in {P.L[kL]}")
    ry = agg["revenue_yoy"][-1]
    if ry is None or not (-0.4 < ry < 0.6):
        problems.append(f"implausible revenue YoY {ry}")
    if problems:
        raise SystemExit("sanity check failed: " + "; ".join(problems))

    mac = macro.yoy_by_quarter([quarters[k] for k in QA]) if not (offline or skip_web) else {}
    prev = {}
    if out_path.exists():
        try:
            prev = json.loads(out_path.read_text(encoding="utf-8"))
        except ValueError:
            prev = {}
    pm = prev.get("macro", {})
    for key in ("gdp_nominal_yoy", "usd_broad_yoy"):
        if not any(v is not None for v in mac.get(key, [])) and key in pm:  # FRED down: keep yesterday's
            mac[key] = [pm[key][pm["quarters"].index(l)] if l in pm["quarters"] else None for l in labels]

    payload = {
        "generated_at": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "as_of_quarter": P.L[kL],
        "quarters": labels,
        "in_progress": [{"quarter": P.L[k], "reported": rep[k], "members": n[k]} for k in range(kL + 1, len(quarters))],
        "coverage": {"reported": [rep[k] for k in QA], "members": [n[k] for k in QA]},
        "aggregate": agg,
        "macro": {"quarters": labels, **mac},
        "sectors": P.sectors(QA),
        "decomposition": P.decomposition(QA),
        "contributions": P.contributions(kL),
        "companies": P.companies(QA),
        "changes": [c for c in changes if c["date"] >= "2019-01-01"][:60],
        "stats": {"companies_loaded": len(got), "companies_failed": len(failed),
                  "companies_from_cache": len(stale), "patched_from_filings": patched,
                  "index_list_refreshed": wiki_ok},
        "method": {
            "ai_chain": sorted(C.AI_CHAIN), "mag7": sorted(C.MAG7),
            "outlier_growth": C.OUTLIER_GROWTH, "complete_coverage": C.COMPLETE_COVERAGE,
        },
    }
    if not changes and prev.get("changes"):
        payload["changes"] = prev["changes"]
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(payload, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
    if not offline:  # offline runs are for testing: never touch the committed membership files
        membership.save(reg, mem, data_dir)
    log.info("wrote %s (%d KB): %s, revenue YoY %.1f%%, %d companies",
             out_path, out_path.stat().st_size // 1024, P.L[kL], 100 * ry, len(payload["companies"]))
    return payload


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="frontend/public/data/sp500.json")
    ap.add_argument("--cache", default=".cache/sp500")
    ap.add_argument("--offline", action="store_true")
    ap.add_argument("--today", help="YYYY-MM-DD (testing)")
    a = ap.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s", stream=sys.stdout)
    today = dt.date.fromisoformat(a.today) if a.today else dt.datetime.now(dt.timezone.utc).date()
    build(today, Path(a.out), Path(a.cache), a.offline)


if __name__ == "__main__":
    main()

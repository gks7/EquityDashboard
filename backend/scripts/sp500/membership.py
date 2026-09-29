"""Point-in-time index membership, keyed by SEC CIK.

``data/registry.json``   every company that has been in the index since 2019
                         {cik: {ticker, name, sector, sic, current}}
``data/membership.json`` {"quarters": [...], "frozen_through": "2026Q2",
                          "members": {cik: "0101..."}}  one char per quarter

A company counts as a member of a quarter if it was in the index at the
quarter's last day (or today, for the quarter in progress). Closed quarters
are frozen, so later Wikipedia edits never rewrite history; open quarters
are rebuilt every run by undoing the change log from the current list.
"""

from __future__ import annotations

import datetime as dt
import json
import logging
from pathlib import Path

from . import config as C

log = logging.getLogger(__name__)
DATA_DIR = Path(__file__).parent / "data"


def qkey(yq) -> str:
    return f"{yq[0]}Q{yq[1]}"


def load(path: Path = DATA_DIR):
    reg = json.loads((path / "registry.json").read_text(encoding="utf-8"))
    mem = json.loads((path / "membership.json").read_text(encoding="utf-8"))
    return reg, mem


def save(reg: dict, mem: dict, path: Path = DATA_DIR):
    (path / "registry.json").write_text(json.dumps(reg, indent=1, sort_keys=True, ensure_ascii=False) + "\n", encoding="utf-8")
    (path / "membership.json").write_text(json.dumps(mem, indent=1, sort_keys=True) + "\n", encoding="utf-8")


def _ticker_index(reg: dict) -> dict[str, list[str]]:
    """Ticker (current, other share classes and former symbols) -> CIKs."""
    idx: dict[str, list[str]] = {}
    for cik, r in reg.items():
        for t in r["ticker"].split("/") + r.get("aliases", []):
            idx.setdefault(t, []).append(cik)
    return idx


def update_registry(reg: dict, constituents: list[dict]) -> list[str]:
    """Merge today's constituents into the registry. Returns CIKs added."""
    by_cik: dict[str, dict] = {}
    for c in constituents:
        r = by_cik.setdefault(c["cik"], {"tickers": [], "name": c["name"], "sector": c["sector"], "added": c.get("added")})
        r["tickers"].append(c["ticker"])
        if c.get("added") and (not r["added"] or c["added"] < r["added"]):
            r["added"] = c["added"]
    added = []
    for r in reg.values():
        r["current"] = False
    for cik, c in by_cik.items():
        # keep the share-class order already in the registry (GOOGL/GOOG)
        old = reg.get(cik)
        tick = c["tickers"]
        if old:
            known = [t for t in old["ticker"].split("/") if t in tick]
            tick = known + [t for t in tick if t not in known]
        name = c["name"]
        for suf in (" (Class A)", " (Class B)", " (Class C)", " (Series A)", " (Series C)"):
            name = name.replace(suf, "")
        if not old:
            added.append(cik)
            reg[cik] = {"ticker": "/".join(tick), "name": name, "sector": c["sector"], "sic": None}
        else:
            gone_symbols = [t for t in old["ticker"].split("/") if t not in tick]
            if gone_symbols:  # ticker change: keep the old symbol resolvable in the change log
                old["aliases"] = sorted(set(old.get("aliases", []) + gone_symbols))
            old["ticker"] = "/".join(tick)
            old["sector"] = c["sector"]
            old["name"] = name
        reg[cik]["current"] = True
        reg[cik]["added"] = c.get("added")
    return added


def _resolve(ticker: str, idx: dict, reg: dict, prefer_current: bool) -> str | None:
    cands = idx.get(ticker, [])
    if not cands:
        return None
    if len(cands) == 1:
        return cands[0]
    cands = sorted(cands, key=lambda c: (reg[c]["current"] != prefer_current, c))
    return cands[0]


def members_at(day: dt.date, current: set[str], changes: list[dict], reg: dict) -> set[str]:
    """Undo every change effective after ``day`` starting from today's list."""
    idx = _ticker_index(reg)
    s = set(current)
    for ch in changes:  # newest first
        if dt.date.fromisoformat(ch["date"]) <= day:
            break
        if ch.get("added"):
            c = _resolve(ch["added"], idx, reg, prefer_current=True)
            if c:
                s.discard(c)
        if ch.get("removed"):
            c = _resolve(ch["removed"], idx, reg, prefer_current=False)
            if c:
                s.add(c)
            elif not ch["removed"] in _warned:
                _warned.add(ch["removed"])
                log.info("removed ticker %s (%s) is not in the registry", ch["removed"], ch["date"])
    # the change log misses some additions; the constituents table's
    # "date added" column is authoritative for current members
    for c in list(s):
        a = reg.get(c, {}).get("added") if reg.get(c, {}).get("current") else None
        if a and dt.date.fromisoformat(a) > day:
            s.discard(c)
    return s


_warned: set[str] = set()


FREEZE_GRACE_DAYS = 14


def update_membership(mem: dict, reg: dict, changes: list[dict], today: dt.date, can_freeze: bool = True) -> dict:
    """Rebuild open quarters. A quarter is frozen only once it ended more than
    FREEZE_GRACE_DAYS ago and this run has a fresh Wikipedia change log, so an
    outage or late edits around quarter end cannot lock in a wrong list."""
    quarters = C.quarter_list(today)
    keys = [qkey(q) for q in quarters]
    old_keys = mem["quarters"]
    members = {c: dict(zip(old_keys, b)) for c, b in mem["members"].items()}
    frozen = mem.get("frozen_through", "")
    current = {c for c, r in reg.items() if r.get("current")}
    for q, k in zip(quarters, keys):
        if frozen and k <= frozen:
            continue
        qe = C.quarter_end(q)
        day = min(qe, today)
        s = members_at(day, current, changes, reg)
        for c in set(members) | s:
            members.setdefault(c, {})[k] = "1" if c in s else "0"
        if can_freeze and qe + dt.timedelta(days=FREEZE_GRACE_DAYS) < today:
            frozen = max(frozen, k)
    out = {c: "".join(m.get(k, "0") for k in keys) for c, m in members.items()}
    return {"quarters": keys, "frozen_through": frozen,
            "members": {c: b for c, b in sorted(out.items()) if "1" in b}}

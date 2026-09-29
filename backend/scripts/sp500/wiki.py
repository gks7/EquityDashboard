"""S&P 500 constituents and index changes from Wikipedia (wikitext via the API)."""

from __future__ import annotations

import datetime as dt
import re

import requests

API = "https://en.wikipedia.org/w/api.php"
UA = "AlphaDash/1.0 (https://github.com/gks7/EquityDashboard; gabriel@igfwm.com)"


def fetch_wikitext(page: str) -> str:
    r = requests.get(API, params={"action": "parse", "page": page, "prop": "wikitext",
                                  "format": "json", "formatversion": 2, "redirects": 1},
                     headers={"User-Agent": UA}, timeout=60)
    r.raise_for_status()
    return r.json()["parse"]["wikitext"]


def _clean(cell: str) -> str:
    c = re.sub(r"<ref[^>]*/>", "", cell)
    c = re.sub(r"<ref[^>]*>.*?</ref>", "", c, flags=re.S)
    c = re.sub(r"\{\{\s*(?:Nyse|Nasdaq|Cboe|NYSE|NASDAQ)[A-Za-z]*Symbol\s*\|\s*([^}|]+)[^}]*\}\}", r"\1", c)
    c = re.sub(r"\{\{[^}]*\}\}", "", c)
    c = re.sub(r"\[\[(?:[^\]|]*\|)?([^\]]*)\]\]", r"\1", c)
    c = re.sub(r"<[^>]+>", "", c)
    c = re.sub(r"^\s*(?:[a-z-]+=\"[^\"]*\"\s*)+\|", "", c)  # cell attributes like style="..." |
    return c.replace("&amp;", "&").replace("&nbsp;", " ").strip()


def _table(wikitext: str, table_id: str) -> list[list[str]]:
    i = wikitext.find(f'id="{table_id}"')
    if i < 0:
        raise ValueError(f"table {table_id!r} not found")
    j = wikitext.find("\n|}", i)
    body = wikitext[i:j]
    rows = []
    for chunk in body.split("\n|-")[1:]:
        lines = [ln for ln in chunk.strip("\n").split("\n")]
        if not lines or lines[0].lstrip().startswith("!") or any(ln.lstrip().startswith("!") for ln in lines[:1]):
            continue
        text = "\n".join(lines)
        if not text.strip().startswith("|"):
            continue
        # cells are introduced by "||" or a leading "|" on a new line
        cells = re.split(r"\n\|\|?|\|\|", "\n" + text)
        cells = [c for c in cells[1:]]
        rows.append([_clean(c) for c in cells])
    return rows


def parse_constituents(wikitext: str) -> list[dict]:
    """[{ticker, name, sector, cik}] for the current index members."""
    out = []
    for c in _table(wikitext, "constituents"):
        if len(c) < 7:
            continue
        cik = re.sub(r"\D", "", c[6])
        if not cik:
            continue
        added = _date(c[5])
        out.append({"ticker": c[0].replace(" ", ""), "name": c[1], "sector": c[2],
                    "cik": cik.zfill(10), "added": added.isoformat() if added else None})
    return out


def _date(s: str) -> dt.date | None:
    s = s.strip()
    for fmt in ("%B %d, %Y", "%Y-%m-%d", "%d %B %Y", "%b %d, %Y"):
        try:
            return dt.datetime.strptime(s, fmt).date()
        except ValueError:
            pass
    return None


def parse_changes(wikitext: str) -> list[dict]:
    """[{date, added, added_name, removed, removed_name, reason}], newest first."""
    out = []
    for c in _table(wikitext, "changes"):
        if len(c) < 5:
            continue
        d = _date(c[0])
        if d is None:
            continue
        out.append({"date": d.isoformat(), "added": c[1].replace(" ", ""), "added_name": c[2],
                    "removed": c[3].replace(" ", ""), "removed_name": c[4],
                    "reason": c[5] if len(c) > 5 else ""})
    out.sort(key=lambda r: r["date"], reverse=True)
    return out


def fetch_index() -> tuple[list[dict], list[dict]]:
    cons = parse_constituents(fetch_wikitext("List of S&P 500 companies"))
    chg = parse_changes(fetch_wikitext("Historical components of the S&P 500"))
    return cons, chg

"""SEC EDGAR access: companyfacts, submissions and XBRL instance documents.

SEC fair-access rules: identify yourself in the User-Agent (env
SEC_USER_AGENT, "Company contact@email") and stay under 10 requests/second.
"""

from __future__ import annotations

import os
import re
import threading
import time
import xml.etree.ElementTree as ET

import requests

from . import config as C

DATA = "https://data.sec.gov"
WWW = "https://www.sec.gov"


class SecUnavailable(RuntimeError):
    """Too many consecutive failures: stop calling the SEC for this run."""


class SecClient:
    def __init__(self, user_agent: str | None = None, rate: float = 8.0, retries: int = 4, breaker: int = 25):
        ua = user_agent or os.environ.get("SEC_USER_AGENT") or "AlphaDash research gabriel@igfwm.com"
        self.s = requests.Session()
        self.s.headers.update({"User-Agent": ua, "Accept-Encoding": "gzip, deflate"})
        self.min_gap = 1.0 / rate
        self.retries = retries
        self._lock = threading.Lock()
        self._next = 0.0
        self.breaker = breaker
        self._fails = 0

    def _wait(self):
        with self._lock:
            now = time.monotonic()
            t = max(now, self._next)
            self._next = t + self.min_gap
        if t > now:
            time.sleep(t - now)

    def get(self, url: str, as_json: bool = True):
        """JSON (or raw bytes when as_json=False); None on 404.

        429/5xx/network errors are retried with backoff; other 4xx (403 is
        the SEC's block response) fail at once. After ``breaker`` consecutive
        failed calls every further call raises SecUnavailable, so a blocked
        run falls back to the cache in seconds instead of timing out."""
        if self._fails >= self.breaker:
            raise SecUnavailable(f"SEC unavailable after {self._fails} consecutive failures")
        err = None
        for attempt in range(self.retries + 1):
            self._wait()
            try:
                r = self.s.get(url, timeout=60)
                if r.status_code == 404:
                    self._fails = 0
                    return None
                if r.status_code in (429, 500, 502, 503, 504):
                    raise requests.HTTPError(f"{r.status_code} for {url}")
                if 400 <= r.status_code < 500:
                    err = requests.HTTPError(f"{r.status_code} for {url}")
                    break
                r.raise_for_status()
                out = r.json() if as_json else r.content
                self._fails = 0
                return out
            except (requests.RequestException, ValueError) as e:
                err = e
                time.sleep(min(30, 2 ** attempt))
        with self._lock:
            self._fails += 1
        raise RuntimeError(f"GET failed: {url}: {err}")

    def companyfacts(self, cik: str):
        return self.get(f"{DATA}/api/xbrl/companyfacts/CIK{cik}.json")

    def submissions(self, cik: str):
        return self.get(f"{DATA}/submissions/CIK{cik}.json")

    def filing_index(self, cik: str, accn: str):
        return self.get(f"{WWW}/Archives/edgar/data/{int(cik)}/{accn.replace('-', '')}/index.json")

    def filing_file(self, cik: str, accn: str, name: str) -> bytes | None:
        return self.get(f"{WWW}/Archives/edgar/data/{int(cik)}/{accn.replace('-', '')}/{name}", as_json=False)


def _d8(s: str | None) -> int:
    return int(s.replace("-", "")) if s else 0


def _form_ok(form: str) -> bool:
    return form.startswith(C.FORM_PREFIXES)


def extract_companyfacts(facts: dict, tags=C.TAGS) -> tuple[dict, set]:
    """companyfacts JSON -> ({tag: [[s, e, v_orig, v_latest, f_orig, f_latest]]}, accessions)."""
    ug = (facts or {}).get("facts", {}).get("us-gaap", {})
    out, accns = {}, set()
    for t in tags:
        if t not in ug:
            continue
        m = {}
        for arr in ug[t].get("units", {}).values():
            for x in arr:
                if not _form_ok(x.get("form", "")):
                    continue
                accns.add(x.get("accn"))
                e = _d8(x.get("end"))
                if e < C.MIN_FACT_END:
                    continue
                m.setdefault((_d8(x.get("start")), e), []).append((_d8(x.get("filed")), x["val"]))
        rows = []
        for (s, e), lst in m.items():
            lst.sort(key=lambda z: z[0])
            rows.append([s, e, lst[0][1], lst[-1][1], lst[0][0], lst[-1][0]])
        if rows:
            out[t] = rows
    # accessions of any tag in any taxonomy (dei, us-gaap, ...), so a filing
    # counts as ingested even if it only carries cover-page facts
    for taxonomy in (facts or {}).get("facts", {}).values():
        for tag in taxonomy.values():
            for arr in tag.get("units", {}).values():
                for x in arr:
                    accns.add(x.get("accn"))
    return out, accns


def recent_periodic_filings(subs: dict, limit: int = 3) -> list[dict]:
    """Latest 10-Q/10-K filings (newest first) from a submissions JSON."""
    r = (subs or {}).get("filings", {}).get("recent", {})
    out = []
    for i, form in enumerate(r.get("form", [])):
        if not _form_ok(form):
            continue
        if "isXBRL" in r and not r["isXBRL"][i]:
            continue
        out.append({"form": form, "accn": r["accessionNumber"][i], "report": r["reportDate"][i],
                    "filed": r["filingDate"][i], "doc": r["primaryDocument"][i]})
        if len(out) >= limit:
            break
    return out


_SKIP = re.compile(r"(_cal|_def|_lab|_pre)\.xml$|FilingSummary\.xml$", re.I)


def pick_instance(index: dict) -> str | None:
    """Name of the XBRL instance in a filing directory listing."""
    names = [x["name"] for x in (index or {}).get("directory", {}).get("item", [])]
    for n in names:
        if n.lower().endswith("_htm.xml"):
            return n
    for n in names:
        if n.lower().endswith(".xml") and not _SKIP.search(n):
            return n
    return None


def parse_instance(xml: str, tags=C.TAGS, filed: int = 0) -> dict:
    """XBRL instance -> {tag: [[s, e, v, v, filed, filed]]} for non-dimensional contexts."""
    root = ET.fromstring(xml.encode("utf-8") if isinstance(xml, str) else xml)
    xbrli = "{http://www.xbrl.org/2003/instance}"
    ctx = {}
    for c in root.iter(xbrli + "context"):
        if c.find(f"{xbrli}entity/{xbrli}segment") is not None or c.find(f"{xbrli}scenario") is not None:
            continue
        p = c.find(xbrli + "period")
        if p is None:
            continue
        inst = p.find(xbrli + "instant")
        if inst is not None:
            ctx[c.get("id")] = (0, _d8(inst.text.strip()))
        else:
            s, e = p.find(xbrli + "startDate"), p.find(xbrli + "endDate")
            if s is not None and e is not None:
                ctx[c.get("id")] = (_d8(s.text.strip()), _d8(e.text.strip()))
    want = set(tags)
    out: dict = {}
    for el in root:
        tag = el.tag
        if not tag.startswith("{") or "us-gaap" not in tag:
            continue
        name = tag.split("}", 1)[1]
        if name not in want:
            continue
        per = ctx.get(el.get("contextRef"))
        if per is None or el.get("{http://www.w3.org/2001/XMLSchema-instance}nil") == "true":
            continue
        txt = (el.text or "").strip()
        try:
            v = float(txt)
        except ValueError:
            continue
        v = int(v) if v.is_integer() and "." not in txt else v
        s, e = per
        if e < C.MIN_FACT_END:
            continue
        rows = out.setdefault(name, {})
        rows.setdefault((s, e), v)
    return {t: [[s, e, v, v, filed, filed] for (s, e), v in m.items()] for t, m in out.items()}


def merge_patch(base: dict, patch: dict) -> int:
    """Add instance facts whose (start, end) is not already in companyfacts.
    Returns the number of facts added."""
    n = 0
    for t, rows in patch.items():
        have = {(r[0], r[1]) for r in base.get(t, [])}
        for r in rows:
            if (r[0], r[1]) not in have:
                base.setdefault(t, []).append(r)
                have.add((r[0], r[1]))
                n += 1
    return n

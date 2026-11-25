"""
Druck page (/druck) live layer.

GET /api/druck/live/ — intraday Yahoo quotes for the "Ao vivo" strip and for
the market rows of the page table. Cached for 60 s per process so any number
of open pages costs one Yahoo round per minute.

The daily part of the page (FRED series, 3-month signals) is a static file,
frontend/public/data/druck.json, built by backend/scripts/fetch_druck_data.py.
"""
import logging
import threading
import time
from concurrent.futures import ThreadPoolExecutor

from rest_framework.response import Response
from rest_framework.views import APIView

log = logging.getLogger(__name__)

CACHE_SECONDS = 60


def _spec(grp, id, name, unit="px", dec=2, pre="", pol=0):
    return {"grp": grp, "id": id, "name": name, "unit": unit, "dec": dec, "pre": pre, "pol": pol}


# Live strip, in display order. pol = +1 if "up" is good for risk assets.
LIVE = [
    _spec("Risco", "^GSPC", "S&P 500", dec=0, pol=1),
    _spec("Risco", "^VIX", "VIX", dec=1, pol=-1),
    _spec("Risco", "^MOVE", "MOVE (vol. Treasuries)", dec=0, pol=-1),
    _spec("Juros", "^IRX", "T-bill 3 meses", unit="yield", pol=-1),
    _spec("Juros", "^FVX", "Treasury 5 anos", unit="yield", pol=-1),
    _spec("Juros", "^TNX", "Treasury 10 anos", unit="yield"),
    _spec("Juros", "curva", "Curva 10a − 3m", unit="spread"),
    _spec("Crédito", "HYG", "High yield (HYG)", pre="US$ ", pol=1),
    _spec("Crédito", "KRE", "Bancos regionais (KRE)", pre="US$ ", pol=1),
    _spec("Câmbio", "DX-Y.NYB", "Dólar (DXY)", pol=-1),
    _spec("Câmbio", "JPY=X", "USD/JPY"),
    _spec("Commodities", "HG=F", "Cobre", pre="US$ ", pol=1),
    _spec("Commodities", "GC=F", "Ouro", dec=0, pre="US$ "),
    _spec("Commodities", "CL=F", "Petróleo WTI", pre="US$ "),
    _spec("Commodities", "BTC-USD", "Bitcoin", dec=0, pre="US$ ", pol=1),
]
# Components of the market rows in the page table ("Último" column).
TABLE_TICKERS = ["SPY", "XLY", "XLP", "SMH", "XHB", "IYT", "XRT", "IWM", "RSP", "KRE", "CEW",
                 "DX-Y.NYB", "JPY=X", "HG=F", "GC=F", "CL=F", "BTC-USD"]

_lock = threading.Lock()
_cache = {"t": 0.0, "data": None}


def _quote(tk):
    import yfinance as yf
    try:
        t = yf.Ticker(tk)
        h = t.history(period="1d", interval="5m", auto_adjust=False)
        m = t.history_metadata or {}
        last = m.get("regularMarketPrice")
        prev = m.get("chartPreviousClose") or m.get("previousClose")
        if last is None:
            return None
        intraday = []
        if not h.empty:
            c = h["Close"].dropna()
            intraday = [[int(ts.timestamp()), round(float(v), 6)] for ts, v in c.items()]
        return {"last": float(last), "prev": float(prev) if prev else None,
                "time": int(m.get("regularMarketTime") or 0), "intraday": intraday}
    except Exception:  # one bad ticker must not sink the strip
        log.warning("druck live: quote failed for %s", tk, exc_info=True)
        return None


def _build():
    tickers = sorted({s["id"] for s in LIVE if s["id"] != "curva"} | set(TABLE_TICKERS) | {"^TNX", "^IRX"})
    with ThreadPoolExecutor(max_workers=8) as ex:
        quotes = {tk: q for tk, q in zip(tickers, ex.map(_quote, tickers)) if q}
    a, b = quotes.get("^TNX"), quotes.get("^IRX")
    if a and b:
        ib = dict(b["intraday"])
        quotes["curva"] = {
            "last": a["last"] - b["last"],
            "prev": (a["prev"] - b["prev"]) if a["prev"] and b["prev"] else None,
            "time": min(a["time"], b["time"]),
            "intraday": [[t, round(v - ib[t], 6)] for t, v in a["intraday"] if t in ib],
        }
    return {"asof": int(time.time()), "spec": LIVE, "quotes": quotes}


class DruckLiveView(APIView):
    def get(self, request):
        with _lock:
            fresh = _cache["data"] is not None and time.time() - _cache["t"] < CACHE_SECONDS
            if not fresh:
                try:
                    data = _build()
                except Exception as e:  # Yahoo down: serve the last good payload if any
                    log.exception("druck live: build failed")
                    if _cache["data"] is None:
                        return Response({"error": f"{e.__class__.__name__}: {e}"}, status=502)
                    data = None
                if data and data["quotes"]:
                    _cache["data"], _cache["t"] = data, time.time()
            return Response(_cache["data"] or {"error": "no quotes"}, status=200 if _cache["data"] else 502)

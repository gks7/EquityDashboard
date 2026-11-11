"""
UTM — internal portfolio rebuilt every quarter from managers' 13F filings:
10 names, ~10% each, rebalanced right after the 13F deadline.

The portfolio sometimes grows (money put in) and sometimes shrinks (money taken
out) at a rebalance. Those flows are never typed in: they are implied by the
change in shares x that day's close. The return is a flow-adjusted daily chain,

    r_t = sum_i H_i(t-1) * (P_i(t) + D_i(t)) / sum_i H_i(t-1) * P_i(t-1) - 1

i.e. day t is earned by the basket held at the previous close, and a rebalance
at the close of t only changes what earns day t+1. Money in/out therefore never
counts as performance (the original spreadsheet's main error).

Data:
  * import_workbook()  — the internal UTM Excel (Position / Stock Prices / Dividends)
  * refresh_prices()   — closes and dividends from Yahoo for dates after the Excel
  * add_rebalance()    — a new basket entered on the page
  * compute()          — everything the /utm page renders
"""
from __future__ import annotations

import datetime as dt
import math
from bisect import bisect_right
from collections import defaultdict

from django.db import transaction

from .models import UtmRebalance, UtmHolding, UtmPrice

BENCH = ('SPY', 'QQQ')
REBAL_SIGNAL = 0.05   # net flow above +/-5% of the value before = aporte / resgate


def norm_ticker(raw) -> str:
    t = str(raw or '').strip().upper()
    for suf in (' US EQUITY', ' US'):
        if t.endswith(suf):
            t = t[: -len(suf)]
    return t.strip()


def _d(v):
    if isinstance(v, dt.datetime):
        return v.date()
    if isinstance(v, dt.date):
        return v
    return None


def _f(v):
    try:
        x = float(v)
    except (TypeError, ValueError):
        return None
    return x if math.isfinite(x) else None


# ─── Excel import ────────────────────────────────────────────────────────────
def parse_workbook(fileobj):
    """Read the internal UTM workbook. Returns (rebalances, prices, info)."""
    import openpyxl
    wb = openpyxl.load_workbook(fileobj, read_only=True, data_only=True)
    for name in ('Position', 'Stock Prices'):
        if name not in wb.sheetnames:
            raise ValueError(f"Aba '{name}' não encontrada — este não parece ser o Excel da UTM.")

    # Stock Prices: row 2 = header. First block of tickers = closes; SPY/QQQ closes
    # and adjusted closes further right.
    rows = wb['Stock Prices'].iter_rows(values_only=True)
    next(rows)
    hdr = list(next(rows))
    first = hdr[1]
    end_block = next((j for j in range(2, len(hdr)) if hdr[j] == first), None)
    if not first or not end_block:
        raise ValueError("Cabeçalho da aba 'Stock Prices' não reconhecido.")
    px_cols = {j: norm_ticker(hdr[j]) for j in range(1, end_block) if hdr[j]}

    def col(label):
        return next((j for j, h in enumerate(hdr) if isinstance(h, str) and h.strip() == label), None)
    bench_cols = {'SPY': (col('SPY'), col('SPY adj. close')), 'QQQ': (col('QQQ'), col('QQQ adj. close'))}
    if any(c is None for pair in bench_cols.values() for c in pair):
        raise ValueError("Colunas de SPY/QQQ (fechamento e adj. close) não encontradas em 'Stock Prices'.")

    closes = {}           # (date, ticker) -> close
    bench_adj = defaultdict(dict)
    for r in rows:
        d = _d(r[0])
        if not d:
            continue
        for j, t in px_cols.items():
            v = _f(r[j]) if j < len(r) else None
            if v and v > 0:
                closes[(d, t)] = v
        for t, (cj, aj) in bench_cols.items():
            c, a = _f(r[cj]), _f(r[aj])
            if c and c > 0:
                closes[(d, t)] = c
                if a and a > 0:
                    bench_adj[t][d] = (c, a)
    trading = sorted({d for (d, t) in closes if t == 'SPY'})
    if not trading:
        raise ValueError("Nenhum preço de SPY encontrado em 'Stock Prices'.")

    # Dividends per share by ex-date for the portfolio names.
    divs = {}
    if 'Dividends' in wb.sheetnames:
        drows = wb['Dividends'].iter_rows(values_only=True)
        next(drows)
        dh = list(next(drows))
        dcols = {j: norm_ticker(dh[j]) for j in range(1, len(dh)) if dh[j]}
        for r in drows:
            d = _d(r[0])
            if not d:
                continue
            for j, t in dcols.items():
                v = _f(r[j]) if j < len(r) else None
                if v and v > 0:
                    divs[(d, t)] = v
    # SPY/QQQ dividends implied by the adjusted close (Yahoo's multiplicative adjustment):
    # D_t = P_{t-1} - adj_{t-1} * P_t / adj_t. Rounding noise is a cent or two; real
    # distributions are tens of cents and up.
    for t, m in bench_adj.items():
        ds = sorted(m)
        for a, b in zip(ds, ds[1:]):
            (p0, a0), (p1, a1) = m[a], m[b]
            dvd = p0 - a0 * p1 / a1
            if dvd > 0.05:
                divs[(b, t)] = round(dvd, 4)

    # Position: row 1 = tickers, then one row per calendar day (newest first).
    prow = wb['Position'].iter_rows(values_only=True)
    ph = list(next(prow))
    pcols = {j: norm_ticker(ph[j]) for j in range(1, len(ph)) if ph[j]}
    daily = {}
    for r in prow:
        d = _d(r[0])
        if not d:
            continue
        h = {}
        for j, t in pcols.items():
            v = _f(r[j]) if j < len(r) else None
            if v:
                h[t] = v
        if h:
            daily[d] = h
    rebal = []
    prev = None
    for d in sorted(daily):
        if daily[d] != prev:
            # A change dated on a weekend/holiday trades on the next trading day.
            k = next((x for x in trading if x >= d), None)
            if k is None:
                break
            if rebal and rebal[-1][0] == k:
                rebal[-1] = (k, daily[d])
            else:
                rebal.append((k, daily[d]))
            prev = daily[d]

    prices = {}
    for (d, t), c in closes.items():
        prices[(d, t)] = [c, 0.0]
    for (d, t), v in divs.items():
        if (d, t) in prices:
            prices[(d, t)][1] = v
    info = {'first': trading[0].isoformat(), 'last': trading[-1].isoformat(),
            'rebalances': len(rebal), 'prices': len(prices),
            'tickers': len({t for (_, t) in prices})}
    return rebal, prices, info


@transaction.atomic
def import_workbook(fileobj):
    """Replace everything up to the workbook's last date with the workbook's data.
    Rebalances and Yahoo prices after that date (entered later) are kept."""
    rebal, prices, info = parse_workbook(fileobj)
    last = dt.date.fromisoformat(info['last'])
    UtmRebalance.objects.filter(date__lte=last).delete()
    UtmPrice.objects.filter(date__lte=last).delete()
    for d, h in rebal:
        rb = UtmRebalance.objects.create(date=d, source='excel')
        UtmHolding.objects.bulk_create([UtmHolding(rebalance=rb, ticker=t, shares=s) for t, s in h.items()])
    UtmPrice.objects.bulk_create(
        [UtmPrice(date=d, ticker=t, close=c, dividend=v, source='excel') for (d, t), (c, v) in prices.items()],
        batch_size=2000)
    return info


# ─── Manual rebalance ────────────────────────────────────────────────────────
@transaction.atomic
def add_rebalance(date, holdings, note=''):
    """`holdings`: {ticker: shares}. Replaces a rebalance on the same date."""
    clean = {}
    for t, s in holdings.items():
        t, s = norm_ticker(t), _f(s)
        if t and s and s > 0:
            clean[t] = clean.get(t, 0) + s
    if not clean:
        raise ValueError('Informe pelo menos um ticker com quantidade.')
    UtmRebalance.objects.filter(date=date).delete()
    rb = UtmRebalance.objects.create(date=date, note=note or '', source='manual')
    UtmHolding.objects.bulk_create([UtmHolding(rebalance=rb, ticker=t, shares=s) for t, s in clean.items()])
    return rb


# ─── Yahoo prices ────────────────────────────────────────────────────────────
YAHOO_ALIAS = {'BRK.B': 'BRK-B', 'BF.B': 'BF-B'}


def _yahoo(tickers, start, end):
    """{ticker: {date: (close, dividend)}} from Yahoo (unadjusted close, cash dividends)."""
    import yfinance as yf
    out = defaultdict(dict)
    sym = {YAHOO_ALIAS.get(t, t): t for t in tickers}
    df = yf.download(list(sym), start=start.isoformat(), end=(end + dt.timedelta(days=1)).isoformat(),
                     auto_adjust=False, actions=True, progress=False, group_by='ticker', threads=True)
    if df is None or df.empty:
        return out
    for s, t in sym.items():
        try:
            sub = df[s] if len(sym) > 1 or s in df.columns.get_level_values(0) else df
        except KeyError:
            continue
        for idx, row in sub.iterrows():
            c = _f(row.get('Close'))
            if not c or c <= 0:
                continue
            dv = _f(row.get('Dividends')) or 0.0
            out[t][idx.date()] = (c, dv)
    return out


def major_rebalances(baskets):
    """Indices of the real rebalances. A change with no name in or out within 10 days of
    the previous one (e.g. 100 META bought two days later) completes that rebalance."""
    out = []
    for k, b in enumerate(baskets):
        if k and out:
            prev = baskets[k - 1][1]
            same_names = set(prev) == set(b[1])
            if same_names and (b[0] - baskets[out[-1]][0]).days < 10:
                continue
        out.append(k)
    return out


def refresh_prices(today=None):
    """Fetch from Yahoo what the page needs and the database lacks: the current basket
    and SPY/QQQ up to today, and the names that left at each rebalance over the
    quarter after they left (to score the swap)."""
    today = today or dt.date.today()
    rbs = list(UtmRebalance.objects.prefetch_related('holdings').order_by('date'))
    if not rbs:
        return {'ok': False, 'error': 'Nenhum rebalanceamento carregado.'}
    baskets = [(rb.date, {h.ticker for h in rb.holdings.all()}) for rb in rbs]
    majors = major_rebalances(baskets)
    spy_days = sorted(UtmPrice.objects.filter(ticker='SPY').values_list('date', flat=True))
    stored = defaultdict(set)
    for d, t in UtmPrice.objects.values_list('date', 'ticker'):
        stored[t].add(d)

    starts = {}   # ticker -> first date to fetch

    def want(t, d):
        starts[t] = min(starts.get(t, d), d)

    def last_or(t, d):
        return max(stored[t]) if stored[t] else d
    for b in BENCH:
        want(b, last_or(b, baskets[0][0]) - dt.timedelta(days=7))
    # Every basket from the last stored SPY day on (normally just the current one).
    horizon = (spy_days[-1] if spy_days else baskets[0][0])
    for k, (d, names) in enumerate(baskets):
        nxt = baskets[k + 1][0] if k + 1 < len(baskets) else None
        if nxt is None or nxt > horizon:
            for t in names:   # from where its stored prices stop, never before the basket
                want(t, max(d, last_or(t, d)) - dt.timedelta(days=7))
    # Names that left: their quarter after leaving, when not already priced.
    for j, k in enumerate(majors[1:], 1):
        d = baskets[k][0]
        end = baskets[majors[j + 1]][0] if j + 1 < len(majors) else today
        window = [x for x in spy_days if d < x <= end]
        for t in baskets[majors[j - 1]][1] - baskets[k][1]:
            got = sum(1 for x in window if x in stored[t])
            if not window or got < 0.9 * len(window):
                want(t, d - dt.timedelta(days=3))
    need = set(starts)
    start = min(starts.values())
    have = defaultdict(dict)
    for p in UtmPrice.objects.filter(date__gte=start, ticker__in=need):
        have[p.ticker][p.date] = p
    data = _yahoo(sorted(need), start, today)
    data = {t: {d: v for d, v in m.items() if d >= starts[t]} for t, m in data.items()}
    created, updated, warn = 0, 0, []
    new = []
    for t, m in data.items():
        # A split or a different price basis shows up as a jump against the stored closes.
        # Yahoo restates history after a split; the stored shares and closes stay on the
        # basis they were entered in. A clean split ratio is scaled back to that basis.
        overlap = [(have[t][d].close, c) for d, (c, _) in m.items() if d in have[t]]
        if overlap:
            ratio = sorted(a / b for a, b in overlap)[len(overlap) // 2]
            if abs(ratio - 1) > 0.02:
                big = ratio if ratio > 1 else 1 / ratio
                if abs(big - round(big)) < 0.02 * big:
                    f = round(big) if ratio > 1 else 1 / round(big)
                    m = {d: (c * f, dv * f) for d, (c, dv) in m.items()}
                    warn.append(f"{t}: split detectado (fator {ratio:.3f}); preços do Yahoo ajustados para a base já gravada.")
                else:
                    warn.append(f"{t}: preço do Yahoo difere do gravado (razão {ratio:.3f}); não atualizado.")
                    continue
        for d, (c, dv) in m.items():
            p = have[t].get(d)
            if p is None:
                new.append(UtmPrice(date=d, ticker=t, close=c, dividend=dv, source='yahoo'))
            elif p.source == 'yahoo' and (abs(p.close - c) > 1e-9 or abs(p.dividend - dv) > 1e-9):
                p.close, p.dividend = c, dv
                p.save(update_fields=['close', 'dividend'])
                updated += 1
    UtmPrice.objects.bulk_create(new, batch_size=2000)
    created = len(new)
    missing = sorted(need - set(data))
    if missing:
        warn.append('Sem dados do Yahoo para: ' + ', '.join(missing))
    return {'ok': True, 'created': created, 'updated': updated, 'tickers': sorted(need), 'warnings': warn,
            'last': max((d for m in data.values() for d in m), default=None)}


# ─── Engine ──────────────────────────────────────────────────────────────────
def next_13f(today):
    """Next 13F deadline (45 days after quarter end, rolled to a weekday) and the
    expected rebalance (the next weekday after it — how every past rebalance landed)."""
    def roll(d):
        while d.weekday() >= 5:
            d += dt.timedelta(days=1)
        return d
    cands = []
    for y in (today.year, today.year + 1):
        for qe in (dt.date(y - 1, 12, 31), dt.date(y, 3, 31), dt.date(y, 6, 30), dt.date(y, 9, 30)):
            dl = roll(qe + dt.timedelta(days=45))
            cands.append((dl, qe))
    dl, qe = min((c for c in cands if c[0] >= today), key=lambda c: c[0])
    reb = roll(dl + dt.timedelta(days=1))
    q = (qe.month - 1) // 3 + 1
    return {'deadline': dl.isoformat(), 'quarter': f"{q}T{str(qe.year)[2:]}", 'expected_rebalance': reb.isoformat(),
            'days': (dl - today).days}


def compute(today=None):
    today = today or dt.date.today()
    rbs = list(UtmRebalance.objects.prefetch_related('holdings').order_by('date'))
    if not rbs:
        return None
    baskets = [(rb.date, {h.ticker: h.shares for h in rb.holdings.all()}, rb) for rb in rbs]
    px = defaultdict(dict)
    for d, t, c, v in UtmPrice.objects.values_list('date', 'ticker', 'close', 'dividend'):
        px[t][d] = (c, v)
    days = sorted(d for d in px.get('SPY', {}) if d >= baskets[0][0])
    if len(days) < 2:
        return None
    # A basket entered for a day with no close yet (e.g. typed in the morning of the
    # trade) waits until that close arrives.
    pending = [{'date': d.isoformat(), 'n': len(H), 'tickers': sorted(H), 'source': rb.source}
               for d, H, rb in baskets if d > days[-1]]
    baskets = [b for b in baskets if b[0] <= days[-1]]
    bdates = [b[0] for b in baskets]

    def basket_on(d):   # basket held at the close of d
        k = bisect_right(bdates, d) - 1
        return k

    last_px = {}        # ticker -> (date, close) carried forward
    warnings = set()

    def price(t, d):
        p = px[t].get(d)
        if p:
            last_px[t] = (d, p[0])
            return p[0], p[1]
        lp = last_px.get(t)
        if lp is None:
            return None, 0.0
        if (d - lp[0]).days > 6:
            warnings.add(f"{t} sem preço desde {lp[0].isoformat()} (valor carregado).")
        return lp[1], 0.0

    series = []          # date, utm idx, spy idx, qqq idx, value, flow, n_missing
    idx = {'UTM': 1.0, 'SPY': 1.0, 'QQQ': 1.0}
    prev_close = {}
    name_ret = defaultdict(dict)       # ticker -> {date: daily TR} while held
    name_contrib = defaultdict(float)  # ticker -> sum of w_{t-1} * r_t
    prev_vals = None
    for i, d in enumerate(days):
        k = basket_on(d)
        H = baskets[k][1]
        closes = {}
        for t in set(H) | (set(baskets[basket_on(days[i - 1])][1]) if i else set()) | set(BENCH):
            c, dv = price(t, d)
            if c is not None:
                closes[t] = (c, dv)
        if i == 0:
            V = sum(H[t] * closes[t][0] for t in H if t in closes)
            flow = 0.0
        else:
            Hp = baskets[basket_on(days[i - 1])][1]
            v0 = sum(Hp[t] * prev_close[t] for t in Hp if t in prev_close)
            v1 = sum(Hp[t] * (closes[t][0] + closes[t][1]) for t in Hp if t in closes)
            r = v1 / v0 - 1 if v0 else 0.0
            idx['UTM'] *= 1 + r
            for t in Hp:
                if t in prev_close and t in closes and prev_close[t]:
                    rt = (closes[t][0] + closes[t][1]) / prev_close[t] - 1
                    name_ret[t][d] = rt
                    name_contrib[t] += (Hp[t] * prev_close[t] / v0) * rt if v0 else 0
            for b in BENCH:
                if b in prev_close and b in closes:
                    idx[b] *= (closes[b][0] + closes[b][1]) / prev_close[b]
            V = sum(H[t] * closes[t][0] for t in H if t in closes)
            flow = V - sum(Hp[t] * closes[t][0] for t in Hp if t in closes)
        prev_close = {t: c for t, (c, _) in closes.items()}
        series.append([d.isoformat(), idx['UTM'], idx['SPY'], idx['QQQ'], V, flow])

    pos = {s[0]: j for j, s in enumerate(series)}
    asof = days[-1]

    def idx_at(dstr, col=1):
        return series[pos[dstr]][col]

    # Rebalances: what changed, the flow, and how the basket did until the next one.
    majors = major_rebalances(baskets)
    rebal_out = []
    for mi, k in enumerate(majors):
        d, H, rb = baskets[k]
        ds = d.isoformat()
        if ds not in pos:
            continue
        j = pos[ds]
        k_next = majors[mi + 1] if mi + 1 < len(majors) else None
        end = baskets[k_next][0].isoformat() if k_next is not None else asof.isoformat()
        if end not in pos:
            end = asof.isoformat()
        # Follow-up trades folded into this rebalance (same names, days later).
        members = list(range(k, k_next if k_next is not None else len(baskets)))
        H = baskets[members[-1]][1]
        prevH = baskets[k - 1][1] if k else {}
        ins = sorted(set(H) - set(prevH)) if k else sorted(H)
        outs = sorted(set(prevH) - set(H))
        added = sorted(t for t in H if t in prevH and H[t] > prevH[t] + 1e-9)
        trimmed = sorted(t for t in H if t in prevH and H[t] < prevH[t] - 1e-9)
        flow = sum(series[pos[baskets[m][0].isoformat()]][5] for m in members if baskets[m][0].isoformat() in pos) if k else None
        V_after = series[j][4] + (flow - series[j][5] if k else 0)
        v_before = series[j][4] - series[j][5] if k else None
        fpct = flow / v_before if flow is not None and v_before else None

        def tr(t, a, b):
            m = name_ret.get(t, {})
            g, n = 1.0, 0
            for s in series[pos[a] + 1: pos[b] + 1]:
                r = m.get(dt.date.fromisoformat(s[0]))
                if r is not None:
                    g *= 1 + r
                    n += 1
            return g - 1 if n else None

        def px_ret(t, a, b):   # for names no longer held: close-to-close + dividends, if priced
            pa = px[t].get(dt.date.fromisoformat(a))
            if not pa:
                return None
            g, last = 1.0, pa[0]
            for s in series[pos[a] + 1: pos[b] + 1]:
                p = px[t].get(dt.date.fromisoformat(s[0]))
                if p:
                    g *= (p[0] + p[1]) / last
                    last = p[0]
            pb = px[t].get(dt.date.fromisoformat(b))
            return g - 1 if pb else None

        names = {t: tr(t, ds, end) for t in H}
        out_ret = {t: px_ret(t, ds, end) for t in outs}
        priced = [(t, r) for t, r in names.items() if r is not None]
        best = max(priced, key=lambda x: x[1]) if priced else None
        worst = min(priced, key=lambda x: x[1]) if priced else None
        in_r = [names[t] for t in ins if names.get(t) is not None] if k else []
        out_r = [r for r in out_ret.values() if r is not None]
        sig = None
        if k:
            sig = 'Aporte' if fpct is not None and fpct > REBAL_SIGNAL else 'Resgate' if fpct is not None and fpct < -REBAL_SIGNAL else 'Rotação'
        rebal_out.append({
            'date': ds, 'end': end, 'current': mi == len(majors) - 1, 'n': len(H), 'source': rb.source, 'note': rb.note,
            'ins': ins if k else [], 'outs': outs, 'added': added, 'trimmed': trimmed,
            'value_after': V_after, 'value_before': v_before, 'flow': flow, 'flow_pct': fpct, 'signal': sig if k else 'Início',
            'ret': idx_at(end) / idx_at(ds) - 1, 'spy': idx_at(end, 2) / idx_at(ds, 2) - 1, 'qqq': idx_at(end, 3) / idx_at(ds, 3) - 1,
            'best': best, 'worst': worst, 'names': names,
            'in_avg': sum(in_r) / len(in_r) if in_r else None,
            'out_avg': sum(out_r) / len(out_r) if len(out_r) == len(outs) and out_r else None,
            'out_ret': out_ret,
        })

    # Current basket: return since the rebalance and today's weight.
    d0 = baskets[majors[-1]][0]
    H = baskets[-1][1]
    d0s = d0.isoformat()
    cur = []
    if d0s in pos:
        last_cl = {}
        for t in H:
            dd = max((x for x in px[t] if x <= asof), default=None)
            last_cl[t] = (dd, px[t][dd][0]) if dd else (None, None)
        V = sum(H[t] * (last_cl[t][1] or 0) for t in H)
        V0 = sum(H[t] * (px[t].get(d0, (0, 0))[0]) for t in H)
        prev_day = days[-2] if len(days) > 1 else None
        for t in H:
            dd, c = last_cl[t]
            p0 = px[t].get(d0, (None, 0))[0]
            divs = sum(v for x, (_, v) in px[t].items() if d0 < x <= asof)
            r = None
            m = name_ret.get(t, {})
            g = 1.0
            for s in series[pos[d0s] + 1:]:
                rr = m.get(dt.date.fromisoformat(s[0]))
                if rr is not None:
                    g *= 1 + rr
            r = g - 1
            r1 = m.get(asof)
            cur.append({
                't': t, 'shares': H[t], 'px_reb': p0, 'px': c, 'px_date': dd.isoformat() if dd else None,
                'ret': r, 'ret_px': (c / p0 - 1) if c and p0 else None, 'divs': divs, 'r1d': r1,
                'mv': H[t] * (c or 0), 'w': H[t] * (c or 0) / V if V else None,
                'w_reb': H[t] * (p0 or 0) / V0 if V0 else None,
                'contrib': (H[t] * (p0 or 0) / V0) * r if V0 and r is not None else None,
            })
        cur.sort(key=lambda x: -(x['w'] or 0))

    # Every name ever held: how long, and what it did while held.
    tick_periods = defaultdict(list)
    for k in majors:
        for t in baskets[k][1]:
            tick_periods[t].append(k)
    names_out = []
    for t, ks in tick_periods.items():
        m = name_ret.get(t, {})
        g = 1.0
        for r in m.values():
            g *= 1 + r
        names_out.append({
            't': t, 'n': len(ks), 'first': baskets[ks[0]][0].isoformat(),
            'last': (baskets[majors[majors.index(ks[-1]) + 1]][0].isoformat() if ks[-1] != majors[-1] else None),
            'held': ks[-1] == majors[-1], 'ret': g - 1 if m else None, 'contrib': name_contrib.get(t, 0.0),
            'periods': [baskets[k][0].isoformat() for k in ks],
        })
    names_out.sort(key=lambda x: (-x['n'], -(x['contrib'] or 0)))

    last_spy = max(px['SPY'])
    stale = (today - last_spy).days > (3 if today.weekday() == 0 else 1)
    return {
        'asof': asof.isoformat(), 'today': today.isoformat(), 'stale': stale,
        'inception': days[0].isoformat(),
        'last_excel': UtmPrice.objects.filter(source='excel').order_by('-date').values_list('date', flat=True).first(),
        'series': [[s[0], round(s[1], 8), round(s[2], 8), round(s[3], 8), round(s[4], 2)] for s in series],
        'holdings': cur, 'rebalance': d0s, 'value': series[-1][4],
        'rebalances': rebal_out, 'names': names_out,
        'next13f': next_13f(today), 'pending': pending,
        'warnings': sorted(warnings),
    }

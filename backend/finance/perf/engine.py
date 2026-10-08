"""
IGF TR performance engine.

Builds, from data already in the database:
  * per-asset daily positions and P&L
      - up to FundConfig.perf_cutover_date: bloomberg.PositionSnapshot (old CS/Bloomberg history)
      - after it: cutover holdings + bank statement trades (trade date) + ManualLedgerEntry,
        priced with the Bloomberg Portfolio snapshots (finance.PortfolioItem), using for each
        business day the snapshot taken after the US close
  * the lead-series cota, daily
      - official daily cota (NAVPosition) while it exists, then estimated from per-asset P&L net
        of a daily management-fee accrual and a performance-fee provision above the high-water mark
      - re-scaled every month so that each month-end lands exactly on the administrator's cota
  * per-asset returns (TWR), P&L, contribution, attribution by class, benchmarks
  * reconciliation checks against the administrator report (quantities, bank cash, monthly return)

compute() returns (payload_dict, frames). The payload is what the Performance page renders and is
cached in PerformanceRun; frames feed the Excel export.
"""
import datetime as dt
import math

import numpy as np
import pandas as pd

from .statement import AliasMatcher, dealing_date
from .admin_report import lead_month_ends

FUND_POSITION_NAME = 'TOTAL RETURN'       # bloomberg.PositionSnapshot.fund icontains
NAV_FUND_NAME = 'IGFWM TOTAL RETURN'
MGMT_FEE = 0.01
PERF_FEE = 0.10
INCOME_TYPES = ('DIVIDEND', 'COUPON', 'REDEMPTION', 'AMORTIZATION')
TRADE_TYPES = ('BUY', 'SELL')
OTHER_PNL_TYPES = ('EXPENSE', 'BANK_FEE', 'BANK_INTEREST', 'OTHER_INCOME')
FEE_TYPES = ('MGMT_FEE', 'MGMT_PERF_FEE')
MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']


# ───────────────────────────────────────────────────────────── helpers
def _clean(v):
    if v is None:
        return None
    if isinstance(v, (float, np.floating)):
        return None if (math.isnan(v) or math.isinf(v)) else round(float(v), 6)
    if isinstance(v, (np.integer,)):
        return int(v)
    if isinstance(v, pd.Timestamp):
        return v.strftime('%Y-%m-%d')
    if isinstance(v, dt.date):
        return v.isoformat()
    return v


def bucket_of(cls, sub):
    if cls == 'Equity':
        return 'Ações individuais' if sub == 'Stock' else 'ETFs de ações'
    if sub in ('HY ETF', 'IG ETF'):
        return 'ETFs de crédito'
    if sub == 'US Treasury':
        return 'Treasuries'
    if cls == 'Fixed Income':
        return 'Bonds (crédito)'
    return 'Outros'


# ───────────────────────────────────────────────────────────── loading
def load_inputs(today=None):
    from finance.models import (AssetAlias, BankTransaction, ManualLedgerEntry, AdminNAVReport, FundConfig,
                                NAVPosition, PortfolioItem, HistIndexPrice)
    from bloomberg.models import PositionSnapshot

    cfg = FundConfig.get_solo()
    aliases = list(AssetAlias.objects.values())
    matcher = AliasMatcher(aliases)
    cutover = cfg.perf_cutover_date or dt.date(2026, 3, 24)

    ps = pd.DataFrame(list(PositionSnapshot.objects.filter(fund__icontains=FUND_POSITION_NAME, date__lte=cutover).values(
        'date', 'asset_group', 'asset_ticker', 'units_close', 'amount_open', 'amount_close', 'amount_transaction',
        'pnl_dividend', 'pnl_total', 'price_close', 'avg_cost')))
    if not ps.empty:
        ps['asset_id'] = [matcher.from_ticker(t) or t for t in ps.asset_ticker]

    tx = pd.DataFrame(list(BankTransaction.objects.values()))
    if not tx.empty:
        tx['type'] = np.where(tx.type_override.astype(str) != '', tx.type_override, tx.type)
        tx['source'] = 'Extrato'
    man = pd.DataFrame(list(ManualLedgerEntry.objects.values()))
    if not man.empty:
        man = man.assign(is_reversal=False, source='Ajuste manual', counterparty='', desc1=man.note, desc2='', txn_no='',
                         booking_date=man.trade_date, value_date=man.trade_date, price=None, accrued=None)
    led = pd.concat([d for d in (tx, man) if not d.empty], ignore_index=True) if (not tx.empty or not man.empty) else pd.DataFrame(
        columns=['trade_date', 'type', 'asset_id', 'units', 'amount', 'is_reversal', 'source', 'counterparty', 'desc1', 'desc2', 'txn_no', 'booking_date'])
    led['asset_id'] = led['asset_id'].fillna('').astype(str)
    led['units'] = led['units'].fillna(0.0).astype(float)
    led['amount'] = led['amount'].astype(float)

    items = pd.DataFrame(list(PortfolioItem.objects.filter(snapshot__isnull=False).values(
        'snapshot_id', 'snapshot__created_at', 'ticker', 'quantity', 'market_value', 'isin')))
    if not items.empty:
        items = items.rename(columns={'snapshot__created_at': 'ts'})
        tmap = {(t, i): matcher.from_ticker(t) or matcher.from_isin(i) for t, i in set(zip(items.ticker, items['isin']))}
        items['asset_id'] = [tmap[(t, i)] for t, i in zip(items.ticker, items['isin'])]

    off = pd.DataFrame(list(NAVPosition.objects.filter(fund__icontains=NAV_FUND_NAME, nav_per_share__isnull=False).values(
        'date', 'nav', 'shares', 'nav_per_share', 'subscription_d0', 'redemption_d0')))
    if not off.empty:
        off = off.drop_duplicates('date', keep='last').set_index('date').sort_index()

    reps = [dict(date=r.date, lead_cota=r.lead_cota, lead_table=r.lead_table, series=r.series, holdings=r.holdings,
                 total_shares=r.total_shares, nav_closing=r.nav_closing, prev_nav_closing=r.prev_nav_closing,
                 subscriptions=r.subscriptions, prev_subscriptions=r.prev_subscriptions, nav=r.nav, mgmt_fee=r.mgmt_fee,
                 perf_fee=r.perf_fee, total_assets=r.total_assets, file_name=r.file_name)
            for r in AdminNAVReport.objects.order_by('date')]

    idx = pd.DataFrame(list(HistIndexPrice.objects.filter(
        asset__in=['SPX Index', 'CCMP Index', 'BTSISOFR Index', 'SOFRRATE Index'], flt_value__isnull=False).values('date', 'asset', 'flt_value')))

    return dict(cfg=cfg, aliases=aliases, matcher=matcher, cutover=cutover, ps=ps, led=led, items=items, off=off,
                reps=reps, idx=idx, today=today or dt.date.today())


# ───────────────────────────────────────────────────────────── prices
def snapshot_prices(items):
    """Unit value (USD) per asset per business day, from the snapshot that best reflects that day's close.
    >= 20:05 UTC -> that day's close; < 13:30 UTC -> previous business day's close; otherwise intraday."""
    if items.empty:
        return pd.DataFrame(), pd.Series(dtype=object)
    it = items[items.asset_id.notna()].copy()
    it['ts'] = pd.to_datetime(it.ts, utc=True)
    snaps = it.groupby('snapshot_id').agg(ts=('ts', 'first'), n=('ticker', 'size'), mv=('market_value', 'sum')).reset_index()
    snaps = snaps[(snaps.n >= 10) & (snaps.mv > 1e6)]
    if snaps.empty:
        return pd.DataFrame(), pd.Series(dtype=object)
    hm = snaps.ts.dt.hour * 60 + snaps.ts.dt.minute
    day = snaps.ts.dt.tz_convert(None).dt.normalize()
    snaps['kind'] = np.where(hm >= 20 * 60 + 5, 'close', np.where(hm < 13 * 60 + 30, 'preopen', 'intraday'))
    snaps['px_date'] = pd.to_datetime(np.where(snaps.kind == 'preopen', day - pd.offsets.BDay(1), day)).date
    snaps['rk'] = snaps.kind.map({'close': 0, 'preopen': 1, 'intraday': 2})
    snaps['tsn'] = np.where(snaps.kind == 'preopen', snaps.ts.astype('int64'), -snaps.ts.astype('int64'))
    best = snaps.sort_values(['px_date', 'rk', 'tsn']).groupby('px_date').head(1).set_index('snapshot_id')
    x = it[it.snapshot_id.isin(best.index) & (it.quantity.abs() > 0) & it.market_value.notna()].copy()
    x['px_date'] = x.snapshot_id.map(best.px_date)
    x['uv'] = x.market_value / x.quantity
    uv = x.groupby(['px_date', 'asset_id']).uv.last().unstack().sort_index()
    for c in uv.columns:                                     # feed glitches (e.g. LSE ETF quoted in pence)
        s = uv[c]
        med = s.rolling(5, center=True, min_periods=3).median()
        uv.loc[(s / med - 1).abs() > 0.25, c] = np.nan
    return uv, best.set_index('px_date').kind


# ───────────────────────────────────────────────────────────── positions & P&L
def period_a(ps):
    if ps.empty:
        return pd.DataFrame()
    x = ps[ps.asset_group != 'Cash']
    g = x.groupby(['date', 'asset_id']).agg(units=('units_close', 'sum'), mv_open=('amount_open', 'sum'),
                                             mv_close=('amount_close', 'sum'), net_invested=('amount_transaction', 'sum'),
                                             income=('pnl_dividend', 'sum'), pnl=('pnl_total', 'sum'),
                                             price=('price_close', 'last')).reset_index()
    g['price'] = np.where(g.units.abs() > 0, g.mv_close / g.units.replace(0, np.nan), g.price)
    g['source'] = 'Histórico CS/Bloomberg'
    return g


def period_b(I, uv_site):
    ps, led, cutover, today = I['ps'], I['led'], I['cutover'], I['today']
    days = list(pd.bdate_range(cutover, today).date)
    h0 = ps[(ps.date == cutover) & (ps.asset_group != 'Cash')].groupby('asset_id').units_close.sum() if not ps.empty else pd.Series(dtype=float)
    avg0 = ps[(ps.date == cutover)].groupby('asset_id').avg_cost.last() if not ps.empty else pd.Series(dtype=float)
    post = led[(pd.to_datetime(led.trade_date).dt.date > cutover)].copy()
    post['trade_date'] = pd.to_datetime(post.trade_date).dt.date
    post = post[post.trade_date <= today]
    trades = post[post.type.isin(TRADE_TYPES + ('REDEMPTION',)) & (post.asset_id != '')]
    income = post[post.type.isin(INCOME_TYPES) & (post.asset_id != '')]
    assets = sorted(set(h0[h0.abs() > 0].index) | set(trades.asset_id) | set(income.asset_id))
    if not assets:
        return pd.DataFrame(), {}, []

    # quantities, with sells/redemptions clamped at the position (a bond sold at original face after
    # amortisations, or a maturity booked for the full face, closes the position)
    unit_flow = trades.groupby(['trade_date', 'asset_id']).units.sum()
    q_rows, cur = [], {a: float(h0.get(a, 0.0)) for a in assets}
    warnings = []
    for d in days:
        if d > cutover:
            for a in assets:
                u = float(unit_flow.get((d, a), 0.0))
                if u:
                    new = cur[a] + u
                    if u < 0 and new < -1e-6 and cur[a] > 0:
                        new = 0.0
                    elif new < -1e-6:
                        warnings.append(f'{a}: venda em {d:%d/%m/%Y} sem posição suficiente')
                    cur[a] = new
        q_rows.append(dict(cur))
    q = pd.DataFrame(q_rows, index=days)[assets]
    q[q.abs() < 1e-6] = 0.0

    ex = trades[trades.type.isin(TRADE_TYPES) & (trades.units != 0) & (~trades.is_reversal.astype(bool))].copy()
    ex['px'] = (-ex.amount / ex.units).abs()
    ex_px = ex.groupby(['trade_date', 'asset_id']).px.mean().unstack()
    uv = uv_site.reindex(columns=assets) if not uv_site.empty else pd.DataFrame(columns=assets)
    if not ps.empty:
        old = ps[ps.date == cutover].assign(uv=lambda d: d.amount_close / d.units_close.replace(0, np.nan)).groupby('asset_id').uv.last()
        if cutover not in uv.index or uv.loc[cutover].isna().all():
            uv.loc[cutover] = old.reindex(assets)
    uv = uv.combine_first(ex_px.reindex(columns=assets)) if not ex_px.empty else uv
    uv = uv.reindex(sorted(set(uv.index) | set(days))).ffill().bfill().reindex(days)
    mv = (q * uv).fillna(0.0)
    cash = trades[trades.type.isin(TRADE_TYPES)].groupby(['trade_date', 'asset_id']).amount.sum().unstack()
    net_inv = (-cash).reindex(index=days, columns=assets).fillna(0.0)
    inc = income.groupby(['trade_date', 'asset_id']).amount.sum().unstack().reindex(index=days, columns=assets).fillna(0.0)
    mv_open = mv.shift(1)
    mv_open.iloc[0] = mv.iloc[0]
    pnl = mv - mv_open - net_inv + inc
    long = pd.concat([fr.stack(future_stack=True).rename(n) for fr, n in ((q, 'units'), (uv, 'price'), (mv, 'mv_close'), (mv_open, 'mv_open'),
                                                               (net_inv, 'net_invested'), (inc, 'income'), (pnl, 'pnl'))], axis=1).reset_index()
    long.columns = ['date', 'asset_id'] + list(long.columns[2:])
    long = long[(long.date > cutover) & ((long.mv_close.abs() > 0) | (long.mv_open.abs() > 0) | (long.net_invested != 0) | (long.income != 0))]
    long['source'] = 'Extrato + preços Bloomberg'

    # average cost rolled forward from the cutover (buys update, sells keep)
    avg = {a: (float(avg0[a]) if a in avg0.index and pd.notna(avg0[a]) else np.nan) for a in assets}
    held = {a: float(h0.get(a, 0.0)) for a in assets}
    for _, t in ex.sort_values('trade_date').iterrows():
        a = t.asset_id
        if t.units > 0:
            base = (avg[a] if not np.isnan(avg[a]) else 0.0) * max(held[a], 0.0)
            held[a] += t.units
            avg[a] = (base - t.amount) / held[a] if held[a] else np.nan
        else:
            held[a] = max(0.0, held[a] + t.units)
    return long, avg, warnings


# ───────────────────────────────────────────────────────────── fund cota
def engine_returns(nav0, cota0, pnl_by_day, other_by_day, subs_by_deal, start, end, hwm):
    days = list(pd.bdate_range(start, end).date)
    nav, cota, prov = nav0, cota0, 0.0
    prev = start - dt.timedelta(days=1)
    while prev.weekday() >= 5:
        prev -= dt.timedelta(days=1)
    rows = []
    for d in days:
        g = float(pnl_by_day.get(d, 0.0)) + float(other_by_day.get(d, 0.0))
        mg = nav * MGMT_FEE * (d - prev).days / 365.0
        pre = nav + g - mg + prov
        c_pre = cota * pre / nav
        prov_new = (c_pre - hwm) / c_pre * pre * PERF_FEE if c_pre > hwm else 0.0
        post = pre - prov_new
        r = post / nav - 1
        cota *= 1 + r
        flow = float(subs_by_deal.get(d, 0.0))
        nav = post + flow
        rows.append(dict(date=d, ret=r, gross_pnl=g, mgmt_fee=mg, perf_provision=prov_new))
        prov, prev = prov_new, d
    return pd.DataFrame(rows).set_index('date') if rows else pd.DataFrame(columns=['ret'])


def anchored(daily_ret, anchors):
    r = daily_ret.sort_index()
    out, adj = {}, []
    a_dates = sorted(anchors.index)
    out[a_dates[0]] = anchors[a_dates[0]]
    for i, a0 in enumerate(a_dates):
        a1 = a_dates[i + 1] if i + 1 < len(a_dates) else None
        seg = r[(r.index > a0) & ((r.index <= a1) if a1 else True)]
        if seg.empty:
            continue
        c = (1 + seg.fillna(0)).cumprod()
        base = anchors[a0]
        if a1 is not None and a1 in c.index:
            k = (anchors[a1] / base) / c.iloc[-1]
            tau = np.arange(1, len(c) + 1) / len(c)
            path = base * c.values * k ** tau
            adj.append(dict(month_end=a1, est=float(c.iloc[-1] - 1), off=float(anchors[a1] / base - 1),
                            bps=float((c.iloc[-1] - anchors[a1] / base) * 1e4)))
        else:
            path = base * c.values
        out.update(dict(zip(c.index, path)))
    return pd.Series(out).sort_index(), adj


def hwm_from(anchors, cfg_hwm):
    """High-water mark = max(config, lead cota at every past crystallisation month-end: May and November)."""
    h = cfg_hwm or 0.0
    for d, v in anchors.items():
        if d.month in (5, 11) and v:
            h = max(h, float(v))
    return h


# ───────────────────────────────────────────────────────────── main
def compute(today=None):
    I = load_inputs(today)
    cfg, off, reps, led, today = I['cfg'], I['off'], I['reps'], I['led'], I['today']
    if off.empty:
        raise ValueError('Sem histórico oficial de cota (NAVPosition) — nada a calcular.')

    uv_site, kinds = snapshot_prices(I['items'])
    pa = period_a(I['ps'])
    pb, avg_cost, warnings = period_b(I, uv_site)
    pab = pd.concat([d for d in (pa, pb) if not d.empty], ignore_index=True)
    pab['date'] = pd.to_datetime(pab.date)
    info = {a['asset_id']: a for a in I['aliases']}
    pab['bucket'] = [bucket_of(info.get(a, {}).get('asset_class', 'Other'), info.get(a, {}).get('sub_class', '')) for a in pab.asset_id]

    # ── subscriptions: administrator figures where a report exists, otherwise bank receipts by dealing date
    subs = led[led.type == 'SUBSCRIPTION'].copy()
    subs['dealing'] = [dealing_date(d) for d in subs.trade_date]
    bank_subs = subs.groupby('dealing').amount.sum()
    admin_subs = {}
    for rep in reps:
        if rep.get('subscriptions') is not None:
            admin_subs[rep['date']] = rep['subscriptions'] or 0.0
        if rep.get('prev_subscriptions') is not None:
            pme = (pd.Timestamp(rep['date']) - pd.offsets.BMonthEnd(1)).date()
            admin_subs.setdefault(pme, rep['prev_subscriptions'] or 0.0)
    subs_by_deal = dict(bank_subs)
    subs_by_deal.update({d: v for d, v in admin_subs.items() if v})

    # ── anchors: official month-ends (NAVPosition before the admin reports, admin lead series after)
    o = off[off.index >= off.index.min()]
    o_ret = (o.nav_per_share / o.nav_per_share.shift(1) - 1).dropna()
    last_off = o.index.max()
    adm_me = lead_month_ends(reps)
    first_adm = min(adm_me) if adm_me else None
    me = o.groupby(pd.to_datetime(o.index).to_period('M')).nav_per_share.last()
    me_dates = [max(d for d in o.index if pd.Timestamp(d).to_period('M') == p) for p in me.index]
    anchors = pd.Series(me.values, index=me_dates)
    if first_adm:
        anchors = anchors[anchors.index < first_adm]
        anchors = pd.concat([anchors, pd.Series(adm_me)])
    anchors = pd.concat([pd.Series({o.index.min(): float(o.nav_per_share.iloc[0])}), anchors])
    anchors = anchors[~anchors.index.duplicated(keep='last')].sort_index()
    hwm = hwm_from({d: v for d, v in anchors.items()}, cfg.high_water_mark)

    pnl_day = pab.groupby(pab.date.dt.date).pnl.sum()
    other = led[led.type.isin(OTHER_PNL_TYPES)].copy()
    other_day = other.groupby(pd.to_datetime(other.trade_date).dt.date).amount.sum() if not other.empty else pd.Series(dtype=float)
    eng = engine_returns(float(o.nav.iloc[-1]), float(o.nav_per_share.iloc[-1]), pnl_day, other_day, subs_by_deal,
                         last_off + dt.timedelta(days=1), today, hwm)
    daily_ret = pd.concat([o_ret, eng.ret]) if not eng.empty else o_ret
    daily_ret = daily_ret[~daily_ret.index.duplicated(keep='first')]
    cota, adj = anchored(daily_ret, anchors)
    f = pd.DataFrame({'cota': cota})
    f['estimated'] = [d > max(anchors.index) for d in f.index]
    f['official_daily'] = [d <= last_off for d in f.index]

    # shares and NAV: official daily while it exists, then admin month-end totals, then carried + subscriptions
    rep_by_date = {r['date']: r for r in reps}
    shares, navs, sub_col = [], [], []
    sh = float(o.shares.iloc[-1]); nav_base_d, nav_base = last_off, float(o.nav.iloc[-1])
    for d in f.index:
        if d <= last_off:
            shares.append(float(o.shares.get(d, np.nan))); navs.append(float(o.nav.get(d, np.nan)))
            sub_col.append(float(o.subscription_d0.get(d) or 0.0))
            continue
        flow = float(subs_by_deal.get(d, 0.0))
        rep = rep_by_date.get(d)
        prev_c = f.cota.loc[:d].iloc[-2] if len(f.cota.loc[:d]) > 1 else f.cota[d]
        if rep and rep.get('total_shares'):
            sh = float(rep['total_shares'])
        elif flow:
            sh += flow / prev_c
        nav_est = nav_base * f.cota[d] / f.cota[nav_base_d] + 0.0
        if rep and rep.get('nav_closing'):
            nav_d = float(rep['nav_closing'])
        else:
            nav_d = nav_est + flow
        if flow or rep:
            nav_base_d, nav_base = d, nav_d
        shares.append(sh); navs.append(nav_d); sub_col.append(flow)
    f['shares'], f['nav'], f['subscription'] = shares, navs, sub_col
    f.index = pd.to_datetime(f.index)

    # ── per-asset analytics
    nav_prev = f.nav.shift(1)
    pab['contrib'] = pab.pnl / pab.date.map(nav_prev)
    den = pab.mv_open.fillna(0) + pab.net_invested.clip(lower=0).fillna(0)
    pab['ret'] = np.where(den > 1000, pab.pnl / den.replace(0, np.nan), 0.0)
    pab['ret'] = pab.ret.clip(-0.5, 0.5).fillna(0.0)

    bm = benchmarks(I['idx'], pab, f.index.min(), f.index.max())
    payload, frames = build_payload(I, f, pab, bm, anchors, adj, eng, subs, subs_by_deal, avg_cost, kinds, hwm, warnings)
    return payload, frames


def benchmarks(idx, pab, start, end):
    days = pd.bdate_range(start, end)
    out = {}
    if idx.empty:
        return pd.DataFrame(index=days)
    idx = idx.copy(); idx['date'] = pd.to_datetime(idx.date)
    for name, code, etf in [('S&P 500', 'SPX Index', 'SPY'), ('Nasdaq Composite', 'CCMP Index', 'QQQ')]:
        a = idx[idx.asset == code].drop_duplicates('date').set_index('date').flt_value.sort_index()
        if a.empty:
            continue
        last = a.index.max()
        a = a.reindex(days.union(a.index)).ffill().reindex(days)
        e = pab[pab.asset_id == etf].drop_duplicates('date', keep='last').set_index('date').price.sort_index()
        if not e.empty:
            e = e.reindex(days.union(e.index)).ffill().reindex(days)
            after = e[e.index > last]
            if len(after) and last in e.index and pd.notna(e[last]):
                a.loc[after.index] = a[last] * after / e[last]
        out[name] = a
    s = idx[idx.asset == 'BTSISOFR Index'].drop_duplicates('date').set_index('date').flt_value.sort_index()
    r = idx[idx.asset == 'SOFRRATE Index'].drop_duplicates('date').set_index('date').flt_value.sort_index()
    if not s.empty:
        last = s.index.max(); rate = (r.iloc[-1] / 100) if not r.empty else 0.04
        s = s.reindex(days.union(s.index)).ffill().reindex(days)
        for d in s.index[s.index > last]:
            s[d] = s[last] * (1 + rate) ** ((d - last).days / 360)
        out['SOFR (caixa USD)'] = s
    return pd.DataFrame(out, index=days)


def _twr(r):
    return float((1 + r).prod() - 1) if len(r) else None


def sleeve(pab, mask):
    g = pab[mask].groupby('date').agg(pnl=('pnl', 'sum'), mo=('mv_open', 'sum'), ni=('net_invested', lambda s: s.clip(lower=0).sum()))
    den = g.mo + g.ni
    return (g.pnl / den.where(den > 1000)).fillna(0).clip(-0.2, 0.2)


def build_payload(I, f, pab, bm, anchors, adj, eng, subs, subs_by_deal, avg_cost, kinds, hwm, warnings):
    today = f.index.max()
    s = f.cota
    ye = pd.Timestamp(today.year - 1, 12, 31)
    base_ytd = s[s.index <= ye].iloc[-1] if (s.index <= ye).any() else s.iloc[0]
    base_mtd = s[s.index < today.replace(day=1)].iloc[-1]
    base_12m = s[s.index <= today - pd.DateOffset(years=1)]
    r = s.pct_change().dropna()
    years = (s.index[-1] - s.index[0]).days / 365.25
    dd = s / s.cummax() - 1
    kpi = dict(cota=float(s.iloc[-1]), date=today, mtd=float(s.iloc[-1] / base_mtd - 1), ytd=float(s.iloc[-1] / base_ytd - 1),
               m12=float(s.iloc[-1] / base_12m.iloc[-1] - 1) if len(base_12m) else None, itd=float(s.iloc[-1] / s.iloc[0] - 1),
               ann=float((s.iloc[-1] / s.iloc[0]) ** (1 / years) - 1) if years > 0.5 else None, vol=float(r.std() * np.sqrt(252)),
               maxdd=float(dd.min()), maxdd_date=dd.idxmin(), nav=float(f.nav.iloc[-1]), shares=float(f.shares.iloc[-1]),
               hwm=hwm, inception=s.index[0])
    official_last = max(anchors.index)

    # monthly table
    me = s.resample('ME').last()
    mr = me.pct_change().iloc[1:]
    sleeves = pd.DataFrame({
        'Livro de ações': sleeve(pab, pab.bucket.isin(['Ações individuais', 'ETFs de ações'])),
        'Ações individuais': sleeve(pab, pab.bucket == 'Ações individuais'),
        'Crédito': sleeve(pab, pab.bucket.isin(['ETFs de crédito', 'Bonds (crédito)'])),
    })
    months = []
    for p, v in mr.items():
        row = {'m': p.strftime('%Y-%m'), 'Fundo': v}
        for name in bm.columns:
            b = bm[name]
            e1 = b[b.index <= p].dropna(); e0 = b[b.index <= p - pd.offsets.MonthEnd(1)].dropna()
            row[name] = float(e1.iloc[-1] / e0.iloc[-1] - 1) if len(e1) and len(e0) else None
        for name in sleeves.columns:
            sl = sleeves[name]; sl = sl[(sl.index > p - pd.offsets.MonthEnd(1)) & (sl.index <= p)]
            row[name] = _twr(sl) if len(sl) else None
        months.append(row)

    # per-asset summary
    last_day = pab.date.max()
    ytd0 = ye
    info = {a['asset_id']: a for a in I['aliases']}
    adm_cost = {}
    if I['reps']:
        for h in I['reps'][-1]['holdings']:
            aid = I['matcher'].from_isin(h.get('isin')) if h.get('isin') else None
            if aid and h.get('qty') and h.get('cost') and h['section'] in ('EQUITIES', 'BONDS'):
                adm_cost[aid] = h['cost'] / h['qty']
    spx = bm['S&P 500'] if 'S&P 500' in bm else None

    def spx_ret(a, b):
        if spx is None:
            return None
        x = spx[(spx.index >= a - pd.Timedelta(days=4)) & (spx.index <= b)].dropna()
        return float(x.iloc[-1] / x.iloc[0] - 1) if len(x) > 1 else None

    assets = []
    for a, g in pab.groupby('asset_id'):
        g = g.sort_values('date')
        held = g[(g.mv_close.abs() > 0) | (g.mv_open.abs() > 0)]
        if held.empty:
            continue
        first, last = held.date.min(), held.date.max()
        lr = g[g.date == last_day]
        is_open = len(lr) and abs(float(lr.mv_close.sum())) > 0
        ytd = g[g.date > ytd0]; mtd = g[g.date >= last_day.replace(day=1)]
        m3 = g[g.date > last_day - pd.DateOffset(months=3)]
        ai = info.get(a, {})
        price = float(lr.price.iloc[-1]) if is_open else None
        cost = adm_cost.get(a, avg_cost.get(a) if isinstance(avg_cost, dict) else None)
        cost = None if cost is None or (isinstance(cost, float) and np.isnan(cost)) else cost
        idxs = (1 + g[g.date >= first].ret).cumprod()
        wk = idxs.groupby(g[g.date >= first].date.dt.to_period('W')).last()
        assets.append(dict(
            id=a, name=ai.get('name') or a, bucket=bucket_of(ai.get('asset_class', 'Other'), ai.get('sub_class', '')),
            sector=ai.get('sector') or ai.get('sub_class') or '', status='Em carteira' if is_open else 'Encerrada',
            first=first, last=last, units=float(lr.units.iloc[-1]) if is_open else 0.0, price=price,
            mv=float(lr.mv_close.sum()) if is_open else 0.0, w=float(lr.mv_close.sum()) / kpi['nav'] if is_open else 0.0,
            cost=cost if is_open else None, gain=(price / cost - 1) if is_open and cost and price else None,
            r_mtd=_twr(mtd.ret) if len(mtd) and is_open else None, r_3m=_twr(m3.ret) if len(m3) else None,
            r_ytd=_twr(ytd.ret) if len(ytd[ytd.mv_open.abs() > 0]) else None, r_itd=_twr(g.ret),
            spx_ytd=spx_ret(max(first, ytd0), last), spx_itd=spx_ret(first, last),
            pnl_mtd=float(mtd.pnl.sum()), pnl_ytd=float(ytd.pnl.sum()), pnl_itd=float(g.pnl.sum()), inc=float(g.income.fillna(0).sum()),
            c_ytd=float(ytd.contrib.sum()), c_itd=float(g.contrib.sum()), spark=[float(v) for v in wk.values[-80:]]))
    assets.sort(key=lambda r: (r['status'] != 'Em carteira', -r['mv']))

    # attribution by class
    pab['month'] = pab.date.dt.to_period('M')
    cls = pab.groupby(['month', 'bucket']).contrib.sum().unstack().fillna(0)
    fr = mr.copy(); fr.index = fr.index.to_period('M')
    cls['Cota'] = fr.reindex(cls.index)
    cls['Taxas, caixa e outros'] = cls['Cota'] - cls.drop(columns=['Cota']).sum(axis=1)
    attrib = [dict(m=str(p), **{k: cls.loc[p, k] for k in cls.columns}) for p in cls.index]

    # monthly asset returns (2 last years)
    mret = pab.groupby(['asset_id', 'month']).ret.apply(lambda x: (1 + x).prod() - 1).unstack()
    heldm = pab.assign(h=(pab.mv_open.abs() + pab.mv_close.abs()) > 0).groupby(['asset_id', 'month']).h.any().unstack()
    mret = mret.where(heldm)
    mpnl = pab.groupby(['asset_id', 'month']).pnl.sum().unstack()

    # ── reconciliation checks
    checks = reconcile(I, pab, f, anchors, adj, kinds, warnings, hwm)

    subs_list = (subs.groupby('dealing').agg(v=('amount', 'sum'), o=('counterparty', lambda c: ' + '.join(sorted(set(x for x in c if x)))))
                 .reset_index().rename(columns={'dealing': 'd'}).to_dict('records'))
    flows = sorted(((d, v) for d, v in zip(f.index, f.subscription) if v), key=lambda x: x[0])

    payload = dict(
        asof=today, official_last=official_last, official_cota=float(anchors[official_last]),
        kpi=kpi,
        fund=[[d, c, 1 if e else 0, n] for d, c, e, n in zip(f.index, f.cota, f.estimated, f.nav)],
        bench={k: [v for v in bm[k].reindex(f.index).ffill().values] for k in bm.columns},
        sleeves={k: list((1 + sleeves[k].reindex(f.index).fillna(0)).cumprod().values) for k in sleeves.columns},
        months=months, attrib=attrib, assets=assets,
        subs=[dict(d=d, v=v) for d, v in flows], subs_bank=subs_list,
        engine_check=[a for a in adj if a['month_end'] >= dt.date(2025, 12, 1)],
        checks=checks, hwm=hwm,
        method=dict(cutover=I['cutover'], last_official_daily=f.index[f.official_daily].max() if f.official_daily.any() else None,
                    admin_reports=[r['date'] for r in I['reps']]),
    )
    payload = _jsonify(payload)
    frames = dict(f=f, pab=pab, bm=bm, mret=mret, mpnl=mpnl, cls=cls, led=I['led'], reps=I['reps'], adj=adj, assets=assets, months=months)
    return payload, frames


def reconcile(I, pab, f, anchors, adj, kinds, warnings, hwm):
    checks = []
    def add(status, title, detail, rows=None):
        checks.append(dict(status=status, title=title, detail=detail, rows=rows or []))

    led = I['led']; m = I['matcher']
    # 1. quantities and cash vs every administrator report after the cutover
    for rep in I['reps']:
        d = pd.Timestamp(rep['date'])
        if rep['date'] <= I['cutover']:
            continue
        mine = pab[pab.date == d].groupby('asset_id').agg(units=('units', 'sum'), mv=('mv_close', 'sum'))
        mine = mine[mine.units.abs() > 0]
        adm = {}
        unmapped = []
        for h in rep['holdings']:
            if h['section'] not in ('EQUITIES', 'BONDS'):
                continue
            aid = m.from_isin(h.get('isin'))
            if not aid:
                unmapped.append(h['name']); continue
            a = adm.setdefault(aid, dict(qty=0.0, value=0.0))
            a['qty'] += h.get('qty') or 0.0
            a['value'] += (h.get('value') or 0.0) + (h.get('accrued') or 0.0)
        rows, bad = [], 0
        for aid in sorted(set(adm) | set(mine.index)):
            q1 = float(mine.units.get(aid, 0.0)); q2 = adm.get(aid, {}).get('qty', 0.0)
            ok = abs(q1 - q2) <= 1 or (aid.startswith('ARGENT') and q1 > 0 and q2 > 0)
            bad += 0 if ok else 1
            rows.append(dict(asset=aid, mine=q1, admin=q2, ok=ok, mv=float(mine.mv.get(aid, 0.0)), mv_admin=adm.get(aid, {}).get('value', 0.0)))
        mv1 = sum(r['mv'] for r in rows); mv2 = sum(r['mv_admin'] for r in rows)
        status = 'ok' if bad == 0 and not unmapped else 'warn'
        detail = f"{len(rows) - bad}/{len(rows)} quantidades iguais · valor {mv1/1e6:,.2f} mi vs adm {mv2/1e6:,.2f} mi ({(mv1/mv2-1)*100 if mv2 else 0:+.2f}%)"
        if unmapped:
            detail += ' · sem cadastro: ' + ', '.join(unmapped)
        add(status, f"Posições vs administrador em {rep['date']:%d/%m/%Y}", detail, [r for r in rows if not r['ok']])
        # bank cash (statement balance by booking date) vs the administrator's first bank account
        banks = [h for h in rep['holdings'] if h['section'] == 'BANK ACCOUNTS']
        tx = led[led.source == 'Extrato'] if 'source' in led else led
        if banks and not tx.empty:
            acct_digits = ''.join(ch for ch in str(banks[0]['name']) if ch.isdigit())[:9]
            bal = tx[pd.to_datetime(tx.booking_date).dt.date <= rep['date']].amount.sum()
            adm_bal = banks[0]['value']
            st = 'ok' if abs(bal - adm_bal) < 1 else 'warn'
            add(st, f"Caixa da conta {banks[0]['name']} em {rep['date']:%d/%m/%Y}",
                f"extrato US$ {bal:,.2f} vs administrador US$ {adm_bal:,.2f}" + ('' if st == 'ok' else ' — falta extrato ou há lançamento fora dele'))
    # 2. estimator vs official month
    for a in adj:
        if a['month_end'] < dt.date(2026, 1, 1):
            continue
        crystal = a['month_end'].month in (5, 11) and a['bps'] > 0
        st = 'ok' if abs(a['bps']) <= 25 else ('info' if crystal else 'warn')
        add(st, f"Cota estimada vs oficial — {MESES[a['month_end'].month-1]}/{a['month_end'].year}",
            f"estimado {a['est']*100:+.2f}% · oficial {a['off']*100:+.2f}% · diferença {a['bps']:+.1f} bps"
            + (' (mês de cristalização da taxa de performance)' if crystal else ''))
    # 3. statement rows not mapped to an asset
    um = led[led.type.isin(TRADE_TYPES + INCOME_TYPES) & (led.asset_id == '')]
    if len(um):
        add('error', 'Lançamentos sem ativo cadastrado', f"{len(um)} linha(s) do extrato não casaram com nenhum ativo — cadastre em Asset aliases (Django admin) e recalcule.",
            [dict(date=str(r.trade_date), desc=str(r.desc1)[:90], amount=r.amount) for r in um.itertuples()][:20])
    other = led[led.type == 'OTHER']
    if len(other):
        add('warn', 'Lançamentos não classificados', f"{len(other)} linha(s) com tipo OTHER — confira e defina o tipo no Django admin.",
            [dict(date=str(r.trade_date), desc=str(r.desc1)[:90], amount=r.amount) for r in other.itertuples()][:20])
    # 4. price coverage over the last 30 business days
    last30 = pd.bdate_range(end=I['today'], periods=30).date
    missing = [d for d in last30 if d not in set(kinds.index)]
    intraday = [d for d in last30 if d in kinds.index and kinds.get(d) == 'intraday']
    st = 'ok' if len(missing) <= 2 else 'warn'
    add(st, 'Preços Bloomberg (últimos 30 dias úteis)',
        f"{30-len(missing)}/30 dias com snapshot" + (f" · sem preço: {', '.join(d.strftime('%d/%m') for d in missing[-8:])}" if missing else '') +
        (f" · só intraday: {', '.join(d.strftime('%d/%m') for d in intraday[-5:])}" if intraday else ''))
    # 5. administrator report freshness
    if I['reps']:
        last_rep = I['reps'][-1]['date']
        expected = (pd.Timestamp(I['today']) - pd.offsets.BMonthEnd(1)).date()
        days_late = (I['today'] - expected).days
        if last_rep < expected and days_late > 12:
            add('warn', 'Relatório do administrador pendente', f"último relatório {last_rep:%d/%m/%Y}; o de {expected:%d/%m/%Y} já deveria ter chegado")
        else:
            add('ok', 'Relatório do administrador', f"último relatório {last_rep:%d/%m/%Y}")
    else:
        add('error', 'Nenhum relatório do administrador carregado', 'Suba os arquivos NAV Calculation para ancorar a cota.')
    # 6. subscriptions received but not yet in an admin report
    subs = led[led.type == 'SUBSCRIPTION']
    if len(subs):
        last_rep = I['reps'][-1]['date'] if I['reps'] else dt.date(2000, 1, 1)
        pend = [(r.trade_date, r.amount, r.counterparty) for r in subs.itertuples() if dealing_date(r.trade_date) > last_rep]
        if pend:
            add('info', 'Aplicações aguardando cotização', '; '.join(f"{d:%d/%m} US$ {v:,.0f} ({c})" for d, v, c in pend))
    for w in warnings:
        add('warn', 'Quantidade inconsistente', w)
    add('info', 'Marca d\'água usada na provisão de performance', f"{hwm:.6f} (maior cota de fechamento de maio/novembro)")
    return checks


def _jsonify(o):
    if isinstance(o, dict):
        return {str(k) if not isinstance(k, (dt.date, pd.Timestamp)) else _clean(k): _jsonify(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [_jsonify(v) for v in o]
    return _clean(o)

from .models import Stock
from django.utils import timezone
import datetime
import math


def finite(val):
    """Coerce a value to a JSON-safe float, or None.

    Postgres happily stores NaN / Infinity in a ``double precision`` column, but
    DRF's JSONRenderer runs with ``allow_nan=False`` and raises
    ``ValueError: Out of range float values are not JSON compliant`` while
    rendering. A single poisoned row therefore returns HTTP 500 for *every*
    endpoint that serializes it. Normalise on write instead.
    """
    if val is None:
        return None
    try:
        f = float(val)
    except (TypeError, ValueError):
        return None
    return f if math.isfinite(f) else None


def compute_calculated_nav(as_of=None):
    """
    Compute the fund's estimated daily NAV/cota from the uploaded Portfolio
    snapshots, applying an accrued management fee and a performance-fee provision.

    For each PortfolioSnapshot (one per trading day) the gross asset value is the
    sum of every item's market value plus that day's cash balance (carried forward
    when missing). A snapshot with nothing priced (a failed or empty upload) reuses
    the previous day's asset value and is flagged ``prices_stale``, rather than being
    read as a portfolio worth zero. Daily management fee accrues at
    ``mgmt_fee_rate / trading_days`` of the gross asset value; the running accrued amount (since ``mgmt_fee_paid_through``)
    is the unpaid management-fee liability. The performance-fee provision is
    ``perf_fee_rate`` of the cota gain above the high-water mark (measured net of the
    accrued management fee), multiplied by the shares outstanding.

        net_nav  = gross_asset_value - mgmt_fee_accrued - perf_fee_provision
        net_cota = net_nav / shares

    Returns a dict ready for JSON serialization, or ``None`` when there are no
    snapshots to compute from. ``as_of`` (a date) limits the series to snapshots on
    or before that date; the latest snapshot is used when omitted.
    """
    from .models import (FundConfig, DailyCash, PortfolioSnapshot, PortfolioItem,
                         NAVPosition, ManualFundFlow)

    cfg = FundConfig.get_solo()
    shares = cfg.shares or 0.0
    if shares <= 0:
        return None

    snapshots = list(PortfolioSnapshot.objects.order_by('date', 'created_at'))
    if as_of:
        snapshots = [s for s in snapshots if s.date <= as_of]
    if not snapshots:
        return None

    # Collapse to one snapshot per date — the most recent upload for that day.
    # Each macro run creates a new snapshot dated today, so re-runs and partial
    # uploads would otherwise each become a separate series point. The daily
    # return compares the last point against the one before it, so a same-day
    # partial upload sitting in that slot produces a nonsense daily move (e.g.
    # +48%). Ordered ascending by (date, created_at), so last write per date
    # wins = the latest upload for that date.
    by_date = {}
    for s in snapshots:
        by_date[s.date] = s
    snapshots = [by_date[d] for d in sorted(by_date)]

    # Gross asset value (positions only) per snapshot, in one query. Prefer the
    # stored market_value; fall back to quantity * price * cross_usd when absent.
    snapshot_ids = [s.id for s in snapshots]
    asset_value_by_snapshot = {sid: 0.0 for sid in snapshot_ids}
    # How many items actually carried a usable value, so a day whose upload landed
    # empty can be told apart from a day that genuinely priced to zero.
    priced_items_by_snapshot = {sid: 0 for sid in snapshot_ids}
    items = PortfolioItem.objects.filter(snapshot_id__in=snapshot_ids).values(
        'snapshot_id', 'market_value', 'price', 'quantity', 'cross_usd'
    )
    for it in items:
        mv = it['market_value']
        if mv is None:
            price = it['price'] or 0.0
            qty = it['quantity'] or 0.0
            cross = it['cross_usd'] if it['cross_usd'] is not None else 1.0
            mv = qty * price * cross
        asset_value_by_snapshot[it['snapshot_id']] += mv or 0.0
        if mv:
            priced_items_by_snapshot[it['snapshot_id']] += 1

    # Cash per date, carried forward.
    cash_rows = list(DailyCash.objects.order_by('date').values('date', 'cash'))

    def cash_for(d):
        carry = 0.0
        for row in cash_rows:
            if row['date'] <= d:
                carry = row['cash'] or 0.0
            else:
                break
        return carry

    rate = cfg.mgmt_fee_rate or 0.0
    days = cfg.trading_days or 255
    perf_rate = cfg.perf_fee_rate or 0.0
    hwm = cfg.high_water_mark or 0.0
    mgmt_paid_through = cfg.mgmt_fee_paid_through

    # Both fees crystallize (are paid) at end of May and end of November, so the
    # accrued management-fee liability resets on those dates. An explicit paid-through
    # date wins; otherwise anchor to the most recent crystallization on or before the
    # latest snapshot, so the figure resets per period without manual upkeep instead
    # of compounding from the very first snapshot ever loaded.
    mgmt_accrual_start = mgmt_paid_through
    if mgmt_accrual_start is None:
        ld = snapshots[-1].date
        boundaries = [
            datetime.date(ld.year - 1, 11, 30),
            datetime.date(ld.year, 5, 31),
            datetime.date(ld.year, 11, 30),
        ]
        mgmt_accrual_start = max(b for b in boundaries if b <= ld)

    # Hand-entered capital events (see ManualFundFlow), converted into shares at the
    # price set by ``FundConfig.flow_share_convention``. Because the flow's cash and the
    # shares it creates enter at the same price, the cota is left undistorted — without
    # this a subscription would land in the gross asset value as pure "performance" and
    # would also inflate the performance-fee provision.
    flow_convention = cfg.flow_share_convention or FundConfig.FLOW_PREV_COTA
    flows = {
        row['date']: (row['subscription'] or 0.0) - (row['redemption'] or 0.0)
        for row in ManualFundFlow.objects.values('date', 'subscription', 'redemption')
    }

    series = []
    mgmt_accrued = 0.0
    prev_net_cota = None
    shares_running = shares
    last_assets = None

    for snap in snapshots:
        assets = asset_value_by_snapshot.get(snap.id, 0.0)

        # A snapshot with nothing priced means the upload for that day failed or
        # landed empty -- not that the portfolio was worth zero. Taken at face value
        # it drives the cota to roughly minus the accrued fee and prints a -100% day.
        # Treat the prices as simply unavailable and hold the previous day's asset
        # value, so the cota comes out flat (it still moves by that day's management
        # fee, which does accrue regardless of whether we priced the book).
        prices_stale = False
        if not priced_items_by_snapshot.get(snap.id):
            if last_assets is None:
                # Nothing earlier to carry: the day is unobservable, so drop it
                # rather than invent a level for it.
                continue
            assets = last_assets
            prices_stale = True
        else:
            last_assets = assets

        cash = cash_for(snap.date)
        gav = assets + cash

        # The management fee accrues on the day's gross assets and is independent of the
        # share count, so it is settled before any capital event is priced.
        mgmt_fee_day = gav * rate / days if days else 0.0
        # Only days after the accrual start (last payment / month boundary) count
        # toward the unpaid liability.
        if snap.date > mgmt_accrual_start:
            mgmt_accrued += mgmt_fee_day

        def net_cota_for(n, gross):
            """Net cota implied by a share count and a gross asset value."""
            if not n:
                return 0.0
            after_mgmt = gross - mgmt_accrued
            perf = max(0.0, after_mgmt / n - hwm) * n * perf_rate
            return (after_mgmt - perf) / n

        # Settle the day's capital event into the share count before pricing the day.
        net_flow = flows.get(snap.date, 0.0)
        shares_day = shares_running if shares_running > 0 else shares
        if net_flow:
            if flow_convention == FundConfig.FLOW_SAME_COTA:
                # Price the fund as it stood *without* this money — that per-share value
                # is what the event transacts at — then issue against it.
                entry_cota = net_cota_for(shares_day, gav - net_flow)
            else:
                entry_cota = prev_net_cota
            if entry_cota:
                shares_day += net_flow / entry_cota
            shares_running = shares_day

        gross_cota = gav / shares_day

        nav_after_mgmt = gav - mgmt_accrued
        cota_after_mgmt = nav_after_mgmt / shares_day

        perf_provision = max(0.0, cota_after_mgmt - hwm) * shares_day * perf_rate

        net_nav = nav_after_mgmt - perf_provision
        net_cota = net_nav / shares_day

        daily_return = None
        if prev_net_cota:
            daily_return = (net_cota / prev_net_cota - 1.0) * 100.0
        prev_net_cota = net_cota

        series.append({
            'date': snap.date.isoformat() if snap.date else None,
            'asset_value': round(assets, 2),
            'cash': round(cash, 2),
            'gross_asset_value': round(gav, 2),
            'gross_cota': round(gross_cota, 6),
            'mgmt_fee_day': round(mgmt_fee_day, 2),
            'mgmt_fee_accrued': round(mgmt_accrued, 2),
            'cota_after_mgmt': round(cota_after_mgmt, 6),
            'perf_fee_provision': round(perf_provision, 2),
            'net_nav': round(net_nav, 2),
            'net_cota': round(net_cota, 6),
            'shares': round(shares_day, 4),
            'net_flow': round(net_flow, 2) if net_flow else None,
            'daily_return_pct': round(daily_return, 4) if daily_return is not None else None,
            # True when this day had no usable prices and reuses the previous day's
            # asset value (see the carry-forward above).
            'prices_stale': prices_stale,
        })

    # Every snapshot could have been empty (nothing to carry from), leaving no
    # observable day at all.
    if not series:
        return None

    latest = series[-1]
    prev = series[-2] if len(series) > 1 else None

    # ── Month-to-date / year-to-date net-cota returns ──────────────────────────
    # Base = last net cota strictly before the period (so the first move counts);
    # fall back to the first observation within the period when no prior point exists.
    latest_d = datetime.date.fromisoformat(latest['date'])
    ytd_base = ytd_first = mtd_base = mtd_first = None
    for pt in series:
        d = datetime.date.fromisoformat(pt['date'])
        if d.year < latest_d.year:
            ytd_base = pt['net_cota']
        elif ytd_first is None:
            ytd_first = pt['net_cota']
        if (d.year, d.month) < (latest_d.year, latest_d.month):
            mtd_base = pt['net_cota']
        elif mtd_first is None:
            mtd_first = pt['net_cota']

    def _pct(base):
        if base:
            return round((latest['net_cota'] / base - 1.0) * 100.0, 4)
        return None

    # Prefer a series-derived base (the cota just before the period). When the
    # uploaded history doesn't yet reach the period start, fall back to the
    # configured base cota, then to the first observation within the period.
    mtd_return = _pct(mtd_base if mtd_base is not None else (cfg.mtd_base_cota or mtd_first))
    ytd_return = _pct(ytd_base if ytd_base is not None else (cfg.ytd_base_cota or ytd_first))

    # Official cota from the administrator upload, for side-by-side comparison.
    official_cota = None
    nav_qs = NAVPosition.objects.filter(nav_per_share__isnull=False)
    if cfg.fund:
        nav_qs = nav_qs.filter(fund__icontains=cfg.fund) or nav_qs
    official = nav_qs.order_by('-date').first()
    if official:
        official_cota = {
            'date': official.date.isoformat() if official.date else None,
            'nav_per_share': official.nav_per_share,
            'nav': official.nav,
        }

    return {
        'config': {
            'fund': cfg.fund,
            'shares': shares,
            'mgmt_fee_rate': rate,
            'trading_days': days,
            'perf_fee_rate': perf_rate,
            'high_water_mark': hwm,
            'mgmt_fee_paid_through': mgmt_paid_through.isoformat() if mgmt_paid_through else None,
            'perf_fee_paid_through': cfg.perf_fee_paid_through.isoformat() if cfg.perf_fee_paid_through else None,
        },
        # Day from which the management fee is accruing (explicit paid-through date,
        # or the day before the current month started when none is set).
        'mgmt_accrual_start': mgmt_accrual_start.isoformat(),
        'latest': latest,
        'previous': prev,
        'mtd_return_pct': mtd_return,
        'ytd_return_pct': ytd_return,
        'excess_over_hwm': round(latest['cota_after_mgmt'] - hwm, 6),
        'total_fees_to_pay': round(latest['mgmt_fee_accrued'] + latest['perf_fee_provision'], 2),
        'official_cota': official_cota,
        'series': series,
    }


def compute_unified_fund_series(fund=None):
    """
    Splice the official administrator history onto the calculated-NAV estimate to
    produce one continuous cota/NAV series.

    The official `NAVPosition` upload stopped being refreshed, so its series ends at
    a fixed date while `PortfolioSnapshot` uploads continue daily. This joins them:

      * up to the last official date the series *is* the official data, untouched;
      * after it, each point is chain-linked off the official cota using the
        calculated engine's cota ratio:

            cota(t) = official_cota(T) * net_cota(t) / net_cota(anchor)

        where ``T`` is the last official date and ``anchor`` is the last calculated
        point on or before ``T``. Chaining on the *ratio* rather than pasting the
        calculated level avoids a step at the splice, since the two levels differ
        (different pricing sources, cash treatment, rounding).

    ``nav`` for estimated points is ``cota * shares``. Shares start from the last
    official count and then move with any hand-entered `ManualFundFlow`: each day's
    flow is stripped out of the return (so money in/out is not read as performance)
    and converted into shares issued/cancelled at that day's cota. Days with no
    manual entry report ``None`` for the flow fields rather than ``0`` — the official
    feed stopped, so "unknown" is the honest claim, and a zero would wrongly assert
    that no capital moved.

    Returns a dict with the merged ``series`` (each row flagged ``is_estimated``)
    plus splice metadata, or ``None`` when there is no data at all.
    """
    from .models import NAVPosition, ManualFundFlow

    nav_qs = NAVPosition.objects.all()
    if fund:
        filtered = nav_qs.filter(fund__icontains=fund)
        # The uploaded data sometimes labels the fund differently than the caller;
        # an empty filter result means "no match", so fall back to unfiltered.
        if filtered.exists():
            nav_qs = filtered

    official = list(
        nav_qs.filter(nav_per_share__isnull=False)
        .order_by('date')
        .values('date', 'fund', 'nav', 'shares', 'nav_per_share',
                'subscription_d0', 'redemption_d0', 'redemption_d1')
    )

    def official_row(r):
        return {
            'date': r['date'].isoformat() if r['date'] else None,
            'fund': r['fund'],
            'nav': r['nav'],
            'shares': r['shares'],
            'nav_per_share': r['nav_per_share'],
            'subscription_d0': r['subscription_d0'],
            'redemption_d0': r['redemption_d0'],
            'redemption_d1': r['redemption_d1'],
            'is_estimated': False,
        }

    calc = compute_calculated_nav()
    calc_series = (calc or {}).get('series') or []

    # No calculated engine output → nothing to extend with; hand back the official
    # series so callers can use this endpoint unconditionally.
    if not calc_series:
        return {
            'series': [official_row(r) for r in official],
            'official_through': official[-1]['date'].isoformat() if official else None,
            'estimated_from': None,
            'splice_cota': None,
            'shares_carried': None,
            'shares_latest': None,
            'has_estimate': False,
            'flows_estimated': False,
            'manual_flows_applied': 0,
        }

    if not official:
        # No official history at all — the calculated series stands on its own, so its
        # own cota and share count (already flow-aware) can be used directly.
        shares = calc_series[-1].get('shares') if calc_series else None
        series = [{
            'date': p['date'],
            'fund': fund,
            'nav': p['net_nav'],
            'shares': p.get('shares'),
            'nav_per_share': p['net_cota'],
            'subscription_d0': None,
            'redemption_d0': None,
            'redemption_d1': None,
            'is_estimated': True,
        } for p in calc_series]
        return {
            'series': series,
            'official_through': None,
            'estimated_from': series[0]['date'] if series else None,
            'splice_cota': None,
            'shares_carried': shares,
            'shares_latest': shares,
            'has_estimate': bool(series),
            'flows_estimated': False,
            'manual_flows_applied': 0,
        }

    splice_date = official[-1]['date']
    splice_cota = official[-1]['nav_per_share']
    shares_carried = official[-1]['shares'] or (((calc or {}).get('config') or {}).get('shares'))

    # Anchor = last calculated point at or before the splice date, so the ratio
    # measures growth from the same moment the official series ends. When the
    # calculated series starts *after* the splice there is no overlap, so anchor on
    # its first point (the gap's return is unobservable and treated as flat).
    anchor = None
    for p in calc_series:
        d = datetime.date.fromisoformat(p['date'])
        if d <= splice_date:
            anchor = p
        else:
            break
    if anchor is None:
        anchor = calc_series[0]

    series = [official_row(r) for r in official]

    # Hand-entered capital events, reported back on the rows they apply to so the
    # flows chart can show them alongside the official history.
    flows = {
        row['date']: row
        for row in ManualFundFlow.objects.values('date', 'subscription', 'redemption')
    }

    # The calculated engine already settles flows into its own share count, so its net
    # cota is flow-adjusted — a plain ratio chain-link is all that's needed for the cota.
    #
    # The share count, though, has to be rebuilt here rather than read off the engine:
    # the engine issues shares at *its* cota level, while this series rebases cota onto
    # the official one. Converting a flow at the wrong price would make the capital event
    # contribute the wrong amount of NAV. So walk shares forward against the spliced
    # cota, honouring the same convention the engine used.
    from .models import FundConfig
    flow_convention = FundConfig.get_solo().flow_share_convention or FundConfig.FLOW_PREV_COTA

    anchor_cota = anchor.get('net_cota') or 0.0
    flows_applied = 0

    if anchor_cota and splice_cota:
        shares_t = shares_carried or 0.0
        prev_cota = splice_cota

        for p in calc_series:
            d = datetime.date.fromisoformat(p['date'])
            if d <= splice_date:
                continue  # official data wins over the overlap

            cota = splice_cota * (p['net_cota'] / anchor_cota)

            f = flows.get(d)
            net_flow = ((f['subscription'] or 0.0) - (f['redemption'] or 0.0)) if f else 0.0
            if net_flow:
                flows_applied += 1
                # SAME_COTA transacts at this day's own (ex-flow) cota, which the spliced
                # series already reports as ``cota``; PREV_COTA uses the day before.
                entry_cota = cota if flow_convention == FundConfig.FLOW_SAME_COTA else prev_cota
                if entry_cota:
                    shares_t += net_flow / entry_cota
            prev_cota = cota

            series.append({
                'date': p['date'],
                'fund': fund,
                'nav': round(cota * shares_t, 2) if shares_t else None,
                'shares': round(shares_t, 4) if shares_t else None,
                'nav_per_share': round(cota, 6),
                # Only report flows we actually have an entry for; None means "unknown",
                # which is a weaker and more honest claim than a zero.
                'subscription_d0': (f['subscription'] or 0.0) if f else None,
                'redemption_d0': (f['redemption'] or 0.0) if f else None,
                'redemption_d1': None,
                'is_estimated': True,
            })

    estimated = [r for r in series if r['is_estimated']]
    shares = estimated[-1]['shares'] if estimated else shares_carried
    return {
        'series': series,
        'official_through': splice_date.isoformat(),
        'estimated_from': estimated[0]['date'] if estimated else None,
        'splice_cota': splice_cota,
        'shares_carried': shares_carried,
        'shares_latest': round(shares, 4) if shares else None,
        'has_estimate': bool(estimated),
        # Whether any hand-entered capital event was applied in the estimated window.
        'flows_estimated': flows_applied > 0,
        'manual_flows_applied': flows_applied,
    }


# Bloomberg exchange code → yfinance suffix mapping
BLOOMBERG_TO_YFINANCE: dict[str, str] = {
    "CN": ".TO",    # Canada (Toronto)
    "CT": ".TO",    # Canada (Toronto) alternate
    "LN": ".L",     # London
    "GY": ".DE",    # Germany (Xetra/Frankfurt)
    "GR": ".DE",    # Germany alternate
    "FP": ".PA",    # France (Paris)
    "IM": ".MI",    # Italy (Milan)
    "SM": ".MC",    # Spain (Madrid)
    "NA": ".AS",    # Netherlands (Amsterdam)
    "BB": ".BR",    # Belgium (Brussels)
    "SE": ".ST",    # Sweden (Stockholm)
    "SS": ".ST",    # Sweden alternate
    "NO": ".OL",    # Norway (Oslo)
    "DC": ".CO",    # Denmark (Copenhagen)
    "FH": ".HE",    # Finland (Helsinki)
    "SW": ".SW",    # Switzerland (Zurich)
    "AU": ".AX",    # Australia (ASX)
    "AT": ".AX",    # Australia alternate
    "JP": ".T",     # Japan (Tokyo)
    "JT": ".T",     # Japan (Tokyo) alternate
    "HK": ".HK",    # Hong Kong
    "SP": ".SI",    # Singapore
    "KS": ".KS",    # South Korea (KOSPI)
    "KP": ".KQ",    # South Korea (KOSDAQ)
    "IT": ".TA",    # Israel (Tel Aviv)
    "BZ": ".SA",    # Brazil (São Paulo)
    "MM": ".MX",    # Mexico
    "IB": ".BO",    # India (Bombay)
    "IN": ".NS",    # India (NSE)
    "TB": ".BK",    # Thailand (Bangkok)
    "MK": ".KL",    # Malaysia (Kuala Lumpur)
    "PM": ".PS",    # Philippines
    "IJ": ".JK",    # Indonesia (Jakarta)
    "NZ": ".NZ",    # New Zealand
    "PL": ".WA",    # Poland (Warsaw)
    "TI": ".IS",    # Turkey (Istanbul)
    "SJ": ".JO",    # South Africa (Johannesburg)
}


def bloomberg_to_yfinance(raw_ticker: str) -> str:
    """
    Convert a Bloomberg-style ticker (e.g. 'CSU CN Equity') to a yfinance-compatible
    ticker (e.g. 'CSU.TO'). US equities keep no suffix.
    If the format is just a plain ticker like 'AAPL', return as-is.
    """
    parts = raw_ticker.strip().upper().split()
    base = parts[0]

    if len(parts) >= 2:
        exchange_code = parts[1]
        # US exchanges don't need a suffix
        if exchange_code in ("US", "UW", "UN", "UQ", "UA", "UP"):
            return base
        suffix = BLOOMBERG_TO_YFINANCE.get(exchange_code)
        if suffix:
            return base + suffix

    return base


def update_stock_price(ticker_symbol: str):
    """
    Fetches the latest info for a ticker from yfinance.
    Creates or updates the Stock model in the database.
    Returns the Stock object.
    """
    import yfinance as yf
    symbol = ticker_symbol.upper()
    try:
        yf_ticker = yf.Ticker(symbol)
        
        # Use fast info to avoid scraping the huge dictionary for just prices
        info = yf_ticker.fast_info
        
        # Attempt to get sector/industry. They are only in the full info dict.
        # This is slower but we only need to do it once if missing.
        stock, created = Stock.objects.get_or_create(ticker=symbol)
        
        if created or not stock.company_name or not stock.sector or stock.forward_pe is None:
            full_info = yf_ticker.info
            stock.company_name = full_info.get('shortName', full_info.get('longName', symbol))
            stock.sector = full_info.get('sector', 'Unknown')
            stock.industry = full_info.get('industry', 'Unknown')
            stock.forward_pe = finite(full_info.get('forwardPE'))
        
        # current_price can come back as None *or* NaN when the market is acting up.
        # NaN is truthy, so a bare `if not current_price` lets it straight through.
        current_price = finite(info.get('last_price'))
        if not current_price:
            # Fallback — fetch the daily history once, not twice.
            hist = yf_ticker.history(period='1d')
            current_price = finite(hist['Close'].iloc[-1]) if not hist.empty else 0.0

        stock.current_price = current_price if current_price is not None else 0.0

        # Get previous close for daily P&L calculation
        prev_close = finite(info.get('previous_close')) or finite(info.get('regularMarketPreviousClose'))
        if prev_close:
            stock.previous_close = prev_close
        
        # Fetch historical financials (Income Statement)
        try:
            income_stmt = yf_ticker.income_stmt
            if income_stmt is not None and not income_stmt.empty:
                financials_list = []
                
                def sanitize_float(val):
                    try:
                        import math
                        f_val = float(val)
                        if math.isnan(f_val) or math.isinf(f_val):
                            return 0
                        return f_val
                    except:
                        return 0

                # yfinance returns timestamps as keys
                for timestamp in income_stmt.columns:
                    col = income_stmt[timestamp]
                    
                    def get_first_match(aliases, default=0):
                        for a in aliases:
                            val = col.get(a)
                            if val is not None:
                                return sanitize_float(val)
                        return default

                    # Convert to standard Python types for JSON serialization
                    entry = {
                        'date': timestamp.strftime('%Y-%m-%d') if hasattr(timestamp, 'strftime') else str(timestamp),
                        'revenue': get_first_match(['Total Revenue', 'Operating Revenue', 'Revenue']),
                        'op_income': get_first_match(['Operating Income', 'EBIT', 'Total Operating Income As Reported']),
                        'net_income': get_first_match(['Net Income', 'Net Income Common Stockholders', 'Diluted NI Availto Com Stockholders']),
                        'cost_of_revenue': get_first_match(['Cost Of Revenue', 'Reconciled Cost Of Revenue']),
                        'op_expense': get_first_match(['Operating Expense', 'Total Expenses', 'Total Operating Expense']),
                    }
                    financials_list.append(entry)
                
                # Sort by date ascending
                financials_list.sort(key=lambda x: x['date'])
                stock.financials = financials_list
            else:
                pass
        except Exception as fe:
            print(f"Error fetching financials for {symbol}: {fe}")

        stock.save()
        return stock

    except Exception as e:
        print(f"Error fetching data for {symbol}: {e}")
        # Return existing if possible, or None
        return Stock.objects.filter(ticker=symbol).first()

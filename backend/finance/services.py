from .models import Stock
from django.utils import timezone
import datetime


def compute_calculated_nav(as_of=None):
    """
    Compute the fund's estimated daily NAV/cota from the uploaded Portfolio
    snapshots, applying an accrued management fee and a performance-fee provision.

    For each PortfolioSnapshot (one per trading day) the gross asset value is the
    sum of every item's market value plus that day's cash balance (carried forward
    when missing). Daily management fee accrues at ``mgmt_fee_rate / trading_days``
    of the gross asset value; the running accrued amount (since ``mgmt_fee_paid_through``)
    is the unpaid management-fee liability. The performance-fee provision is
    ``perf_fee_rate`` of the cota gain above the high-water mark (measured net of the
    accrued management fee), multiplied by the shares outstanding.

        net_nav  = gross_asset_value - mgmt_fee_accrued - perf_fee_provision
        net_cota = net_nav / shares

    Returns a dict ready for JSON serialization, or ``None`` when there are no
    snapshots to compute from. ``as_of`` (a date) limits the series to snapshots on
    or before that date; the latest snapshot is used when omitted.
    """
    from .models import FundConfig, DailyCash, PortfolioSnapshot, PortfolioItem, NAVPosition

    cfg = FundConfig.get_solo()
    shares = cfg.shares or 0.0
    if shares <= 0:
        return None

    snapshots = list(PortfolioSnapshot.objects.order_by('date', 'created_at'))
    if as_of:
        snapshots = [s for s in snapshots if s.date <= as_of]
    if not snapshots:
        return None

    # Gross asset value (positions only) per snapshot, in one query. Prefer the
    # stored market_value; fall back to quantity * price * cross_usd when absent.
    snapshot_ids = [s.id for s in snapshots]
    asset_value_by_snapshot = {sid: 0.0 for sid in snapshot_ids}
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

    series = []
    mgmt_accrued = 0.0
    prev_net_cota = None

    for snap in snapshots:
        assets = asset_value_by_snapshot.get(snap.id, 0.0)
        cash = cash_for(snap.date)
        gav = assets + cash

        gross_cota = gav / shares
        mgmt_fee_day = gav * rate / days if days else 0.0

        # Only days after the last payment contribute to the unpaid liability.
        if mgmt_paid_through is None or snap.date > mgmt_paid_through:
            mgmt_accrued += mgmt_fee_day

        nav_after_mgmt = gav - mgmt_accrued
        cota_after_mgmt = nav_after_mgmt / shares

        perf_provision = max(0.0, cota_after_mgmt - hwm) * shares * perf_rate

        net_nav = nav_after_mgmt - perf_provision
        net_cota = net_nav / shares

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
            'daily_return_pct': round(daily_return, 4) if daily_return is not None else None,
        })

    latest = series[-1]
    prev = series[-2] if len(series) > 1 else None

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
        'latest': latest,
        'previous': prev,
        'excess_over_hwm': round(latest['cota_after_mgmt'] - hwm, 6),
        'total_fees_to_pay': round(latest['mgmt_fee_accrued'] + latest['perf_fee_provision'], 2),
        'official_cota': official_cota,
        'series': series,
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
            stock.forward_pe = full_info.get('forwardPE', None)
        
        # current_price can sometimes come back as None if market is acting up
        current_price = info.get('last_price')
        if not current_price:
            # Fallback
            current_price = yf_ticker.history(period='1d')['Close'].iloc[-1] if not yf_ticker.history(period='1d').empty else 0.0
            
        stock.current_price = current_price

        # Get previous close for daily P&L calculation
        prev_close = info.get('previous_close') or info.get('regularMarketPreviousClose')
        if prev_close:
            stock.previous_close = float(prev_close)
        
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

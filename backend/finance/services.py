from .models import Stock
from django.utils import timezone
import datetime

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

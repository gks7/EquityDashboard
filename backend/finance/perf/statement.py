"""
Parser for the custodian cash statement (UBS e-banking export, .xlsx).

Layout: a few header lines ("Account number:", "From:", "Until:", "Opening balance:", ...), then a
table whose header row starts with "Trade date". Columns: Trade date, Trade time, Booking date,
Value date, Currency, Debit, Credit, Individual amount, Balance, Transaction no., Description1-3, Footnotes.

Every row is classified (BUY/SELL/DIVIDEND/...), mapped to an asset through AssetAlias (ISIN first,
then the regex pattern) and its units/price/accrued interest are read from Description3.
"""
import datetime as dt
import re

ISIN_RX = re.compile(r'\b([A-Z]{2}[A-Z0-9]{9}\d)\b')


def _num(rx, s):
    m = re.search(rx, s or '')
    if not m:
        return None
    try:
        return float(m.group(1).replace(',', ''))
    except ValueError:
        return None


def _date(v):
    if v is None or v == '':
        return None
    if isinstance(v, dt.datetime):
        return v.date()
    if isinstance(v, dt.date):
        return v
    for fmt in ('%Y-%m-%d', '%d.%m.%Y', '%d/%m/%Y'):
        try:
            return dt.datetime.strptime(str(v)[:10], fmt).date()
        except ValueError:
            continue
    return None


class AliasMatcher:
    """Resolve an asset id from a statement description, a ticker or an ISIN."""

    def __init__(self, aliases):
        self.by_isin = {a['isin']: a['asset_id'] for a in aliases if a.get('isin')}
        self.patterns = [(re.compile(a['statement_pattern'], re.I), a['asset_id'])
                         for a in aliases if a.get('statement_pattern')]
        self.by_ticker = {}
        for a in aliases:
            self.by_ticker[a['asset_id'].upper()] = a['asset_id']
            for t in (a.get('tickers') or '').split(','):
                if t.strip():
                    self.by_ticker[t.strip().upper()] = a['asset_id']

    def from_description(self, desc):
        desc = desc or ''
        for isin in ISIN_RX.findall(desc):
            if isin in self.by_isin:
                return self.by_isin[isin]
        for rx, aid in self.patterns:
            if rx.search(desc):
                return aid
        return None

    def from_ticker(self, ticker):
        if not ticker:
            return None
        t = ticker.strip().upper()
        if t in self.by_ticker:
            return self.by_ticker[t]
        t2 = re.sub(r'\s+(EQUITY|CORP|GOVT)$', '', t)
        t2 = re.sub(r'\s+(US|CN|LN|NA|GY|IM)$', '', t2)
        return self.by_ticker.get(t2)

    def from_isin(self, isin):
        return self.by_isin.get((isin or '').strip())


def classify(desc1, desc2, desc3, amount):
    d1, d2, d3 = desc1 or '', desc2 or '', desc3 or ''
    rev = 'Reversal' in d2
    base = d2.replace(';Reversal', '').strip()
    up1, up2, up3 = d1.upper(), d2.upper(), d3.upper()
    if base == 'Purchase Spot' or base.startswith('Purchase'):
        return 'BUY', rev
    if base == 'Sale Spot' or (base.startswith('Sale') and 'FX' not in base):
        return 'SELL', rev
    if 'without security booking' in base:
        return 'AMORTIZATION', rev
    if base in ('Secur. Repay.', 'Security Repayment') or base.startswith('Redemption'):
        return 'REDEMPTION', rev
    if 'dividend' in base.lower():
        return 'DIVIDEND', rev
    if base == 'Interest':
        return 'COUPON', rev
    if 'FX' in base or 'You sold' in d1:
        return 'TRANSFER', rev                      # conversion between the fund's own currency accounts
    if d1.startswith('Third-Party Charges') or d1.startswith('Balance closing of service prices'):
        return 'BANK_FEE', rev
    if d1.startswith('Interest calculation balance'):
        return 'BANK_INTEREST', rev
    if 'IGF WEALTH MANAGEMENT' in up1:
        return ('MGMT_PERF_FEE' if 'PERF' in up2 or 'PERF' in up3 else 'MGMT_FEE'), rev
    if amount < 0 and ('REDEMPTION' in up2 or 'REDEMPTION' in up3) and 'FEE' not in up2:
        return 'REDEMPTION_PAID', rev
    if amount < 0 and ('payment order' in d2 or 'INVOICE' in up2 or 'INVOICE' in up3):
        return 'EXPENSE', rev
    if d1 == 'entry':
        return 'OTHER_INCOME', rev
    if base in ('credit', 'payment') and amount > 0:
        return 'SUBSCRIPTION', rev
    return 'OTHER', rev


def parse_workbook(path_or_file, matcher):
    """Return (meta, rows). Raises ValueError with a readable message on a wrong file."""
    import openpyxl
    try:
        wb = openpyxl.load_workbook(path_or_file, data_only=True)
    except Exception as e:  # encrypted / not xlsx
        raise ValueError(f'Não consegui abrir o arquivo como .xlsx ({e.__class__.__name__}). '
                         'Exporte o extrato em Excel sem senha.')
    ws = wb.active
    meta, header_row, rows = {}, None, []
    all_rows = list(ws.iter_rows(values_only=True))
    for i, r in enumerate(all_rows):
        first = str(r[0]).strip() if r and r[0] is not None else ''
        if first.endswith(':') and len(r) > 1:
            meta[first[:-1]] = r[1]
        if first == 'Trade date':
            header_row = i
            break
    if header_row is None:
        raise ValueError('Cabeçalho "Trade date" não encontrado: este não parece o extrato de transações do banco.')
    hdr = [str(c).strip() if c else '' for c in all_rows[header_row]]
    col = {h: j for j, h in enumerate(hdr)}
    need = ['Trade date', 'Booking date', 'Currency', 'Debit', 'Credit', 'Transaction no.', 'Description1', 'Description2', 'Description3']
    missing = [n for n in need if n not in col]
    if missing:
        raise ValueError('Colunas ausentes no extrato: ' + ', '.join(missing))
    account = str(meta.get('Account number', '') or '').strip()
    g = lambda r, k: r[col[k]] if k in col and col[k] < len(r) else None
    for r in all_rows[header_row + 1:]:
        td = _date(g(r, 'Trade date'))
        if not td:
            continue
        amount = float(g(r, 'Debit') or 0) + float(g(r, 'Credit') or 0)
        d1, d2, d3 = g(r, 'Description1') or '', g(r, 'Description2') or '', g(r, 'Description3') or ''
        typ, rev = classify(d1, d2, d3, amount)
        asset = matcher.from_description(d1) if typ in ('BUY', 'SELL', 'REDEMPTION', 'AMORTIZATION', 'DIVIDEND', 'COUPON') else None
        qty = _num(r'Number/Amt\. ([\d.,]+)', d3)
        units = 0.0
        if typ in ('BUY', 'SELL', 'REDEMPTION') and qty:
            sign = 1 if typ == 'BUY' else -1
            units = (-sign if rev else sign) * qty
        cpty = d1.split(';')[0].strip() if typ in ('SUBSCRIPTION', 'MGMT_FEE', 'MGMT_PERF_FEE', 'EXPENSE', 'REDEMPTION_PAID') else ''
        tt = g(r, 'Trade time')
        rows.append(dict(
            account=account, trade_date=td, trade_time=str(tt)[:8] if tt else '',
            booking_date=_date(g(r, 'Booking date')), value_date=_date(g(r, 'Value date')),
            currency=g(r, 'Currency') or 'USD', amount=round(amount, 2),
            balance=g(r, 'Balance') if isinstance(g(r, 'Balance'), (int, float)) else None,
            txn_no=str(g(r, 'Transaction no.') or ''), desc1=d1, desc2=d2, desc3=d3,
            type=typ, asset_id=asset or '', units=units, price=_num(r'Transaction price: ([\d.,]+)', d3),
            accrued=_num(r'Accrued interest: (-?[\d.,]+)', d3), is_reversal=rev, counterparty=cpty[:255]))
    meta_out = {
        'account': account,
        'from': _date(meta.get('From')), 'until': _date(meta.get('Until')),
        'opening_balance': meta.get('Opening balance'), 'closing_balance': meta.get('Closing balance'),
        'currency': meta.get('Valued in'),
    }
    return meta_out, rows


def dealing_date(arrival):
    """Administrator deals monthly on the last business day. Cash arriving in the first 12 days of a
    month belongs to the previous month's dealing (e.g. 02/04 -> 31/03); otherwise to this month's."""
    import pandas as pd
    a = pd.Timestamp(arrival)
    if a.day <= 12:
        d = a.replace(day=1) - pd.offsets.Day(1)
    else:
        d = a + pd.offsets.MonthEnd(0)
    while d.weekday() >= 5:
        d -= pd.offsets.Day(1)
    return d.date()

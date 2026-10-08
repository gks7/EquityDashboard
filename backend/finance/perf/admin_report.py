"""
Parser for the administrator's month-end "NAV Calculation - IGFWM Total Class A MM.YYYY.xlsx".

Sheet "NAV Report": header block (Base NAV, fees, NAV, Redemptions, Subscriptions, NAV Closing for the
previous and current month), then holdings by section (EQUITIES, BONDS, SETTLEMENT, BANK ACCOUNTS).
Sheet "Participating shares": one block per share series (shares, NAV per share, NAV), the first block
being the lead series, followed by its year table of month-end NAV per share.
"""
import datetime as dt
import re

ISIN_RX = re.compile(r'^[A-Z]{2}[A-Z0-9]{9}\d$')
HEADER_KEYS = ('Base NAV', 'Management fee', 'Performance fee', 'NAV', 'Redemptions', 'Subscriptions', 'NAV Closing')


def _vals(r):
    return [v for v in r if v is not None and v != '']


def parse_workbook(path_or_file, file_name=''):
    import openpyxl
    try:
        wb = openpyxl.load_workbook(path_or_file, data_only=True)
    except Exception as e:
        raise ValueError(f'{file_name}: não consegui abrir ({e.__class__.__name__}). '
                         'Se o arquivo tem senha, abra no Excel e salve uma cópia sem senha.')
    if 'NAV Report' not in wb.sheetnames:
        raise ValueError(f'{file_name}: aba "NAV Report" não encontrada — não é o relatório NAV Calculation do administrador.')
    ws = wb['NAV Report']
    out = {'file_name': file_name, 'holdings': []}
    section = None
    for r in ws.iter_rows(values_only=True):
        v = _vals(r)
        if not v:
            continue
        if 'date' not in out and len(v) == 1 and isinstance(v[0], dt.datetime):
            out['date'] = v[0].date()
            continue
        key = str(v[0]).strip()
        if key in HEADER_KEYS and len(v) >= 3 and key not in out:
            out[key] = float(v[2]) if isinstance(v[2], (int, float)) else None
            out[key + '_prev'] = float(v[1]) if isinstance(v[1], (int, float)) else None
            continue
        if key in ('EQUITIES', 'BONDS', 'SETTLEMENT', 'BANK ACCOUNTS'):
            section = key
            continue
        if key == 'TOTAL' and len(v) >= 2 and isinstance(v[1], (int, float)):
            out['total_assets'] = float(v[1])
            section = None
            continue
        if key == 'Revenues & Expenses':
            section = None
        if not section or not isinstance(v[0], str):
            continue
        isin = next((x.strip() for x in v if isinstance(x, str) and ISIN_RX.match(x.strip())), '')
        nums = [float(x) for x in v if isinstance(x, (int, float)) and not isinstance(x, bool)]
        h = None
        if section == 'BONDS' and len(nums) >= 5:
            h = dict(section=section, name=key, isin=isin, accrued=nums[0], qty=nums[1], cost=nums[2], value=nums[3], price=nums[4])
        elif section == 'EQUITIES' and len(nums) >= 4:
            h = dict(section=section, name=key, isin=isin, accrued=0.0, qty=nums[0], cost=nums[1], value=nums[2], price=nums[3])
        elif section == 'SETTLEMENT' and len(nums) >= 2:
            h = dict(section=section, name=key, isin=isin, accrued=0.0, qty=nums[0], cost=None, value=nums[2] if len(nums) > 2 else nums[1], price=None)
        elif section == 'BANK ACCOUNTS' and nums:
            h = dict(section=section, name=key, isin='', accrued=0.0, qty=None, cost=None, value=nums[0], price=None)
        if h:
            out['holdings'].append(h)
    if 'date' not in out:
        raise ValueError(f'{file_name}: data do relatório não encontrada na aba NAV Report.')

    series, lead_table, cur = [], {}, None
    if 'Participating shares' in wb.sheetnames:
        for r in wb['Participating shares'].iter_rows(values_only=True):
            v = _vals(r)
            if not v:
                continue
            if isinstance(v[0], str) and v[0].upper().startswith('PARTICIPATING SHARES'):
                name = re.sub(r'(?i)participating shares|series', '', v[0]).strip().title()
                cur = {'series': name}
                series.append(cur)
                continue
            if cur is None:
                continue
            if v[0] == 'NAV (CLOSING)' and len(v) >= 4:
                cur.update(shares=float(v[1]), nav_per_share=float(v[2]), nav=float(v[3]))
            elif v[0] == 'SUBSCRIPTIONS' and len(v) >= 4:
                cur.update(sub_shares=float(v[1]), sub_price=float(v[2]), sub_amount=float(v[3]))
            elif len(series) == 1:
                y = v[0]
                if isinstance(y, str) and re.fullmatch(r'20\d\d', y.strip()):
                    y = int(y)
                if isinstance(y, (int, float)) and 2000 < y < 2100:
                    lead_table[str(int(y))] = [float(x) for x in v[1:] if isinstance(x, (int, float))]
    out['series'] = series
    out['lead_table'] = lead_table
    out['total_shares'] = sum(s.get('shares', 0) or 0 for s in series) or None
    lead = series[0] if series else {}
    out['lead_cota'] = lead.get('nav_per_share')
    return out


def lead_month_ends(reports):
    """Month-end lead-series NAV per share {date: cota}, from every report's year table.
    Later reports win. The 2025 row of the Nov-2025 series lists only Nov and Dec."""
    import pandas as pd
    out = {}
    for rep in sorted(reports, key=lambda r: r['date']):
        rd = rep['date']
        for y, nums in (rep.get('lead_table') or {}).items():
            y = int(y)
            vals = [x for x in nums if x and x > 0.3][:12]
            if not vals:
                continue
            # the series' first year starts in the month it was launched: align from the end of the year
            if y < rd.year and len(vals) < 12:
                start_m = 13 - len(vals)
            else:
                start_m = 1
            for k, val in enumerate(vals):
                m = start_m + k
                if m > 12:
                    break
                d = (pd.Timestamp(y, m, 1) + pd.offsets.BMonthEnd(0)).date()
                if d <= rd:
                    out[d] = val
        if rep.get('lead_cota'):
            out[rd] = rep['lead_cota']
    return dict(sorted(out.items()))

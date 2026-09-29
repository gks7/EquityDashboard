"""Turn raw XBRL facts into calendar-quarter metrics for one company.

Raw facts per tag are lists of ``[start, end, value_orig, value_latest,
filed_orig, filed_latest]`` with dates as YYYYMMDD ints (start = 0 for
balance-sheet instants).

Rules (unchanged from the original research pipeline):

* A fiscal quarter is labelled with the calendar quarter it mostly covers,
  using the company's own fiscal-year starts (Apple's Dec quarter is 1Q).
* 3-month facts are used as reported. Missing quarters (usually Q4) are
  derived by differencing year-to-date facts that share a start date
  (Q4 = FY - 9M). Share-count averages are differenced with weights.
* A 3-month value equal to the annual value is rejected (tagging error).
* When the original and restated values of a derived quarter differ, the
  one closest to the previous quarter is kept (avoids recast artifacts).
"""

from __future__ import annotations

import datetime as dt
import math

from . import config as C

Fact = list  # [start, end, v_orig, v_latest, filed_orig, filed_latest]


def _d(x: int) -> dt.date:
    x = int(x)
    return dt.date(x // 10000, (x // 100) % 100, x % 100)


def _label_mid(e: dt.date) -> tuple[int, int]:
    m = e - dt.timedelta(days=45)
    return (m.year, (m.month - 1) // 3 + 1)


class _Company:
    def __init__(self, raw: dict[str, list[Fact]]):
        self.facts: dict[str, dict] = {}
        for tag, arr in raw.items():
            m = {}
            for s, e, vo, vl, *_ in arr:
                m[(_d(s) if s else None, _d(e))] = (vo, vl)
            self.facts[tag] = m
        ys = set()
        for m in self.facts.values():
            for (s, e) in m:
                if s and (e - s).days > 150:
                    ys.add(s)
        self.year_starts = sorted(ys)

    def qlabel(self, s: dt.date, e: dt.date) -> tuple[int, int]:
        cands = [y for y in self.year_starts if e - dt.timedelta(days=380) < y <= e - dt.timedelta(days=60)]
        if not cands:
            return _label_mid(e)
        start = max(cands)
        n = min(4, max(1, round((e - start).days / 91.3)))
        s7 = start + dt.timedelta(days=7)
        mm = s7.month + 3 * (n - 1) + 1
        yy = s7.year + (mm - 1) // 12
        mm = (mm - 1) % 12 + 1
        return (yy, (mm - 1) // 3 + 1)

    def quarters(self, tag: str, avg: bool = False) -> dict:
        m = self.facts.get(tag)
        if not m:
            return {}
        annual: dict = {}
        for (s, e), (vo, vl) in m.items():
            if s is not None and (e - s).days > 340:
                annual.setdefault(e, set()).update([vo, vl])
        out, der, by_start = {}, {}, {}
        for (s, e), (vo, vl) in m.items():
            if s is None:
                continue
            du = (e - s).days
            if 75 <= du <= 120:
                if (not avg) and vo in annual.get(e, ()):
                    continue
                out[e] = (s, vo)
            by_start.setdefault(s, []).append((e, vo, vl))
        for s, lst in by_start.items():
            lst.sort()
            for i in range(len(lst)):
                for j in range(i):
                    e2, v2o, v2l = lst[i]
                    e1, v1o, v1l = lst[j]
                    gap = (e2 - e1).days
                    if 75 <= gap <= 120 and e2 not in out and e2 not in der:
                        if avg:
                            k2 = round((e2 - s).days / 91.3)
                            k1 = round((e1 - s).days / 91.3)
                            der[e2] = (e1 + dt.timedelta(days=1), k2 * v2o - k1 * v1o, k2 * v2l - k1 * v1l)
                        else:
                            der[e2] = (e1 + dt.timedelta(days=1), v2o - v1o, v2l - v1l)
        allq = {e: v for e, (s, v) in out.items()}
        for e, (s, qo, ql) in der.items():
            allq[e] = qo
        ends = sorted(allq)
        for e, (s, qo, ql) in der.items():
            v = qo
            if ql != qo:
                prev = [x for x in ends if x < e]
                ref = allq[prev[-1]] if prev else None
                if ref and ref > 0:
                    cand = [x for x in (qo, ql) if x > 0]
                    if cand:
                        v = min(cand, key=lambda x: abs(math.log(x / ref)))
                elif qo <= 0 < ql:
                    v = ql
            out[e] = (s, v)
        return {self.qlabel(s, e): (v, e) for e, (s, v) in out.items()}

    def instants(self, tag: str) -> dict:
        m = self.facts.get(tag)
        if not m:
            return {}
        return {e: v[0] for (s, e), v in m.items() if s is None}


def _mx(qs: dict, tags: list[str], lab) -> float | None:
    vals = [qs[t][lab][0] for t in tags if t in qs and lab in qs[t] and qs[t][lab][0] is not None]
    return max(vals) if vals else None


def _first(qs: dict, tags: list[str], lab) -> float | None:
    for t in tags:
        if lab in qs.get(t, {}):
            return qs[t][lab][0]
    return None


_FLOW_TAGS = sorted(set(
    C.REV + C.COGS + C.DA + C.INT + C.CAPEX + C.PRETAX + C.BUYBACK + C.DIVIDEND
    + C.DEBT_ISS + C.DEBT_ISS_PARTS + C.DEBT_REP + C.DEBT_REP_PARTS + C.DEBT_NET_ST + [
        "GrossProfit", "RevenuesNetOfInterestExpense", "InterestIncomeExpenseNet", "NoninterestIncome",
        "SalesRevenueGoodsNet", "SalesRevenueServicesNet", "OperatingIncomeLoss", "IncomeTaxExpenseBenefit",
        "NetIncomeLoss", "Depreciation", "AmortizationOfIntangibleAssets",
        "NetCashProvidedByUsedInOperatingActivities", "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations",
        "PaymentsForCapitalImprovements", "ProceedsFromShortTermDebt", "RepaymentsOfShortTermDebt",
        "ProceedsFromRepaymentsOfLongTermDebtAndCapitalSecurities", "ProceedsFromRepaymentsOfDebt",
        "ProceedsFromIssuanceOfCommonStock", "ProceedsFromStockOptionsExercised", "ShareBasedCompensation",
        "AllocatedShareBasedCompensationExpense", "EarningsPerShareDiluted", "EarningsPerShareBasic",
    ]))


def derive_company(raw: dict[str, list[Fact]], sector: str, quarters: list[tuple[int, int]]) -> dict:
    """Return {(y, q): {metric: value}} for every quarter in ``quarters``."""
    co = _Company(raw)
    fin = sector == "Financials"
    qs = {t: co.quarters(t) for t in _FLOW_TAGS}
    for t in C.SHARE_AVG:
        qs[t] = co.quarters(t, avg=True)

    lab2end = {}
    for t in qs:
        for lab, (v, e) in qs[t].items():
            lab2end.setdefault(lab, e)
    end2lab = {e: lab for lab, e in lab2end.items()}

    def ilab(e: dt.date):
        for dd in range(0, 11):
            for sg in (1, -1):
                x = e + dt.timedelta(days=sg * dd)
                if x in end2lab:
                    return end2lab[x]
        return _label_mid(e)

    inst = {}
    for t in C.INSTANT:
        m = {}
        for e, v in co.instants(t).items():
            lab = ilab(e)
            if lab not in m or e > m[lab][1]:
                m[lab] = (v, e)
        inst[t] = {k: v for k, (v, e) in m.items()}

    res = {}
    for lab in quarters:
        r: dict = {}
        if fin:
            v = _first(qs, ["RevenuesNetOfInterestExpense"], lab)
            if v is None:
                k = _first(qs, ["InterestIncomeExpenseNet"], lab)
                n = _first(qs, ["NoninterestIncome"], lab)
                if k is not None and n is not None:
                    v = k + n
            if v is None:
                v = _first(qs, ["Revenues"], lab)
            if v is None:
                v = _mx(qs, C.REV, lab)
        else:
            v = _mx(qs, C.REV, lab)
            if v is None:
                a = _first(qs, ["SalesRevenueGoodsNet"], lab)
                b = _first(qs, ["SalesRevenueServicesNet"], lab)
                if a is not None or b is not None:
                    v = (a or 0) + (b or 0)
        r["rev"] = v
        if not fin:
            c = _mx(qs, C.COGS, lab)
            if c is None:
                gp = _first(qs, ["GrossProfit"], lab)
                if gp is not None and v is not None:
                    c = v - gp
            r["cogs"] = c
        ebit = _first(qs, ["OperatingIncomeLoss"], lab)
        da = _mx(qs, C.DA, lab)
        if da is None:
            a = _first(qs, ["Depreciation"], lab)
            b = _first(qs, ["AmortizationOfIntangibleAssets"], lab)
            if a is not None:
                da = a + (b or 0)
        intr = _mx(qs, C.INT, lab)
        pre = _first(qs, C.PRETAX, lab)
        if not fin:
            if ebit is None and pre is not None:
                ebit = pre + (intr or 0)
                r["ebit_proxy"] = 1
            r["ebit"] = ebit
            r["da"] = da
            r["ebitda"] = (ebit + da) if (ebit is not None and da is not None) else None
        r["int"] = intr
        r["pretax"] = pre
        r["tax"] = _first(qs, ["IncomeTaxExpenseBenefit"], lab)
        r["ni"] = _first(qs, ["NetIncomeLoss"], lab)
        r["cfo"] = _first(qs, ["NetCashProvidedByUsedInOperatingActivities",
                               "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations"], lab)
        cx = _mx(qs, C.CAPEX, lab)
        if cx is None:
            cx = _first(qs, ["PaymentsForCapitalImprovements"], lab)
        r["capex"] = cx
        if not fin:
            def g(t):
                return inst[t].get(lab)
            if g("DebtLongtermAndShorttermCombinedAmount") is not None:
                debt = g("DebtLongtermAndShorttermCombinedAmount")
            else:
                nc = g("LongTermDebtNoncurrent") if g("LongTermDebtNoncurrent") is not None else g("LongTermDebtAndCapitalLeaseObligations")
                st = sum(x for x in [g("ShortTermBorrowings"), g("CommercialPaper"), g("OtherShortTermBorrowings")] if x)
                if nc is not None:
                    if g("DebtCurrent") is not None:
                        cur = g("DebtCurrent")
                    else:
                        cur = (g("LongTermDebtCurrent") or g("LongTermDebtAndCapitalLeaseObligationsCurrent") or 0) + st
                    debt = nc + cur
                elif g("LongTermDebt") is not None:
                    debt = g("LongTermDebt") + st
                else:
                    debt = None
            cash = None
            for t in ["CashAndCashEquivalentsAtCarryingValue",
                      "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents", "Cash"]:
                if g(t) is not None:
                    cash = g(t)
                    break
            sti = g("ShortTermInvestments") if g("ShortTermInvestments") is not None else g("MarketableSecuritiesCurrent")
            r["debt"] = debt
            r["cash"] = (cash + (sti or 0)) if cash is not None else None
            r["nd"] = (debt - r["cash"]) if (debt is not None and r["cash"] is not None) else None
        r["buyback"] = _mx(qs, C.BUYBACK, lab)
        r["div"] = _mx(qs, C.DIVIDEND, lab)

        def fam(total, comps):
            v_ = _mx(qs, total, lab)
            if v_ is not None:
                return v_
            cs = [_first(qs, [t], lab) for t in comps]
            cs = [c_ for c_ in cs if c_ is not None]
            return sum(cs) if cs else None

        iss = fam(C.DEBT_ISS, C.DEBT_ISS_PARTS)
        rep = fam(C.DEBT_REP, C.DEBT_REP_PARTS)
        stn = [_first(qs, [t], lab) for t in C.DEBT_NET_ST]
        stp = _first(qs, ["ProceedsFromShortTermDebt"], lab)
        strp = _first(qs, ["RepaymentsOfShortTermDebt"], lab)
        st = sum(x for x in stn if x is not None) + (stp or 0) - (strp or 0)
        hasst = any(x is not None for x in stn + [stp, strp])
        ltnet = _first(qs, ["ProceedsFromRepaymentsOfLongTermDebtAndCapitalSecurities"], lab)
        if iss is not None or rep is not None:
            r["debt_iss"], r["debt_rep"] = iss, rep
            r["debt_net"] = (iss or 0) - (rep or 0) + st
        elif ltnet is not None or hasst:
            r["debt_iss"] = r["debt_rep"] = None
            r["debt_net"] = (ltnet or 0) + st
        else:
            r["debt_iss"] = r["debt_rep"] = None
            r["debt_net"] = _first(qs, ["ProceedsFromRepaymentsOfDebt"], lab)
        r["eq_iss"] = _first(qs, ["ProceedsFromIssuanceOfCommonStock", "ProceedsFromStockOptionsExercised"], lab)
        r["sbc"] = _first(qs, ["ShareBasedCompensation", "AllocatedShareBasedCompensationExpense"], lab)
        r["sh_dil"] = _first(qs, C.SHARE_AVG, lab)
        r["eps"] = _first(qs, ["EarningsPerShareDiluted", "EarningsPerShareBasic"], lab)
        r["sh_out"] = inst["CommonStockSharesOutstanding"].get(lab)
        r["eq"] = inst["StockholdersEquity"].get(lab)
        r["eq_nci"] = inst["StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"].get(lab)
        if r["eq_nci"] is None:
            r["eq_nci"] = r["eq"]
        if r["eq"] is None:
            r["eq"] = r["eq_nci"]
        r["assets"] = inst["Assets"].get(lab)
        res[lab] = r
    return res

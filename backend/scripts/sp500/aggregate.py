"""Point-in-time S&P 500 aggregates for the frontend.

Every aggregate for quarter k uses only the companies that were in the index
in quarter k (including companies that later left). Growth rates compare
the same companies in k and k-4 and skip base breaks (revenue ratio outside
RATIO_LO..RATIO_HI).
"""

from __future__ import annotations

import statistics as st

from . import config as C


def _r(v, n=4):
    return None if v is None else round(v, n)


class Panel:
    def __init__(self, companies: list[dict], quarters: list[tuple[int, int]], bits: dict[str, str]):
        self.cos = companies
        self.Q = quarters
        self.L = [C.qlabel(q) for q in quarters]
        self.B = [[b == "1" for b in bits.get(c["cik"], "0" * len(quarters))] for c in companies]

    # -- helpers -------------------------------------------------------
    def m(self, i, k):
        return self.cos[i]["m"][self.Q[k]]

    def members(self, k, pred=None):
        return [i for i in range(len(self.cos)) if self.B[i][k] and (pred is None or pred(self.cos[i]))]

    def okr(self, i, k, j):
        a, b = self.m(i, k).get("rev"), self.m(i, j).get("rev")
        return bool(a and b and a > 0 and b > 0 and C.RATIO_LO < a / b < C.RATIO_HI)

    def ttm(self, i, key, k):
        v = [self.m(i, k - d).get(key) for d in range(4)]
        return None if None in v else sum(v)

    def yoy(self, k, key, pool):
        a = b = 0.0
        for i in pool:
            x, p = self.m(i, k).get(key), self.m(i, k - 4).get(key)
            if x is None or p is None or not self.okr(i, k, k - 4):
                continue
            a += x
            b += p
        return (a / b - 1) if b else None

    def roic(self, i, k):
        if self.cos[i]["s"] == "Financials":
            return None
        qs = [self.m(i, k - d) for d in range(4)]
        if not all(q.get("ebit") is not None for q in qs):
            return None
        ics = []
        for kk in (k, k - 4):
            m_ = self.m(i, kk)
            if m_.get("eq_nci") is None or m_.get("debt") is None or m_.get("cash") is None:
                return None
            ics.append(m_["eq_nci"] + m_["debt"] - m_["cash"])
        if min(ics) <= 0:
            return None
        pt = [q.get("pretax") for q in qs]
        tx = [q.get("tax") for q in qs]
        t = 0.21
        if None not in pt and None not in tx and sum(pt) > 0:
            t = min(max(sum(tx) / sum(pt), 0), 0.4)
        return sum(q["ebit"] for q in qs) * (1 - t), sum(ics) / 2

    # -- coverage ------------------------------------------------------
    def coverage(self):
        rep, n = [], []
        for k in range(len(self.Q)):
            mem = self.members(k)
            n.append(len(mem))
            rep.append(sum(1 for i in mem if self.m(i, k).get("rev") is not None))
        return rep, n

    def last_complete(self):
        rep, n = self.coverage()
        for k in range(len(self.Q) - 1, -1, -1):
            if n[k] and rep[k] / n[k] >= C.COMPLETE_COVERAGE:
                return k
        return len(self.Q) - 1

    # -- aggregate series ---------------------------------------------
    def aggregate(self, QA):
        out: dict[str, list] = {}

        def put(name, v):
            out.setdefault(name, []).append(v)

        not_fin = lambda c: c["s"] != "Financials"
        not_en = lambda c: c["s"] != "Energy"
        for k in QA:
            mem = self.members(k)
            nf = [i for i in mem if not_fin(self.cos[i])]
            put("n", len(mem))
            if k >= 4:
                ne = [i for i in mem if not_en(self.cos[i])]
                put("revenue_yoy", self.yoy(k, "rev", mem))
                put("revenue_yoy_ex_energy", self.yoy(k, "rev", ne))
                put("revenue_yoy_ex_mag7", self.yoy(k, "rev", [i for i in mem if self.cos[i]["t"] not in C.MAG7]))
                put("ebit_yoy", self.yoy(k, "ebit", nf))
                put("ebit_yoy_ex_energy", self.yoy(k, "ebit", [i for i in nf if not_en(self.cos[i])]))
                put("net_income_yoy", self.yoy(k, "ni", mem))
                eg, sh, rg = [], [], []
                for i in mem:
                    e, p = self.m(i, k).get("eps"), self.m(i, k - 4).get("eps")
                    if e is not None and p is not None and p > 0:
                        eg.append(e / p - 1)
                    s, ps = self.m(i, k).get("sh_dil"), self.m(i, k - 4).get("sh_dil")
                    if s and ps and ps > 0 and 0.5 < s / ps < 2:
                        sh.append(s / ps - 1)
                    if not_en(self.cos[i]) and self.okr(i, k, k - 4):
                        rg.append(self.m(i, k)["rev"] / self.m(i, k - 4)["rev"] - 1)
                put("eps_yoy_median", st.median(eg) if eg else None)
                put("shares_yoy_median", st.median(sh) if sh else None)
                put("pct_reducing_shares", sum(1 for x in sh if x < 0) / len(sh) if sh else None)
                put("revenue_yoy_median_ex_energy", st.median(rg) if rg else None)
                put("pct_revenue_growth_gt10_ex_energy", sum(1 for x in rg if x > 0.10) / len(rg) if rg else None)
            else:
                for nm in ("revenue_yoy", "revenue_yoy_ex_energy", "revenue_yoy_ex_mag7", "ebit_yoy",
                           "ebit_yoy_ex_energy", "net_income_yoy", "eps_yoy_median", "shares_yoy_median",
                           "pct_reducing_shares", "revenue_yoy_median_ex_energy", "pct_revenue_growth_gt10_ex_energy"):
                    put(nm, None)
            if k >= 3:
                R = eb = ea = ni = 0.0
                for i in nf:
                    qs = [self.m(i, k - d) for d in range(4)]
                    if any(q.get(z) is None for q in qs for z in ("rev", "ebit", "da", "ni")):
                        continue
                    rv = sum(q["rev"] for q in qs)
                    if rv <= 0:
                        continue
                    R += rv
                    eb += sum(q["ebit"] for q in qs)
                    ea += sum(q["ebit"] + q["da"] for q in qs)
                    ni += sum(q["ni"] for q in qs)
                ND = EB = ND2 = EB2 = 0.0
                rat = []
                for i in nf:
                    if self.cos[i]["s"] == "Real Estate":
                        continue
                    nd = self.m(i, k).get("nd")
                    qs2 = [self.m(i, k - d) for d in range(4)]
                    if nd is None or any(q.get("ebit") is None or q.get("da") is None for q in qs2):
                        continue
                    e = sum(q["ebit"] + q["da"] for q in qs2)
                    if e <= 0:
                        continue
                    ND += nd
                    EB += e
                    rat.append(nd / e)
                    if self.cos[i]["t"] not in C.MAG7:
                        ND2 += nd
                        EB2 += e
                put("nd_ebitda", ND / EB if EB else None)
                put("nd_ebitda_ex_mag7", ND2 / EB2 if EB2 else None)
                put("nd_ebitda_median", st.median(rat) if rat else None)
                put("pct_nd_ebitda_gt3", sum(1 for x in rat if x > 3) / len(rat) if rat else None)
                put("ebitda_margin", ea / R if R else None)
                put("ebit_margin", eb / R if R else None)
                put("net_margin", ni / R if R else None)
            else:
                for nm in ("nd_ebitda", "nd_ebitda_ex_mag7", "nd_ebitda_median", "pct_nd_ebitda_gt3",
                           "ebitda_margin", "ebit_margin", "net_margin"):
                    put(nm, None)
            if k >= 4:
                NI = EQ = NO = IC = NO2 = IC2 = 0.0
                roes, roics = [], []
                for i in mem:
                    qs3 = [self.m(i, k - d) for d in range(4)]
                    e1, e0 = self.m(i, k).get("eq"), self.m(i, k - 4).get("eq")
                    if all(q.get("ni") is not None for q in qs3) and e1 and e0 and e1 > 0 and e0 > 0:
                        n_ = sum(q["ni"] for q in qs3)
                        ae = (e1 + e0) / 2
                        NI += n_
                        EQ += ae
                        roes.append(n_ / ae)
                    rr = self.roic(i, k)
                    if rr:
                        nop, ic = rr
                        NO += nop
                        IC += ic
                        roics.append(nop / ic)
                        if self.cos[i]["t"] not in C.MAG7:
                            NO2 += nop
                            IC2 += ic
                put("roe", NI / EQ if EQ else None)
                put("roe_median", st.median(roes) if roes else None)
                put("roic", NO / IC if IC else None)
                put("roic_ex_mag7", NO2 / IC2 if IC2 else None)
                put("roic_median", st.median(roics) if roics else None)
            else:
                for nm in ("roe", "roe_median", "roic", "roic_ex_mag7", "roic_median"):
                    put(nm, None)
            bb = sum((self.m(i, k).get("buyback") or 0) for i in mem) / 1e9
            dv = sum((self.m(i, k).get("div") or 0) for i in mem) / 1e9
            put("buybacks_bn", bb)
            put("dividends_bn", dv)
            put("shareholder_return_bn", bb + dv)
            put("sbc_bn", sum((self.m(i, k).get("sbc") or 0) for i in mem) / 1e9)
            put("net_debt_issuance_bn", sum((self.m(i, k).get("debt_net") or 0) for i in nf) / 1e9)
            put("fcf_bn", sum(((self.m(i, k).get("cfo") or 0) - (self.m(i, k).get("capex") or 0))
                              for i in nf if self.m(i, k).get("cfo") is not None) / 1e9)
        return {k: [_r(x) for x in v] for k, v in out.items()}

    # -- sectors -------------------------------------------------------
    def sectors(self, QA):
        res = {}
        for s in C.SECTORS:
            g, mg, ro = [], [], []
            for k in QA:
                mem = self.members(k, lambda c: c["s"] == s)
                g.append(_r(self.yoy(k, "rev", mem)) if k >= 4 else None)
                if k >= 3 and s != "Financials":
                    R = eb = 0.0
                    for i in mem:
                        qs = [self.m(i, k - d) for d in range(4)]
                        if any(q.get("rev") is None or q.get("ebit") is None for q in qs):
                            continue
                        rv = sum(q["rev"] for q in qs)
                        if rv <= 0:
                            continue
                        R += rv
                        eb += sum(q["ebit"] for q in qs)
                    mg.append(_r(eb / R) if R else None)
                else:
                    mg.append(None)
                if k >= 4 and s != "Financials":
                    NO = IC = 0.0
                    for i in mem:
                        rr = self.roic(i, k)
                        if rr:
                            NO += rr[0]
                            IC += rr[1]
                    ro.append(_r(NO / IC) if IC else None)
                else:
                    ro.append(None)
            res[s] = {"revenue_yoy": g, "ebit_margin": mg, "roic": ro}
        return res

    # -- decomposition of ex-energy revenue growth ----------------------
    def group_of(self, i, k):
        c = self.cos[i]
        if c["t"] in C.MAG7:
            return "mag7"
        if c["t"] in C.AI_CHAIN:
            return "ai"
        if c["s"] == "Financials":
            return "fin"
        x, p = self.m(i, k)["rev"], self.m(i, k - 4)["rev"]
        if abs(x / p - 1) > C.OUTLIER_GROWTH:
            return "ma"
        return "core"

    def decomposition(self, QA):
        groups = [("core", "Core (everything else)"), ("fin", "Financials"), ("mag7", "Magnificent 7"),
                  ("ai", "AI supply chain"), ("ma", "M&A and base effects")]
        out = {"groups": [{"key": g, "name": n} for g, n in groups],
               "share": {g: [] for g, _ in groups}, "growth": {g: [] for g, _ in groups},
               "contribution": {g: [] for g, _ in groups}, "total": [], "movers": []}
        for k in QA:
            if k < 4:
                for g, _ in groups:
                    for f in ("share", "growth", "contribution"):
                        out[f][g].append(None)
                out["total"].append(None)
                out["movers"].append(None)
                continue
            pool = [i for i in self.members(k, lambda c: c["s"] != "Energy") if self.okr(i, k, k - 4)]
            base = sum(self.m(i, k - 4)["rev"] for i in pool)
            acc = {g: [0.0, 0.0] for g, _ in groups}
            for i in pool:
                g = self.group_of(i, k)
                acc[g][0] += self.m(i, k)["rev"]
                acc[g][1] += self.m(i, k - 4)["rev"]
            tot = 0.0
            for g, _ in groups:
                x, p = acc[g]
                out["share"][g].append(_r(p / base) if base else None)
                out["growth"][g].append(_r(x / p - 1) if p else None)
                c_ = (x - p) / base if base else None
                out["contribution"][g].append(_r(c_))
                tot += c_ or 0
            out["total"].append(_r(tot))
            mv = sorted(((self.cos[i]["t"], self.group_of(i, k),
                          (self.m(i, k)["rev"] - self.m(i, k - 4)["rev"]) / base,
                          self.m(i, k)["rev"] / self.m(i, k - 4)["rev"] - 1) for i in pool),
                        key=lambda z: -abs(z[2]))[:15]
            out["movers"].append([[t, g, _r(c_, 5), _r(gr)] for t, g, c_, gr in mv])
        return out

    # -- per-company table ---------------------------------------------
    def contributions(self, kL):
        def one(key, fin=True):
            d = []
            for i in self.members(kL):
                c = self.cos[i]
                if not fin and c["s"] == "Financials":
                    continue
                x, p = self.m(i, kL).get(key), self.m(i, kL - 4).get(key)
                if x is None or p is None or not self.okr(i, kL, kL - 4):
                    continue
                d.append([c["t"], c["n"], round((x - p) / 1e9, 2)])
            d.sort(key=lambda z: -z[2])
            return {"top": d[:12], "bottom": d[-6:][::-1], "total": round(sum(z[2] for z in d), 1)}
        return {"revenue": one("rev"), "ebit": one("ebit", False)}

    def companies(self, QA):
        res = []
        for i, c in enumerate(self.cos):
            if not c.get("current"):
                continue
            L = None
            for k in range(len(self.Q) - 1, 2, -1):
                if all(self.m(i, k - d).get("rev") is not None for d in range(4)):
                    L = k
                    break
            if L is None:
                continue
            rv = self.ttm(i, "rev", L)
            rp = self.ttm(i, "rev", L - 4) if L >= 7 else None
            eb, da, ni = self.ttm(i, "ebit", L), self.ttm(i, "da", L), self.ttm(i, "ni", L)
            cfo, cx = self.ttm(i, "cfo", L), self.ttm(i, "capex", L)
            bb, dv = self.ttm(i, "buyback", L), self.ttm(i, "div", L)
            ebitda = eb + da if eb is not None and da is not None else None
            nd = self.m(i, L).get("nd")
            sh, shp = self.m(i, L).get("sh_dil"), (self.m(i, L - 4).get("sh_dil") if L >= 4 else None)
            fcf = cfo - cx if cfo is not None and cx is not None else None
            ret = (bb or 0) + (dv or 0) if (bb is not None or dv is not None) else None
            e1, e0 = self.m(i, L).get("eq"), (self.m(i, L - 4).get("eq") if L >= 4 else None)
            rr = self.roic(i, L) if L >= 4 else None
            mm = lambda v: None if v is None else round(v / 1e6)
            fin = c["s"] == "Financials"
            res.append({
                "ticker": c["t"], "name": c["n"], "sector": c["s"], "last_quarter": self.L[L],
                "revenue_ttm": mm(rv),
                "revenue_growth": None if not rp or rp <= 0 or rv is None else _r(rv / rp - 1),
                "op_margin": None if eb is None or fin or not rv or rv <= 0 else _r(eb / rv),
                "net_margin": None if ni is None or not rv or rv <= 0 else _r(ni / rv),
                "fcf_ttm": mm(fcf), "shareholder_return_ttm": mm(ret),
                "return_to_fcf": None if not fcf or fcf <= 0 or ret is None else _r(ret / fcf, 3),
                "share_change": None if not sh or not shp else _r(sh / shp - 1),
                "nd_ebitda": None if nd is None or not ebitda or ebitda <= 0 or c["s"] in ("Financials", "Real Estate") else round(nd / ebitda, 2),
                "roe": None if ni is None or not e1 or not e0 or e1 <= 0 or e0 <= 0 else _r(ni / ((e1 + e0) / 2)),
                "roic": _r(rr[0] / rr[1]) if rr else None,
                "member_since": "" if self.B[i][0] else next((self.L[k] for k in range(len(self.Q)) if self.B[i][k]), ""),
                "series": {key: [mm(self.m(i, k).get(key)) for k in QA] for key in ("rev", "ebit", "ni")},
            })
        res.sort(key=lambda r: -(r["revenue_ttm"] or 0))
        return res

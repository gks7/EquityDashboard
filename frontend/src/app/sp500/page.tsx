"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Landmark, RefreshCcw, Search, ChevronDown, ChevronRight, Clock } from "lucide-react";
import {
  type GroupKey,
  type Num,
  type Sp500Company,
  type Sp500Payload,
  GROUP_COLOR,
  bn,
  mult,
  pct,
  pp,
  qLong,
  usdM,
} from "@/lib/sp500";
import { Card, Kpi, QuarterChart, Segmented, type Series, usePalette } from "@/components/sp500/charts";

type Tab = "growth" | "why" | "profit" | "capital" | "sectors" | "companies";
const TABS: { key: Tab; label: string }[] = [
  { key: "growth", label: "Growth" },
  { key: "why", label: "Growth vs GDP" },
  { key: "profit", label: "Margins & returns" },
  { key: "capital", label: "Capital & leverage" },
  { key: "sectors", label: "Sectors" },
  { key: "companies", label: "Companies" },
];

const formatRelative = (iso: string) => {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr${hrs === 1 ? "" : "s"} ago`;
  const days = Math.round(hrs / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
};

const last = (a: Num[] | undefined) => (a && a.length ? a[a.length - 1] : null);
const yearAgo = (a: Num[] | undefined) => (a && a.length > 4 ? a[a.length - 5] : null);

export default function Sp500Page() {
  const [data, setData] = useState<Sp500Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<Tab>("growth");

  const load = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const r = await fetch(`/data/sp500.json?ts=${Date.now()}`, { cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setData(await r.json());
    } catch (e) {
      setError(String(e));
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (error) {
    return (
      <div className="max-w-7xl mx-auto pb-12">
        <div className="p-4 rounded-lg border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-900/20 text-sm text-rose-700 dark:text-rose-300">
          Failed to load S&amp;P 500 data: {error}
        </div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="max-w-7xl mx-auto pb-12 animate-pulse">
        <div className="h-7 w-48 bg-slate-200 dark:bg-slate-800 rounded mb-2" />
        <div className="h-4 w-96 bg-slate-200 dark:bg-slate-800 rounded mb-6" />
        <div className="h-20 bg-slate-200 dark:bg-slate-800 rounded-xl mb-4" />
        <div className="h-[360px] bg-slate-200 dark:bg-slate-800 rounded-xl" />
      </div>
    );
  }

  const A = data.aggregate;
  const prog = data.in_progress[0];

  return (
    <div className="max-w-7xl mx-auto pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-blue-500/10 text-blue-500">
              <Landmark className="w-4 h-4" />
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">S&amp;P 500 Fundamentals</h1>
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[12px] font-semibold ring-1 ring-blue-500/30 text-blue-600 dark:text-blue-400 bg-blue-500/5">
              Latest full quarter: {qLong(data.as_of_quarter)}
            </span>
            {prog && (
              <span
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-medium ring-1 ring-slate-300 dark:ring-slate-700 text-slate-600 dark:text-slate-400"
                title="Headline figures switch to this quarter once 90% of members have reported"
              >
                <Clock className="w-3.5 h-3.5" />
                {qLong(prog.quarter)}: {prog.reported} of {prog.members} reported
              </span>
            )}
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-3xl">
            Quarterly financials of every S&amp;P 500 member from SEC filings, aggregated with the index composition of each
            quarter (companies that later left are included). Updated nightly.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden sm:flex flex-col items-end text-[11px] leading-tight">
            <span className="text-slate-400 dark:text-slate-500">Last refreshed</span>
            <span className="text-slate-700 dark:text-slate-300 font-medium tabular-nums" title={new Date(data.generated_at).toLocaleString()}>
              {formatRelative(data.generated_at)}
            </span>
          </div>
          <button
            onClick={load}
            disabled={refreshing}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"
          >
            <RefreshCcw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-px bg-slate-200 dark:bg-slate-800 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 mb-5">
        <KpiDelta label="Revenue YoY" v={last(A.revenue_yoy)} prev={yearAgo(A.revenue_yoy)} f="pct" />
        <KpiDelta label="Rev. YoY ex-energy" v={last(A.revenue_yoy_ex_energy)} prev={last(data.macro.gdp_nominal_yoy)} f="pct" vsLabel="GDP" />
        <KpiDelta label="EBIT YoY" v={last(A.ebit_yoy)} prev={yearAgo(A.ebit_yoy)} f="pct" />
        <KpiDelta label="EPS YoY (median)" v={last(A.eps_yoy_median)} prev={yearAgo(A.eps_yoy_median)} f="pct" />
        <KpiDelta label="EBIT margin TTM" v={last(A.ebit_margin)} prev={yearAgo(A.ebit_margin)} f="pct" />
        <KpiDelta label="ROIC TTM" v={last(A.roic)} prev={yearAgo(A.roic)} f="pct" />
        <KpiDelta label="Net debt / EBITDA" v={last(A.nd_ebitda)} prev={yearAgo(A.nd_ebitda)} f="x" invert />
        <Kpi
          label="Cash returned (qtr)"
          value={bn(last(A.shareholder_return_bn))}
          sub={`buybacks ${bn(last(A.buybacks_bn))}`}
        />
      </div>

      <div className="flex flex-wrap gap-1 mb-4 border-b border-slate-200 dark:border-slate-800">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-2 text-sm font-medium -mb-px border-b-2 transition-colors ${
              tab === t.key
                ? "border-blue-500 text-blue-600 dark:text-blue-400"
                : "border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-slate-200"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "growth" && <GrowthTab d={data} />}
      {tab === "why" && <WhyTab d={data} />}
      {tab === "profit" && <ProfitTab d={data} />}
      {tab === "capital" && <CapitalTab d={data} />}
      {tab === "sectors" && <SectorsTab d={data} />}
      {tab === "companies" && <CompaniesTab d={data} />}

      <footer className="mt-6 text-[11.5px] text-slate-500 dark:text-slate-400 leading-relaxed max-w-4xl">
        <p>
          Sources: SEC EDGAR XBRL (10-Q and 10-K; filings not yet in the SEC&rsquo;s companyfacts API are read from the filing
          itself), Wikipedia index changes, FRED (nominal GDP, broad dollar index). Fiscal quarters are mapped to calendar
          quarters; Q4 is derived as full year minus nine months. Growth compares the same companies a year apart and skips
          base breaks (revenue more than tripling or falling by two thirds). EBIT, margins, net debt and ROIC exclude
          financials; leverage also excludes REITs. {data.stats.companies_loaded} companies loaded
          {data.stats.patched_from_filings ? `, ${data.stats.patched_from_filings} read directly from recent filings` : ""}.
        </p>
      </footer>
    </div>
  );
}

function KpiDelta({ label, v, prev, f, invert, vsLabel }: { label: string; v: Num; prev: Num; f: "pct" | "x"; invert?: boolean; vsLabel?: string }) {
  const val = f === "pct" ? pct(v) : mult(v);
  let sub: string | undefined;
  let tone: "up" | "down" | null = null;
  if (v !== null && prev !== null) {
    const d = v - prev;
    sub = f === "pct" ? `${pp(d)} vs ${vsLabel ?? "yr ago"}` : `${d >= 0 ? "+" : ""}${d.toFixed(2)}x vs yr ago`;
    tone = Math.abs(d) < 1e-9 ? null : (d > 0) !== !!invert ? "up" : "down";
  }
  return <Kpi label={label} value={val} sub={sub} tone={tone} />;
}

/* ------------------------------------------------------------------ Growth */
function GrowthTab({ d }: { d: Sp500Payload }) {
  const p = usePalette();
  const [basis, setBasis] = useState<"ex" | "all">("ex");
  const A = d.aggregate;
  const gdp = d.macro.gdp_nominal_yoy ?? [];
  const rev: Series = basis === "ex"
    ? { key: "r", name: "Revenue, ex-energy", values: A.revenue_yoy_ex_energy, color: p.s1, width: 2.5 }
    : { key: "r", name: "Revenue, all members", values: A.revenue_yoy, color: p.s1, width: 2.5 };
  const ebit: Series = basis === "ex"
    ? { key: "e", name: "EBIT, ex-energy & fin.", values: A.ebit_yoy_ex_energy, color: p.s2 }
    : { key: "e", name: "EBIT, ex-fin.", values: A.ebit_yoy, color: p.s2 };
  const seg = <Segmented value={basis} onChange={setBasis} options={[{ key: "ex", label: "Ex-energy" }, { key: "all", label: "All" }]} />;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card
        className="lg:col-span-2"
        title="Revenue growth vs nominal GDP"
        subtitle="Year-over-year, same companies both years"
        right={seg}
        foot="Energy revenue follows oil and gas prices, so the ex-energy line is the better comparison with the economy."
      >
        <QuarterChart
          quarters={d.quarters}
          from={4}
          fmt="pct"
          height={300}
          series={[rev, { key: "g", name: "US nominal GDP", values: gdp, color: p.ink, dash: true }]}
        />
      </Card>
      <Card title="Earnings growth" subtitle="Year-over-year, since 2022 (2021 rebound off the Covid base runs above 200%)" right={seg}>
        <QuarterChart
          quarters={d.quarters}
          from={12}
          fmt="pct"
          series={[ebit, { key: "n", name: "Net income", values: A.net_income_yoy, color: p.s3 }, { key: "m", name: "EPS, median company", values: A.eps_yoy_median, color: p.s4 }]}
        />
      </Card>
      <Card title="Breadth" subtitle="Ex-energy: is growth concentrated or broad?">
        <QuarterChart
          quarters={d.quarters}
          from={4}
          fmt="pct"
          series={[
            { key: "md", name: "Median company revenue growth", values: A.revenue_yoy_median_ex_energy, color: p.s1 },
            { key: "gt", name: "Share of companies growing >10%", values: A.pct_revenue_growth_gt10_ex_energy, color: p.s2 },
          ]}
        />
      </Card>
      <ContribCard d={d} />
    </div>
  );
}

function ContribCard({ d }: { d: Sp500Payload }) {
  const [k, setK] = useState<"revenue" | "ebit">("revenue");
  const c = d.contributions[k];
  const max = Math.max(...c.top.map((x) => Math.abs(x[2])), ...c.bottom.map((x) => Math.abs(x[2])), 1);
  const Row = ({ r }: { r: [string, string, number] }) => (
    <div className="grid grid-cols-[56px_1fr_64px] items-center gap-2 text-[12px] py-0.5">
      <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">{r[0]}</span>
      <div className="h-2.5 rounded-sm bg-slate-100 dark:bg-slate-800 overflow-hidden">
        <div className={`h-full rounded-sm ${r[2] >= 0 ? "bg-blue-500" : "bg-rose-500"}`} style={{ width: `${(Math.abs(r[2]) / max) * 100}%` }} />
      </div>
      <span className="tabular-nums text-right text-slate-600 dark:text-slate-400">{r[2] >= 0 ? "+" : ""}{r[2].toFixed(1)}</span>
    </div>
  );
  return (
    <Card
      className="lg:col-span-2"
      title={`Who added the most ${k === "revenue" ? "revenue" : "EBIT"} in ${qLong(d.as_of_quarter)}`}
      subtitle={`Change vs a year earlier, US$ bn. Index total: ${c.total >= 0 ? "+" : ""}${c.total.toFixed(1)}bn`}
      right={<Segmented value={k} onChange={setK} options={[{ key: "revenue", label: "Revenue" }, { key: "ebit", label: "EBIT" }]} />}
    >
      <div className="grid md:grid-cols-2 gap-x-8 gap-y-3 px-2 pb-2">
        <div>
          <div className="text-[10.5px] uppercase tracking-wider text-slate-500 mb-1">Largest increases</div>
          {c.top.map((r) => <Row key={r[0]} r={r} />)}
        </div>
        <div>
          <div className="text-[10.5px] uppercase tracking-wider text-slate-500 mb-1">Largest decreases</div>
          {c.bottom.map((r) => <Row key={r[0]} r={r} />)}
        </div>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------ Growth vs GDP */
function WhyTab({ d }: { d: Sp500Payload }) {
  const p = usePalette();
  const D = d.decomposition;
  const col = GROUP_COLOR(p);
  const n = d.quarters.length;
  const [qi, setQi] = useState(n - 1);
  const order: GroupKey[] = ["core", "fin", "mag7", "ai", "ma"];
  const name = (g: GroupKey) => D.groups.find((x) => x.key === g)?.name ?? g;
  const gdp = d.macro.gdp_nominal_yoy ?? [];
  const series: Series[] = [
    ...order.map((g) => ({ key: g, name: name(g), values: D.contribution[g], color: col[g], kind: "bar" as const, stack: "c" })),
    { key: "tot", name: "Revenue growth, ex-energy", values: D.total, color: p.ink, width: 2 },
    { key: "gdp", name: "US nominal GDP", values: gdp, color: p.axis, dash: true },
  ];
  const core = D.growth.core[qi];
  const movers = D.movers[qi] ?? [];
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <Card
        className="lg:col-span-3"
        title="Where revenue growth comes from"
        subtitle="Contribution to ex-energy revenue growth, percentage points. Contribution = weight in revenue × the group's growth."
        foot={
          <>
            <b className="text-slate-700 dark:text-slate-300">Core</b> is everything outside the four groups: about two thirds
            of revenue. When it grows in line with GDP while the total runs ahead, the gap comes from a handful of
            companies. AI supply chain: {d.method.ai_chain.slice(0, 12).join(", ")} and others. M&amp;A and base effects:
            companies whose revenue moved more than {Math.round(d.method.outlier_growth * 100)}% in a year.
          </>
        }
      >
        <QuarterChart quarters={d.quarters} from={4} fmt="pct" height={320} series={series} />
      </Card>

      <Card
        className="lg:col-span-2"
        title={`The index as two economies, ${qLong(d.quarters[qi])}`}
        subtitle="Weight in revenue, growth and contribution by group"
        right={
          <select
            value={qi}
            onChange={(e) => setQi(Number(e.target.value))}
            className="text-[12px] rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 px-2 py-1"
            aria-label="Quarter"
          >
            {d.quarters.map((q, i) => (i >= 4 ? <option key={q} value={i}>{q}</option> : null))}
          </select>
        }
        foot={
          core !== null && gdp[qi] !== null && gdp[qi] !== undefined
            ? `Core revenue grew ${pct(core)} against nominal GDP of ${pct(gdp[qi])}.`
            : undefined
        }
      >
        <div className="overflow-x-auto px-2">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="text-slate-500 text-[11px] uppercase tracking-wider">
                <th className="text-left font-medium py-1.5">Group</th>
                <th className="text-right font-medium">Weight</th>
                <th className="text-right font-medium">Growth</th>
                <th className="text-right font-medium">Contribution</th>
                <th className="w-[30%]"></th>
              </tr>
            </thead>
            <tbody>
              {order.map((g) => {
                const c = D.contribution[g][qi] ?? 0;
                const maxC = Math.max(...order.map((x) => Math.abs(D.contribution[x][qi] ?? 0)), 0.001);
                return (
                  <tr key={g} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="py-1.5">
                      <span className="inline-flex items-center gap-2 text-slate-800 dark:text-slate-200">
                        <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: col[g] }} />
                        {name(g)}
                      </span>
                    </td>
                    <td className="text-right tabular-nums">{pct(D.share[g][qi])}</td>
                    <td className="text-right tabular-nums">{pct(D.growth[g][qi])}</td>
                    <td className="text-right tabular-nums font-semibold">{pp(c)}</td>
                    <td className="pl-3">
                      <div className="h-2 rounded-sm" style={{ width: `${(Math.abs(c) / maxC) * 100}%`, background: col[g] }} />
                    </td>
                  </tr>
                );
              })}
              <tr className="border-t-2 border-slate-300 dark:border-slate-600 font-semibold">
                <td className="py-1.5">S&amp;P 500 ex-energy</td>
                <td className="text-right">100%</td>
                <td className="text-right tabular-nums">{pct(D.total[qi])}</td>
                <td className="text-right tabular-nums">{pp(D.total[qi])}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Largest contributors" subtitle={`${qLong(d.quarters[qi])}, pp of ex-energy growth`}>
        <div className="px-2 pb-1">
          {movers.slice(0, 12).map(([t, g, c, gr]) => (
            <div key={t} className="grid grid-cols-[12px_56px_1fr_auto] items-center gap-2 text-[12px] py-0.5">
              <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: col[g] }} />
              <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">{t}</span>
              <span className="text-slate-500 tabular-nums">{pct(gr, 0)} YoY</span>
              <span className="tabular-nums font-semibold text-slate-700 dark:text-slate-300">{pp(c, 2)}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card
        className="lg:col-span-3"
        title="The dollar"
        subtitle="Broad trade-weighted US dollar index, year-over-year"
        foot="About 40% of S&P 500 revenue is earned abroad. A weaker dollar (below zero) translates the same foreign sales into more dollars and lifts reported growth."
      >
        <QuarterChart
          quarters={d.quarters}
          from={4}
          fmt="pct"
          height={200}
          series={[{ key: "usd", name: "Dollar index YoY", values: d.macro.usd_broad_yoy ?? [], color: p.s1, kind: "bar" }]}
        />
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------ Profit */
function ProfitTab({ d }: { d: Sp500Payload }) {
  const p = usePalette();
  const A = d.aggregate;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card title="Margins" subtitle="Trailing 12 months, ex-financials">
        <QuarterChart
          quarters={d.quarters}
          from={3}
          fmt="pct"
          series={[
            { key: "a", name: "EBITDA margin", values: A.ebitda_margin, color: p.s1 },
            { key: "b", name: "EBIT margin", values: A.ebit_margin, color: p.s2 },
            { key: "c", name: "Net margin", values: A.net_margin, color: p.s3 },
          ]}
        />
      </Card>
      <Card title="Return on capital" subtitle="Trailing 12 months" foot="ROE uses companies with positive equity. ROIC = EBIT × (1 − tax rate) / average (equity + debt − cash), ex-financials.">
        <QuarterChart
          quarters={d.quarters}
          from={4}
          fmt="pct"
          series={[
            { key: "roe", name: "ROE, aggregate", values: A.roe, color: p.s1 },
            { key: "roic", name: "ROIC, aggregate", values: A.roic, color: p.s2 },
            { key: "roicx", name: "ROIC ex-Mag 7", values: A.roic_ex_mag7, color: p.s3 },
            { key: "roicm", name: "ROIC, median company", values: A.roic_median, color: p.s4, dash: true },
          ]}
        />
      </Card>
    </div>
  );
}

/* ----------------------------------------------------------- Capital */
function CapitalTab({ d }: { d: Sp500Payload }) {
  const p = usePalette();
  const A = d.aggregate;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card title="Cash returned to shareholders" subtitle="Per quarter, US$ bn">
        <QuarterChart
          quarters={d.quarters}
          fmt="bn"
          series={[
            { key: "bb", name: "Buybacks", values: A.buybacks_bn, color: p.s1, kind: "bar", stack: "r" },
            { key: "dv", name: "Dividends", values: A.dividends_bn, color: p.s3, kind: "bar", stack: "r" },
            { key: "fcf", name: "Free cash flow (ex-fin.)", values: A.fcf_bn, color: p.ink },
          ]}
        />
      </Card>
      <Card title="Stock comp and net debt issuance" subtitle="Per quarter, US$ bn">
        <QuarterChart
          quarters={d.quarters}
          fmt="bn"
          series={[
            { key: "nd", name: "Net debt issuance (ex-fin.)", values: A.net_debt_issuance_bn, color: p.s2, kind: "bar" },
            { key: "sbc", name: "Stock-based compensation", values: A.sbc_bn, color: p.s4 },
          ]}
        />
      </Card>
      <Card title="Leverage" subtitle="Net debt / EBITDA TTM, ex-financials and REITs">
        <QuarterChart
          quarters={d.quarters}
          from={3}
          fmt="x"
          series={[
            { key: "a", name: "Aggregate", values: A.nd_ebitda, color: p.s1 },
            { key: "b", name: "Ex-Mag 7", values: A.nd_ebitda_ex_mag7, color: p.s2 },
            { key: "c", name: "Median company", values: A.nd_ebitda_median, color: p.s3 },
          ]}
        />
      </Card>
      <Card
        title="Share count"
        subtitle={`Diluted shares, year-over-year. ${pct(A.pct_reducing_shares[A.pct_reducing_shares.length - 1], 0)} of companies have fewer shares than a year ago.`}
      >
        <QuarterChart
          quarters={d.quarters}
          from={4}
          fmt="pct"
          legend={false}
          series={[{ key: "a", name: "Median change in share count", values: A.shares_yoy_median, color: p.s1 }]}
        />
      </Card>
    </div>
  );
}

/* ----------------------------------------------------------- Sectors */
function SectorsTab({ d }: { d: Sp500Payload }) {
  const [m, setM] = useState<"revenue_yoy" | "ebit_margin" | "roic">("revenue_yoy");
  const cols = d.quarters.map((q, i) => ({ q, i })).slice(-12);
  const S = Object.entries(d.sectors);
  const color = (v: Num) => {
    if (v === null) return "transparent";
    if (m === "revenue_yoy") {
      const a = Math.min(Math.abs(v) / 0.2, 1) * 0.75 + 0.08;
      return v >= 0 ? `rgba(42,120,214,${a})` : `rgba(227,73,72,${a})`;
    }
    const a = Math.min(Math.max(v, 0) / 0.35, 1) * 0.75 + 0.08;
    return `rgba(42,120,214,${a})`;
  };
  return (
    <Card
      title="Sectors"
      subtitle={m === "revenue_yoy" ? "Revenue growth, year-over-year" : m === "ebit_margin" ? "EBIT margin, trailing 12 months" : "ROIC, trailing 12 months"}
      right={
        <Segmented value={m} onChange={setM} options={[{ key: "revenue_yoy", label: "Revenue YoY" }, { key: "ebit_margin", label: "EBIT margin" }, { key: "roic", label: "ROIC" }]} />
      }
      foot="Sectors are GICS, point-in-time members. Financials have no EBIT margin or ROIC."
    >
      <div className="overflow-x-auto px-2 pb-1">
        <table className="text-[12px] border-separate border-spacing-[2px] min-w-[760px] w-full">
          <thead>
            <tr>
              <th className="text-left font-medium text-slate-500 pr-3">Sector</th>
              {cols.map((c) => (
                <th key={c.q} className="font-medium text-slate-500 text-[11px] tabular-nums">{c.q}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {S.map(([s, v]) => (
              <tr key={s}>
                <td className="whitespace-nowrap pr-3 text-slate-800 dark:text-slate-200">{s}</td>
                {cols.map((c) => {
                  const x = v[m][c.i];
                  return (
                    <td key={c.q} className="h-7 text-center tabular-nums rounded text-slate-900 dark:text-white" style={{ background: color(x) }} title={`${s} ${c.q}: ${pct(x)}`}>
                      {x === null ? "" : (x * 100).toFixed(0)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/* --------------------------------------------------------- Companies */
type SortKey = keyof Pick<Sp500Company, "ticker" | "revenue_ttm" | "revenue_growth" | "op_margin" | "net_margin" | "fcf_ttm" | "return_to_fcf" | "share_change" | "nd_ebitda" | "roe" | "roic">;

const COLS: { key: SortKey; label: string; f: (c: Sp500Company) => string; title?: string }[] = [
  { key: "revenue_ttm", label: "Revenue TTM", f: (c) => usdM(c.revenue_ttm) },
  { key: "revenue_growth", label: "Growth", f: (c) => pct(c.revenue_growth), title: "Revenue TTM vs a year earlier" },
  { key: "op_margin", label: "EBIT mgn", f: (c) => pct(c.op_margin) },
  { key: "net_margin", label: "Net mgn", f: (c) => pct(c.net_margin) },
  { key: "fcf_ttm", label: "FCF TTM", f: (c) => usdM(c.fcf_ttm) },
  { key: "return_to_fcf", label: "Payout/FCF", f: (c) => pct(c.return_to_fcf, 0), title: "Buybacks + dividends / free cash flow" },
  { key: "share_change", label: "Shares YoY", f: (c) => pct(c.share_change) },
  { key: "nd_ebitda", label: "ND/EBITDA", f: (c) => mult(c.nd_ebitda) },
  { key: "roe", label: "ROE", f: (c) => pct(c.roe, 0) },
  { key: "roic", label: "ROIC", f: (c) => pct(c.roic, 0) },
];

function CompaniesTab({ d }: { d: Sp500Payload }) {
  const [q, setQ] = useState("");
  const [sector, setSector] = useState("All");
  const [sort, setSort] = useState<{ k: SortKey; dir: 1 | -1 }>({ k: "revenue_ttm", dir: -1 });
  const [open, setOpen] = useState<string | null>(null);
  const sectors = useMemo(() => ["All", ...Array.from(new Set(d.companies.map((c) => c.sector))).sort()], [d]);
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    const r = d.companies.filter(
      (c) => (sector === "All" || c.sector === sector) && (!s || c.ticker.toLowerCase().includes(s) || c.name.toLowerCase().includes(s))
    );
    return [...r].sort((a, b) => {
      const x = a[sort.k], y = b[sort.k];
      if (x === null) return 1;
      if (y === null) return -1;
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
    });
  }, [d, q, sector, sort]);
  const head = (k: SortKey, label: string, title?: string) => (
    <th
      key={k}
      title={title}
      onClick={() => setSort((s) => ({ k, dir: s.k === k ? (s.dir === 1 ? -1 : 1) : -1 }))}
      className="px-2 py-2 text-right font-medium cursor-pointer select-none whitespace-nowrap hover:text-slate-900 dark:hover:text-white"
    >
      {label}
      {sort.k === k ? (sort.dir === -1 ? " ↓" : " ↑") : ""}
    </th>
  );
  return (
    <div className="space-y-4">
      <Card
        title="Current members"
        subtitle={`${rows.length} of ${d.companies.length} companies · trailing 12 months to each company's latest reported quarter`}
        right={
          <div className="flex flex-wrap items-center gap-2">
            <label className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                id="sp500-search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Ticker or name"
                className="pl-7 pr-2 py-1.5 text-[12.5px] rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 w-44"
              />
            </label>
            <select
              id="sp500-sector"
              value={sector}
              onChange={(e) => setSector(e.target.value)}
              className="text-[12.5px] rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 px-2 py-1.5"
            >
              {sectors.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
        }
      >
        <div className="overflow-auto max-h-[640px] px-2">
          <table className="w-full text-[12.5px]">
            <thead className="sticky top-0 bg-white dark:bg-slate-900 z-10 text-slate-500 text-[11px] uppercase tracking-wider">
              <tr>
                <th className="px-2 py-2 text-left font-medium cursor-pointer" onClick={() => setSort((s) => ({ k: "ticker", dir: s.k === "ticker" ? (s.dir === 1 ? -1 : 1) : 1 }))}>
                  Company{sort.k === "ticker" ? (sort.dir === -1 ? " ↓" : " ↑") : ""}
                </th>
                {COLS.map((c) => head(c.key, c.label, c.title))}
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <CompanyRow key={c.ticker} c={c} d={d} open={open === c.ticker} onToggle={() => setOpen(open === c.ticker ? null : c.ticker)} />
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Recent index changes" subtitle="Source: Wikipedia, compiled from S&P Dow Jones Indices announcements">
        <div className="overflow-x-auto px-2 pb-1">
          <table className="w-full text-[12.5px]">
            <thead className="text-slate-500 text-[11px] uppercase tracking-wider">
              <tr>
                <th className="text-left font-medium py-1.5 pr-3">Date</th>
                <th className="text-left font-medium pr-3">Added</th>
                <th className="text-left font-medium pr-3">Removed</th>
                <th className="text-left font-medium">Reason</th>
              </tr>
            </thead>
            <tbody>
              {d.changes.slice(0, 30).map((c, i) => (
                <tr key={i} className="border-t border-slate-100 dark:border-slate-800 align-top">
                  <td className="py-1.5 pr-3 tabular-nums whitespace-nowrap text-slate-600 dark:text-slate-400">{c.date}</td>
                  <td className="pr-3 whitespace-nowrap">{c.added ? <><b className="font-mono">{c.added}</b> <span className="text-slate-500">{c.added_name}</span></> : "–"}</td>
                  <td className="pr-3 whitespace-nowrap">{c.removed ? <><b className="font-mono">{c.removed}</b> <span className="text-slate-500">{c.removed_name}</span></> : "–"}</td>
                  <td className="text-slate-600 dark:text-slate-400 min-w-[240px]">{c.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function CompanyRow({ c, d, open, onToggle }: { c: Sp500Company; d: Sp500Payload; open: boolean; onToggle: () => void }) {
  const p = usePalette();
  const toBn = (a: Num[]) => a.map((v) => (v === null ? null : v / 1000));
  return (
    <>
      <tr
        onClick={onToggle}
        className={`border-t border-slate-100 dark:border-slate-800 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 ${open ? "bg-slate-50 dark:bg-slate-800/50" : ""}`}
      >
        <td className="px-2 py-1.5 min-w-[200px]">
          <div className="flex items-center gap-1.5">
            {open ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
            <span className="font-mono font-semibold text-slate-900 dark:text-white w-14">{c.ticker}</span>
            <span className="text-slate-600 dark:text-slate-400 truncate max-w-[180px]" title={c.name}>{c.name}</span>
          </div>
        </td>
        {COLS.map((col) => (
          <td key={col.key} className="px-2 text-right tabular-nums whitespace-nowrap text-slate-700 dark:text-slate-300">{col.f(c)}</td>
        ))}
      </tr>
      {open && (
        <tr className="bg-slate-50/60 dark:bg-slate-800/30">
          <td colSpan={COLS.length + 1} className="px-2 pb-3">
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-[11.5px] text-slate-500 px-2 pt-2">
              <span>{c.sector}</span>
              <span>Latest quarter: {c.last_quarter}</span>
              <span>In the index {c.member_since ? `since ${c.member_since}` : `since before ${d.quarters[0]}`}</span>
              <span>Buybacks + dividends TTM: {usdM(c.shareholder_return_ttm)}</span>
              <span>Chart: quarterly, US$ bn</span>
            </div>
            <QuarterChart
              quarters={d.quarters}
              fmt="bn"
              height={200}
              series={[
                { key: "rev", name: "Revenue", values: toBn(c.series.rev), color: p.core, kind: "bar" },
                { key: "ebit", name: "EBIT", values: toBn(c.series.ebit), color: p.s1 },
                { key: "ni", name: "Net income", values: toBn(c.series.ni), color: p.s2 },
              ]}
            />
          </td>
        </tr>
      )}
    </>
  );
}


"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  ResponsiveContainer, LineChart, Line, AreaChart, Area,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import { TrendingUp, TrendingDown, Activity, DollarSign, RefreshCcw, ChevronDown, ArrowUpDown } from "lucide-react";
import { authFetch } from "@/lib/authFetch";

const API_BASE = `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api`;

// ─── Types ───────────────────────────────────────────────────────────────────

interface NAVPositionRow {
  date: string;
  fund: string | null;
  nav: number | null;
  shares: number | null;
  nav_per_share: number | null;
  subscription_d0: number | null;
  redemption_d0: number | null;
  redemption_d1: number | null;
}

interface IndexPriceRow {
  date: string;
  fund: string | null;
  asset: string;
  info: string;
  flt_value: number;
}

interface IgfData {
  nav_positions: NAVPositionRow[];
  index_prices: IndexPriceRow[];
  available_funds: string[];
  available_assets: string[];
  available_infos: string[];
}

// One entry per date; each asset_group is a dynamic key with a number value
type BreakdownRow = { date: string; total?: number } & { [group: string]: number | string | undefined };

interface AssetBreakdownData {
  allocation_history: BreakdownRow[];
  synthetic_cotas: BreakdownRow[];
  available_groups: string[];
}

// ─── Asset group colours ──────────────────────────────────────────────────────

const GROUP_PALETTE: Record<string, string> = {
  Stock:          "#10b981", Stocks:   "#10b981", Equity:   "#10b981", Equities: "#10b981",
  Bond:           "#3b82f6", Bonds:    "#3b82f6", "Fixed Income": "#3b82f6", "Renda Fixa": "#3b82f6",
  Cash:           "#f59e0b", Caixa:    "#f59e0b",
  Derivative:     "#8b5cf6", Derivatives: "#8b5cf6", Derivativo: "#8b5cf6",
  FII:            "#ec4899",
  ETF:            "#06b6d4",
  Commodity:      "#f97316",
};
const FALLBACK_PALETTE = ["#6366f1", "#f43f5e", "#84cc16", "#0ea5e9", "#a78bfa", "#fb923c"];
const groupColor = (g: string, idx: number) => GROUP_PALETTE[g] ?? FALLBACK_PALETTE[idx % FALLBACK_PALETTE.length];

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmt = (n: number | null | undefined, decimals = 2) =>
  n == null ? "—" : n.toLocaleString("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

const fmtM = (n: number) => {
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toFixed(0);
};

const fmtDate = (d: string) => {
  if (!d) return "";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
};

const fmtMonthYear = (d: string) => {
  if (!d) return "";
  const parts = d.split("-");
  const y = parts[0];
  const m = parts[1];
  const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  return `${months[parseInt(m) - 1]}/${y.slice(2)}`;
};


// ─── Index name mapping ───────────────────────────────────────────────────────

const INDEX_NAMES: Record<string, string> = {
  // Brasil — Renda Variável
  "IBOV Index": "Ibovespa",       "IBOVESPA": "Ibovespa",       "IBOV": "Ibovespa",
  "IBX Index": "IBX-100",         "IBX": "IBX-100",
  "IBX50 Index": "IBX-50",        "IBX50": "IBX-50",
  "SMLL Index": "Small Cap (SMLL)", "SMLL": "Small Cap (SMLL)",
  "MLCX Index": "Mid-Large Cap",
  "IDIV Index": "Dividendos (IDIV)", "IDIV": "Dividendos (IDIV)",
  "IFIX Index": "IFIX (FIIs)",    "IFIX": "IFIX (FIIs)",
  // Brasil — Renda Fixa / Taxas
  "BZDIOVER Index": "CDI Over",
  "BZDIOVRA Index": "CDI Acumulado",
  "CDI Index": "CDI",             "CDI": "CDI",
  "SELIC": "Taxa Selic",          "SELIC Index": "Taxa Selic",
  "IPCA": "IPCA",                 "IPCA Index": "IPCA",
  "IMABTOT Index": "IMA-B Total", "IMABTOT": "IMA-B Total",
  "IMAB5 Index": "IMA-B 5",       "IMAB5P Index": "IMA-B 5+",
  "IRFM Index": "IRF-M",          "IRFM": "IRF-M",
  "IDA Index": "IDA Geral",
  // Câmbio
  "USDBRL Curncy": "Dólar (USD/BRL)", "USDBRL": "Dólar (USD/BRL)",
  "PTAX": "PTAX",                 "PTAX Index": "PTAX",
  "EURUSD Curncy": "Euro (EUR/USD)",
  // Global — Ações
  "SPX Index": "S&P 500",         "SPX": "S&P 500",
  "NDX Index": "Nasdaq 100",      "NDX": "Nasdaq 100",
  "MXBR Index": "MSCI Brasil",    "MXBR": "MSCI Brasil",
  "MXEF Index": "MSCI Emergentes","MXEF": "MSCI Emergentes",
  "MXWD Index": "MSCI Mundo",     "MXWD": "MSCI Mundo",
  "SX5E Index": "Euro Stoxx 50",
  "NKY Index": "Nikkei 225",
  // Renda Fixa Global
  "BMA 3070 Index": "Bloomberg US Treasury (BMA 3070)",
  "LBUSTRUU Index": "Bloomberg US Agg (LBUSTRUU)",
  // Commodities / Renda Fixa Global
  "SPGSCITR Index": "S&P GSCI Commodities",
  "LEGATRUU Index": "Bloomberg Global Agg",
  "XAU Curncy": "Ouro (XAU/USD)",
  "CL1 Comdty": "Petróleo WTI",
};

// ─── Indices available for overlay in the Cota Sintética chart ───────────────

const COTA_AC_INDICES: { key: string; label: string; color: string }[] = [
  { key: "SPX Index",      label: "S&P 500",                     color: "#f97316" },
  { key: "LBUSTRUU Index", label: "Bloomberg US Agg (LBUSTRUU)", color: "#ec4899" },
];

const indexDisplayName = (asset: string) => INDEX_NAMES[asset] ?? asset;

// ─── Range filter ─────────────────────────────────────────────────────────────

const RANGES = ["1M", "3M", "6M", "YTD", "1A", "3A", "Máx"] as const;
type Range = typeof RANGES[number];

function filterByRange<T extends { date: string }>(data: T[], range: Range): T[] {
  if (range === "Máx" || !data.length) return data;
  const last = new Date(data[data.length - 1].date);
  const cutoff = new Date(last);
  if (range === "1M") cutoff.setMonth(cutoff.getMonth() - 1);
  else if (range === "3M") cutoff.setMonth(cutoff.getMonth() - 3);
  else if (range === "6M") cutoff.setMonth(cutoff.getMonth() - 6);
  else if (range === "YTD") { cutoff.setMonth(0); cutoff.setDate(1); }
  else if (range === "1A") cutoff.setFullYear(cutoff.getFullYear() - 1);
  else if (range === "3A") cutoff.setFullYear(cutoff.getFullYear() - 3);
  return data.filter((d) => new Date(d.date) >= cutoff);
}

// ─── Sub-components ──────────────────────────────────────────────────────────

const ChartTooltip = ({ active, payload, label, formatter }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-900 border border-slate-700/60 rounded-xl px-4 py-3 shadow-2xl text-xs min-w-[160px]">
      <p className="text-slate-400 mb-2 font-medium">{label}</p>
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center justify-between gap-4 py-0.5">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
            <span className="text-slate-300">{p.name}</span>
          </span>
          <span className="font-semibold text-white">
            {formatter ? formatter(p.value, p.name) : fmt(p.value)}
          </span>
        </div>
      ))}
    </div>
  );
};

function StatCard({
  label, value, sub, icon: Icon, trend, color = "blue",
}: {
  label: string; value: string; sub?: string;
  icon: React.ElementType; trend?: "up" | "down" | "neutral"; color?: string;
}) {
  const border: Record<string, string> = {
    blue: "border-blue-200 dark:border-blue-500/20 from-blue-50 dark:from-blue-500/10 to-blue-50/50 dark:to-blue-600/5",
    emerald: "border-emerald-200 dark:border-emerald-500/20 from-emerald-50 dark:from-emerald-500/10 to-emerald-50/50 dark:to-emerald-600/5",
    violet: "border-violet-200 dark:border-violet-500/20 from-violet-50 dark:from-violet-500/10 to-violet-50/50 dark:to-violet-600/5",
    amber: "border-amber-200 dark:border-amber-500/20 from-amber-50 dark:from-amber-500/10 to-amber-50/50 dark:to-amber-600/5",
    rose: "border-rose-200 dark:border-rose-500/20 from-rose-50 dark:from-rose-500/10 to-rose-50/50 dark:to-rose-600/5",
  };
  const ic: Record<string, string> = {
    blue: "text-blue-500 dark:text-blue-400",
    emerald: "text-emerald-500 dark:text-emerald-400",
    violet: "text-violet-500 dark:text-violet-400",
    amber: "text-amber-500 dark:text-amber-400",
    rose: "text-rose-500 dark:text-rose-400",
  };
  return (
    <div className={`rounded-xl border bg-gradient-to-br ${border[color]} p-5 flex flex-col gap-3`}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-widest">{label}</span>
        <Icon className={`w-4 h-4 ${ic[color]}`} />
      </div>
      <div>
        <p className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">{value}</p>
        {sub && (
          <p className={`text-xs mt-1 font-medium ${trend === "up" ? "text-emerald-600 dark:text-emerald-400" : trend === "down" ? "text-rose-600 dark:text-rose-400" : "text-slate-500"}`}>
            {sub}
          </p>
        )}
      </div>
    </div>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-1">
      <h2 className="text-sm font-semibold text-slate-900 dark:text-white tracking-wide">{title}</h2>
      {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
    </div>
  );
}

function RangeBar({ value, onChange, color = "blue" }: { value: Range; onChange: (r: Range) => void; color?: string }) {
  const active: Record<string, string> = {
    blue: "bg-blue-600 text-white", emerald: "bg-emerald-600 text-white", violet: "bg-violet-600 text-white",
  };
  return (
    <div className="flex items-center gap-0.5 bg-slate-100 dark:bg-slate-800/60 rounded-lg p-0.5 border border-slate-200 dark:border-slate-700/40">
      {RANGES.map((r) => (
        <button
          key={r}
          onClick={() => onChange(r)}
          className={`px-2.5 py-1 text-[10px] font-semibold rounded-md transition-all ${value === r ? active[color] : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"}`}
        >
          {r}
        </button>
      ))}
    </div>
  );
}

function Dropdown({ value, options, onChange, placeholder = "Selecionar…" }: {
  value: string; options: { value: string; label: string }[];
  onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none bg-slate-100 dark:bg-slate-800/60 border border-slate-300 dark:border-slate-700/60 text-slate-700 dark:text-slate-200 text-xs rounded-lg pl-3 pr-8 py-2 focus:outline-none focus:border-blue-500 cursor-pointer transition-colors"
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center h-40 rounded-xl border border-slate-200 dark:border-slate-800/40 bg-slate-50 dark:bg-slate-800/10">
      <p className="text-xs text-slate-500 text-center max-w-xs px-4">{message}</p>
    </div>
  );
}

function PaginationBar({ page, total, onChange }: { page: number; total: number; onChange: (p: number) => void }) {
  if (total <= 1) return null;
  const btnCls = "px-2.5 py-1 text-[10px] font-medium rounded-md bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/40 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors";
  return (
    <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-200 dark:border-slate-800/60">
      <span className="text-[10px] text-slate-500">Página {page + 1} de {total}</span>
      <div className="flex items-center gap-1">
        <button onClick={() => onChange(0)} disabled={page === 0} className={btnCls}>«</button>
        <button onClick={() => onChange(Math.max(0, page - 1))} disabled={page === 0} className={btnCls}>‹</button>
        <button onClick={() => onChange(Math.min(total - 1, page + 1))} disabled={page === total - 1} className={btnCls}>›</button>
        <button onClick={() => onChange(total - 1)} disabled={page === total - 1} className={btnCls}>»</button>
      </div>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function IgfTrPage() {
  const [data, setData] = useState<IgfData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedFund, setSelectedFund] = useState("");
  const [cotaRange, setCotaRange] = useState<Range>("Máx");
  const [compareIndex, setCompareIndex] = useState<string | null>(null);
  const [navRange, setNavRange] = useState<Range>("Máx");
  const [flowsRange, setFlowsRange] = useState<Range>("Máx");
  const [allocRange, setAllocRange] = useState<Range>("Máx");
  const [cotaAcRange, setCotaAcRange] = useState<Range>("Máx");
  const [cotaAcSelectedIndices, setCotaAcSelectedIndices] = useState<string[]>([]);
  const [cotaAcHiddenGroups, setCotaAcHiddenGroups] = useState<Set<string>>(new Set());
  const [cotaAcDropdownOpen, setCotaAcDropdownOpen] = useState(false);
  const cotaAcDropdownRef = useRef<HTMLDivElement>(null);

  const [breakdownData, setBreakdownData] = useState<AssetBreakdownData | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = selectedFund ? `?fund=${encodeURIComponent(selectedFund)}` : "";
      const res = await authFetch(`${API_BASE}/igf-tr/${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: IgfData = await res.json();
      setData(json);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [selectedFund]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Close index-overlay dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (cotaAcDropdownRef.current && !cotaAcDropdownRef.current.contains(e.target as Node)) {
        setCotaAcDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const params = selectedFund ? `?fund=${encodeURIComponent(selectedFund)}` : "";
        const res = await authFetch(`${API_BASE}/igf-tr/asset-breakdown/${params}`);
        if (res.ok) setBreakdownData(await res.json());
      } catch {}
    })();
  }, [selectedFund]);

  // ── Sorted NAV positions ────────────────────────────────────────────────────
  const navRows = useMemo(
    () => [...(data?.nav_positions ?? [])].sort((a, b) => a.date.localeCompare(b.date)),
    [data]
  );

  // ── Cota series ────────────────────────────────────────────────────────────
  const cotaSeries = useMemo(
    () => navRows.filter((r) => r.nav_per_share != null).map((r) => ({ date: r.date, value: r.nav_per_share! })),
    [navRows]
  );

  const cotaChartData = useMemo(() => {
    const filtered = filterByRange(cotaSeries, cotaRange);
    if (!filtered.length) return [];

    // Always normalise fundo to 0% at start of selected range
    const cotaBase = filtered[0].value;

    const indexRows = compareIndex
      ? (data?.index_prices ?? []).filter((r) => r.asset === compareIndex && r.flt_value != null).sort((a, b) => a.date.localeCompare(b.date))
      : [];
    const idxAtStart = indexRows.find((r) => r.date >= filtered[0].date);
    const idxBase = idxAtStart?.flt_value ?? null;
    const idxMap = new Map(indexRows.map((r) => [r.date, r.flt_value]));

    return filtered.map((p) => {
      const idxVal = idxBase != null ? idxMap.get(p.date) : undefined;
      return {
        date: fmtDate(p.date),
        fundo: parseFloat(((p.value / cotaBase - 1) * 100).toFixed(4)),
        indice: idxVal != null && idxBase != null ? parseFloat(((idxVal / idxBase - 1) * 100).toFixed(4)) : undefined,
      };
    });
  }, [cotaSeries, cotaRange, compareIndex, data]);

  const isCompareMode = compareIndex != null && cotaChartData.some((p) => p.indice != null);

  const cotaDomain = useMemo((): [number, number] => {
    const values = cotaChartData.flatMap((p) =>
      [p.fundo, p.indice].filter((v): v is number => v != null)
    );
    if (!values.length) return [-1, 1];
    const min = Math.min(...values);
    const max = Math.max(...values);
    const pad = (max - min) * 0.05 || 0.5;
    return [parseFloat((min - pad).toFixed(2)), parseFloat((max + pad).toFixed(2))];
  }, [cotaChartData]);

  // ── Flows chart data (monthly aggregation) ─────────────────────────────────
  const flowsChartData = useMemo(() => {
    const byMonth: Record<string, { subscriptions: number; redemptions: number }> = {};
    for (const row of navRows) {
      const monthKey = row.date.slice(0, 7);
      if (!byMonth[monthKey]) byMonth[monthKey] = { subscriptions: 0, redemptions: 0 };
      byMonth[monthKey].subscriptions += row.subscription_d0 ?? 0;
      byMonth[monthKey].redemptions += Math.abs(row.redemption_d0 ?? 0) + Math.abs(row.redemption_d1 ?? 0);
    }
    const sorted = Object.entries(byMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, v]) => ({
        date: month,
        month: fmtMonthYear(month + "-01"),
        subscriptions: v.subscriptions,
      }));
    return filterByRange(sorted, flowsRange);
  }, [navRows, flowsRange]);

  // ── NAV chart data ─────────────────────────────────────────────────────────
  const navChartData = useMemo(() => {
    const series = navRows.filter((r) => r.nav != null).map((r) => ({ date: r.date, nav: r.nav! }));
    return filterByRange(series, navRange).map((p) => ({ date: fmtDate(p.date), nav: p.nav }));
  }, [navRows, navRange]);

  // ── KPI stats ──────────────────────────────────────────────────────────────
  const latest = navRows[navRows.length - 1] ?? null;
  const prev = navRows[navRows.length - 2] ?? null;

  const cotaChange = latest?.nav_per_share != null && prev?.nav_per_share != null
    ? latest.nav_per_share - prev.nav_per_share : null;
  const cotaChangePct = cotaChange != null && prev?.nav_per_share
    ? (cotaChange / prev.nav_per_share) * 100 : null;

  const ytdReturn = useMemo(() => {
    if (!cotaSeries.length || latest?.nav_per_share == null) return null;
    const year = new Date(cotaSeries[cotaSeries.length - 1].date).getFullYear();
    const ytdStart = cotaSeries.find((p) => new Date(p.date).getFullYear() === year);
    if (!ytdStart) return null;
    return ((latest.nav_per_share / ytdStart.value) - 1) * 100;
  }, [cotaSeries, latest]);

  const totalSubs = useMemo(() => flowsChartData.reduce((s, r) => s + r.subscriptions, 0), [flowsChartData]);


  const fundOptions = useMemo(() => (data?.available_funds ?? []).map((f) => ({ value: f, label: f })), [data]);

  // ── Asset breakdown chart data ─────────────────────────────────────────────
  const availableGroups: string[] = breakdownData?.available_groups ?? [];

  const allocChartData = useMemo(() => {
    if (!breakdownData?.allocation_history.length) return [];
    return filterByRange(breakdownData.allocation_history, allocRange)
      .map((row) => ({ ...row, date: fmtDate(row.date as string) }));
  }, [breakdownData, allocRange]);

  const latestAlloc = useMemo(() => {
    if (!breakdownData?.allocation_history.length) return null;
    return breakdownData.allocation_history[breakdownData.allocation_history.length - 1];
  }, [breakdownData]);

  const cotaAcChartData = useMemo((): BreakdownRow[] => {
    if (!breakdownData?.synthetic_cotas.length) return [];
    const filtered = filterByRange(breakdownData.synthetic_cotas, cotaAcRange);
    if (!filtered.length) return [];

    // Per-group base values from the first row in the filtered range
    const firstRow = filtered[0] as Record<string, unknown>;
    const base: Record<string, number> = {};
    for (const key of Object.keys(firstRow)) {
      if (key === 'date' || key === 'total') continue;
      const v = firstRow[key] as number;
      if (v != null && v !== 0) base[key] = v;
    }

    // Pre-build maps for each selected index overlay
    const idxMaps: Record<string, { map: Map<string, number>; base: number | null }> = {};
    const firstRawDate = filtered[0].date as string;
    for (const idxKey of cotaAcSelectedIndices) {
      const rows = (data?.index_prices ?? [])
        .filter((r) => r.asset === idxKey && r.flt_value != null)
        .sort((a, b) => a.date.localeCompare(b.date));
      const firstIdxRow = rows.find((r) => r.date >= firstRawDate);
      idxMaps[idxKey] = {
        map: new Map(rows.map((r) => [r.date, r.flt_value as number])),
        base: firstIdxRow?.flt_value ?? null,
      };
    }

    return filtered.map((row) => {
      const rawDate = row.date as string;
      const rawRow = row as Record<string, unknown>;
      const updates: Record<string, number | undefined> = {};

      for (const [g, b] of Object.entries(base)) {
        const v = rawRow[g] as number | undefined;
        updates[g] = v != null ? parseFloat(((v / b - 1) * 100).toFixed(4)) : 0;
      }
      for (const idxKey of cotaAcSelectedIndices) {
        const { map: idxMap, base: idxBase } = idxMaps[idxKey];
        if (idxBase == null) continue;
        const idxVal = idxMap.get(rawDate);
        updates[`__idx_${idxKey}`] = idxVal != null
          ? parseFloat(((idxVal / idxBase - 1) * 100).toFixed(4))
          : undefined;
      }
      return { date: fmtDate(rawDate), ...updates } as BreakdownRow;
    });
  }, [breakdownData, cotaAcRange, cotaAcSelectedIndices, data]);

  const cotaAcGroups = useMemo(
    () => availableGroups.filter((g) => g.toLowerCase() !== 'cash' && g.toLowerCase() !== 'caixa'),
    [availableGroups]
  );

  const cotaAcDomain = useMemo((): [number, number] => {
    const visibleGroups = cotaAcGroups.filter((g) => !cotaAcHiddenGroups.has(g));
    const idxKeys = cotaAcSelectedIndices.map((k) => `__idx_${k}`);
    const allKeys = [...visibleGroups, ...idxKeys];
    const values = cotaAcChartData.flatMap((row) =>
      allKeys.map((g) => row[g] as number).filter((v) => v != null && isFinite(v))
    );
    if (!values.length) return [-5, 5];
    const min = Math.min(...values);
    const max = Math.max(...values);
    const pad = (max - min) * 0.05 || 1;
    return [parseFloat((min - pad).toFixed(2)), parseFloat((max + pad).toFixed(2))];
  }, [cotaAcChartData, cotaAcGroups, cotaAcHiddenGroups, cotaAcSelectedIndices]);

  // ─── Render ───────────────────────────────────────────────────────────────

  const cardCls = "rounded-xl border border-slate-200 dark:border-slate-800/60 bg-white dark:bg-slate-900/50 shadow-sm";

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="border-b border-slate-200 dark:border-slate-800/60 bg-white/80 dark:bg-[#080f23]/80 backdrop-blur-sm px-8 py-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2.5 mb-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]" />
              <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-widest">Live</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">IGF TR</h1>
            <p className="text-xs text-slate-500 mt-0.5">Fundo de Investimento — Histórico e Performance</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {fundOptions.length > 1 && (
              <Dropdown value={selectedFund} options={fundOptions} onChange={setSelectedFund} placeholder="Todos os fundos" />
            )}
            <button
              onClick={fetchData}
              className="flex items-center gap-2 px-3 py-2 text-xs font-medium bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 text-slate-600 dark:text-slate-300 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700/60 transition-colors"
            >
              <RefreshCcw className="w-3.5 h-3.5" />
              Atualizar
            </button>
          </div>
        </div>
      </div>

      <div className="px-8 py-7 space-y-6 max-w-[1600px]">

        {loading && (
          <div className="flex items-center justify-center h-64">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-slate-500">Carregando dados…</p>
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-rose-300 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/10 px-6 py-5 text-sm text-rose-600 dark:text-rose-300">
            Erro ao carregar dados: {error}
          </div>
        )}

        {!loading && !error && data && (
          <>
            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard
                label="Cota Atual (NAV/Cota)"
                value={latest?.nav_per_share != null ? fmt(latest.nav_per_share, 6) : "—"}
                sub={latest?.date ? fmtDate(latest.date) : undefined}
                icon={Activity}
                trend="neutral"
                color="blue"
              />
              <StatCard
                label="Variação no Dia"
                value={cotaChange != null ? `${cotaChange >= 0 ? "+" : ""}${fmt(cotaChange, 6)}` : "—"}
                sub={cotaChangePct != null ? `${cotaChangePct >= 0 ? "+" : ""}${cotaChangePct.toFixed(4)}%` : undefined}
                icon={cotaChange != null && cotaChange >= 0 ? TrendingUp : TrendingDown}
                trend={cotaChange != null ? (cotaChange >= 0 ? "up" : "down") : "neutral"}
                color={cotaChange != null && cotaChange >= 0 ? "emerald" : "rose"}
              />
              <StatCard
                label="Retorno YTD"
                value={ytdReturn != null ? `${ytdReturn >= 0 ? "+" : ""}${ytdReturn.toFixed(2)}%` : "—"}
                sub="Acumulado no ano"
                icon={TrendingUp}
                trend={ytdReturn != null ? (ytdReturn >= 0 ? "up" : "down") : "neutral"}
                color={ytdReturn != null && ytdReturn >= 0 ? "emerald" : "rose"}
              />
              <StatCard
                label="Patrimônio (NAV)"
                value={latest?.nav != null ? `R$ ${fmtM(latest.nav)}` : "—"}
                sub={latest?.shares != null ? `${fmtM(latest.shares)} cotas` : undefined}
                icon={DollarSign}
                color="violet"
              />
            </div>


            {/* Histórico de Cotas — large line chart */}
            <div className={`${cardCls} p-6`}>
              <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
                <SectionHeader
                  title="Histórico de Cotas"
                  subtitle="Retorno acumulado no período — normalizado a 0% no início do intervalo seleccionado"
                />
                <div className="flex items-center gap-3 flex-wrap">
                  {/* Compare index dropdown */}
                  <div className="relative">
                    <select
                      value={compareIndex ?? ""}
                      onChange={(e) => setCompareIndex(e.target.value || null)}
                      className="appearance-none pl-3 pr-8 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                    >
                      <option value="">Comparar com…</option>
                      {(data?.available_assets ?? []).map((asset) => (
                        <option key={asset} value={asset}>{indexDisplayName(asset)}</option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                  </div>
                  <RangeBar value={cotaRange} onChange={setCotaRange} color="blue" />
                </div>
              </div>

              {/* Legend when comparing */}
              {isCompareMode && (
                <div className="flex items-center gap-5 mb-4">
                  <span className="flex items-center gap-1.5 text-xs text-slate-500">
                    <span className="w-5 h-0.5 rounded bg-blue-500 inline-block" />
                    IGF TR
                  </span>
                  <span className="flex items-center gap-1.5 text-xs text-slate-500">
                    <span className="w-5 h-0.5 rounded bg-orange-400 inline-block" style={{ borderTop: "2px dashed #fb923c" }} />
                    {indexDisplayName(compareIndex!)}
                  </span>
                </div>
              )}

              {cotaChartData.length === 0 ? (
                <EmptyState message="Nenhum dado de cota disponível. Faça upload da tabela RefTableAuxNAVPosition." />
              ) : (
                <ResponsiveContainer width="100%" height={380}>
                  <LineChart data={cotaChartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="cotaGrad" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#3b82f6" />
                        <stop offset="100%" stopColor="#8b5cf6" />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" className="dark:[stroke:#1e293b]" />
                    <XAxis dataKey="date" tick={{ fill: "#94a3b8", fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                    <YAxis
                      domain={cotaDomain}
                      tick={{ fill: "#94a3b8", fontSize: 10 }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`}
                      width={72}
                    />
                    <Tooltip
                      content={
                        <ChartTooltip
                          formatter={(v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`}
                        />
                      }
                    />
                    <Line type="monotone" dataKey="fundo" name="IGF TR" stroke="url(#cotaGrad)" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: "#3b82f6" }} />
                    {isCompareMode && (
                      <Line type="monotone" dataKey="indice" name={indexDisplayName(compareIndex!)} stroke="#fb923c" strokeWidth={1.5} strokeDasharray="5 3" dot={false} activeDot={{ r: 4, fill: "#fb923c" }} connectNulls />
                    )}
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* NAV Table + Subscriptions Bar Chart */}
            <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">

              {/* NAV Line Chart */}
              <div className={`xl:col-span-3 ${cardCls} p-6`}>
                <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
                  <SectionHeader
                    title="Patrimônio Líquido (NAV)"
                    subtitle="Evolução do patrimônio total do fundo"
                  />
                  <RangeBar value={navRange} onChange={setNavRange} color="violet" />
                </div>
                {navChartData.length === 0 ? (
                  <EmptyState message="Nenhum dado de patrimônio disponível." />
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <AreaChart data={navChartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="navGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.3} />
                          <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" className="dark:[stroke:#1e293b]" />
                      <XAxis dataKey="date" tick={{ fill: "#94a3b8", fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                      <YAxis tick={{ fill: "#94a3b8", fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v) => `R$ ${fmtM(v)}`} width={72} />
                      <Tooltip content={<ChartTooltip formatter={(v: number) => `R$ ${fmtM(v)}`} />} />
                      <Area type="monotone" dataKey="nav" name="Patrimônio" stroke="#8b5cf6" strokeWidth={2} fill="url(#navGrad)" dot={false} activeDot={{ r: 4, fill: "#8b5cf6" }} />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>

              {/* Monthly Subscriptions Bar Chart */}
              <div className={`xl:col-span-2 ${cardCls} p-6 flex flex-col`}>
                <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
                  <div>
                    <SectionHeader
                      title="Captações por Mês"
                      subtitle="Subscription D0 — fluxo mensal de aplicações"
                    />
                    <div className="flex items-center gap-2 mt-2">
                      <span className="w-3 h-3 rounded-sm bg-emerald-500/80 inline-block" />
                      <span className="text-xs text-slate-500">Total: <strong className="text-emerald-600 dark:text-emerald-400">R$ {fmtM(totalSubs)}</strong></span>
                    </div>
                  </div>
                  <RangeBar value={flowsRange} onChange={setFlowsRange} color="emerald" />
                </div>
                {flowsChartData.length === 0 ? (
                  <EmptyState message="Nenhum dado de captação disponível." />
                ) : (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={flowsChartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} barCategoryGap="30%">
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" className="dark:[stroke:#1e293b]" vertical={false} />
                      <XAxis dataKey="month" tick={{ fill: "#94a3b8", fontSize: 9 }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fill: "#94a3b8", fontSize: 9 }} tickLine={false} axisLine={false} tickFormatter={(v) => fmtM(v)} width={52} />
                      <Tooltip content={<ChartTooltip formatter={(v: number) => `R$ ${fmtM(v)}`} />} />
                      <Bar dataKey="subscriptions" name="Captações" fill="#10b981" fillOpacity={0.85} radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* ── Asset Class Breakdown ─────────────────────────────────── */}
            {breakdownData && availableGroups.length > 0 && (
              <>
                {/* Latest allocation stat pills */}
                {latestAlloc && (
                  <div className="flex flex-wrap gap-3">
                    {availableGroups.map((g, i) => {
                      const pct = latestAlloc[g] as number;
                      return (
                        <div key={g} className={`${cardCls} px-4 py-3 flex items-center gap-3 min-w-[140px]`}>
                          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: groupColor(g, i) }} />
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">{g}</p>
                            <p className="text-lg font-bold text-slate-900 dark:text-white tabular-nums">
                              {pct != null ? pct.toFixed(1) : "—"}%
                            </p>
                            <p className="text-[10px] text-slate-400">
                              {latestAlloc.total != null ? `R$ ${fmtM(latestAlloc.total as number * pct / 100)}` : ""}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                    <div className={`${cardCls} px-4 py-3 flex items-center gap-3 min-w-[140px]`}>
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Total</p>
                        <p className="text-lg font-bold text-slate-900 dark:text-white tabular-nums">
                          {latestAlloc.total != null ? `R$ ${fmtM(latestAlloc.total as number)}` : "—"}
                        </p>
                        <p className="text-[10px] text-slate-400">{latestAlloc.date as string ? fmtDate(latestAlloc.date as string) : ""}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Allocation stacked area chart */}
                <div className={`${cardCls} p-6`}>
                  <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
                    <SectionHeader
                      title="Composição por Asset Class"
                      subtitle="Participação % diária de cada classe no portfólio — finance_assetpositionhistofficial"
                    />
                    <RangeBar value={allocRange} onChange={setAllocRange} color="emerald" />
                  </div>
                  {allocChartData.length === 0 ? (
                    <EmptyState message="Nenhum dado de composição disponível." />
                  ) : (
                    <ResponsiveContainer width="100%" height={320}>
                      <AreaChart data={allocChartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }} stackOffset="none">
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" className="dark:[stroke:#1e293b]" />
                        <XAxis dataKey="date" tick={{ fill: "#94a3b8", fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                        <YAxis
                          domain={[0, 100]}
                          tick={{ fill: "#94a3b8", fontSize: 10 }}
                          tickLine={false}
                          axisLine={false}
                          tickFormatter={(v) => `${v}%`}
                          width={44}
                        />
                        <Tooltip
                          content={({ active, payload, label }) => {
                            if (!active || !payload?.length) return null;
                            return (
                              <div className="bg-slate-900 border border-slate-700/60 rounded-xl px-4 py-3 shadow-2xl text-xs min-w-[160px]">
                                <p className="text-slate-400 mb-2 font-medium">{label}</p>
                                {[...payload].reverse().map((p: any, i: number) => (
                                  <div key={i} className="flex items-center justify-between gap-4 py-0.5">
                                    <span className="flex items-center gap-1.5">
                                      <span className="w-2 h-2 rounded-full" style={{ background: p.fill }} />
                                      <span className="text-slate-300">{p.name}</span>
                                    </span>
                                    <span className="font-semibold text-white">{(p.value as number).toFixed(1)}%</span>
                                  </div>
                                ))}
                              </div>
                            );
                          }}
                        />
                        <Legend
                          formatter={(value) => <span className="text-xs text-slate-500 dark:text-slate-400">{value}</span>}
                          wrapperStyle={{ paddingTop: 12 }}
                        />
                        {availableGroups.map((g, i) => (
                          <Area
                            key={g}
                            type="monotone"
                            dataKey={g}
                            name={g}
                            stackId="a"
                            stroke={groupColor(g, i)}
                            strokeWidth={1}
                            fill={groupColor(g, i)}
                            fillOpacity={0.85}
                            dot={false}
                            activeDot={{ r: 3 }}
                          />
                        ))}
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </div>

                {/* Synthetic cota per asset class */}
                <div className={`${cardCls} p-6`}>
                  <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
                    <SectionHeader
                      title="Cota Sintética por Asset Class (Bruto)"
                      subtitle="Retorno acumulado bruto no período, excl. Caixa — normalizado a 0% no início do intervalo seleccionado"
                    />
                    <div className="flex items-center gap-3 flex-wrap">
                      {/* Index overlay multi-select dropdown */}
                      <div ref={cotaAcDropdownRef} className="relative">
                        <button
                          onClick={() => setCotaAcDropdownOpen((o) => !o)}
                          className="flex items-center gap-2 pl-3 pr-2.5 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/60 transition-colors"
                        >
                          <span>Comparar índices</span>
                          {cotaAcSelectedIndices.length > 0 && (
                            <span className="w-4 h-4 rounded-full bg-blue-500 text-white text-[10px] flex items-center justify-center font-bold">
                              {cotaAcSelectedIndices.length}
                            </span>
                          )}
                          <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${cotaAcDropdownOpen ? "rotate-180" : ""}`} />
                        </button>

                        {cotaAcDropdownOpen && (
                          <div className="absolute right-0 top-full mt-1.5 z-30 w-56 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl py-1.5">
                            {COTA_AC_INDICES.map(({ key, label, color }) => {
                              const selected = cotaAcSelectedIndices.includes(key);
                              return (
                                <button
                                  key={key}
                                  onClick={() => setCotaAcSelectedIndices((prev) =>
                                    selected ? prev.filter((k) => k !== key) : [...prev, key]
                                  )}
                                  className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-700/60 text-left transition-colors"
                                >
                                  <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${selected ? "border-blue-500 bg-blue-500" : "border-slate-300 dark:border-slate-600"}`}>
                                    {selected && <span className="w-2 h-2 rounded-sm bg-white" />}
                                  </div>
                                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
                                  <span className="text-xs text-slate-700 dark:text-slate-300 leading-tight">{label}</span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      <RangeBar value={cotaAcRange} onChange={setCotaAcRange} color="blue" />
                    </div>
                  </div>

                  {/* Legend — asset class groups (clickable to hide) + index overlays */}
                  <div className="flex flex-wrap gap-x-5 gap-y-2 mb-4">
                    {cotaAcGroups.map((g, i) => {
                      const last = cotaAcChartData[cotaAcChartData.length - 1];
                      const val = last ? (last[g] as number) : null;
                      const hidden = cotaAcHiddenGroups.has(g);
                      return (
                        <button
                          key={g}
                          onClick={() => setCotaAcHiddenGroups((prev) => {
                            const next = new Set(prev);
                            if (next.has(g)) next.delete(g); else next.add(g);
                            return next;
                          })}
                          title={hidden ? "Mostrar" : "Ocultar"}
                          className={`flex items-center gap-2 transition-opacity ${hidden ? "opacity-35" : ""}`}
                        >
                          <span className="w-4 h-0.5 rounded inline-block" style={{ background: groupColor(g, i) }} />
                          <span className="text-xs text-slate-500 dark:text-slate-400">{g}</span>
                          {val != null && !hidden && (
                            <span className={`text-xs font-semibold tabular-nums ${val >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                              {val >= 0 ? "+" : ""}{val.toFixed(2)}%
                            </span>
                          )}
                        </button>
                      );
                    })}

                    {/* Index overlay legend entries */}
                    {COTA_AC_INDICES.filter(({ key }) => cotaAcSelectedIndices.includes(key)).map(({ key, label, color }) => {
                      const last = cotaAcChartData[cotaAcChartData.length - 1];
                      const val = last ? (last[`__idx_${key}`] as number | undefined) : null;
                      return (
                        <div key={key} className="flex items-center gap-2">
                          <span className="inline-block w-4" style={{ borderTop: `2px dashed ${color}`, marginTop: "1px" }} />
                          <span className="text-xs text-slate-500 dark:text-slate-400">{label}</span>
                          {val != null && (
                            <span className={`text-xs font-semibold tabular-nums ${val >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                              {val >= 0 ? "+" : ""}{val.toFixed(2)}%
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {cotaAcChartData.length === 0 ? (
                    <EmptyState message="Nenhum dado de cota sintética disponível." />
                  ) : (
                    <ResponsiveContainer width="100%" height={320}>
                      <LineChart data={cotaAcChartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" className="dark:[stroke:#1e293b]" />
                        <XAxis dataKey="date" tick={{ fill: "#94a3b8", fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                        <YAxis
                          domain={cotaAcDomain}
                          tick={{ fill: "#94a3b8", fontSize: 10 }}
                          tickLine={false}
                          axisLine={false}
                          tickFormatter={(v) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`}
                          width={52}
                        />
                        <Tooltip
                          content={({ active, payload, label }) => {
                            if (!active || !payload?.length) return null;
                            const visible = payload.filter((p: any) => {
                              const dk = p.dataKey as string;
                              return dk.startsWith("__idx_") || !cotaAcHiddenGroups.has(dk);
                            });
                            return (
                              <div className="bg-slate-900 border border-slate-700/60 rounded-xl px-4 py-3 shadow-2xl text-xs min-w-[200px]">
                                <p className="text-slate-400 mb-2 font-medium">{label}</p>
                                {visible.map((p: any, i: number) => {
                                  const ret = p.value as number;
                                  return (
                                    <div key={i} className="flex items-center justify-between gap-4 py-0.5">
                                      <span className="flex items-center gap-1.5">
                                        <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
                                        <span className="text-slate-300">{p.name}</span>
                                      </span>
                                      <span className={`font-semibold tabular-nums ${ret >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                        {ret >= 0 ? "+" : ""}{ret.toFixed(2)}%
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          }}
                        />

                        {/* Asset-class group lines — hide prop controls visibility */}
                        {cotaAcGroups.map((g, i) => (
                          <Line
                            key={g}
                            type="monotone"
                            dataKey={g}
                            name={g}
                            stroke={groupColor(g, i)}
                            strokeWidth={2}
                            dot={false}
                            activeDot={{ r: 4 }}
                            connectNulls
                            hide={cotaAcHiddenGroups.has(g)}
                          />
                        ))}

                        {/* Selected index overlay lines */}
                        {COTA_AC_INDICES.filter(({ key }) => cotaAcSelectedIndices.includes(key)).map(({ key, label, color }) => (
                          <Line
                            key={key}
                            type="monotone"
                            dataKey={`__idx_${key}`}
                            name={label}
                            stroke={color}
                            strokeWidth={1.5}
                            strokeDasharray="5 3"
                            dot={false}
                            activeDot={{ r: 3, fill: color }}
                            connectNulls
                          />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </>
            )}
          </>
        )}

        {!loading && !error && data && !data.nav_positions.length && (
          <div className={`${cardCls} p-12 text-center`}>
            <ArrowUpDown className="w-10 h-10 text-slate-400 mx-auto mb-4" />
            <p className="text-slate-700 dark:text-slate-300 font-semibold text-base mb-1">Nenhum dado encontrado</p>
            <p className="text-slate-500 text-sm max-w-sm mx-auto">
              Faça upload da tabela <code className="text-blue-500">RefTableAuxNAVPosition</code> usando o macro Excel UploadTables para começar.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

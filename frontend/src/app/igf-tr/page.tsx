"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  ResponsiveContainer, LineChart, Line, AreaChart, Area,
  BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import { TrendingUp, TrendingDown, Activity, DollarSign, RefreshCcw, ChevronDown, ArrowUpDown, Settings } from "lucide-react";
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
  /** True on points extrapolated from Portfolio snapshots (past the last official upload). */
  is_estimated?: boolean;
}

/**
 * Official administrator history chain-linked onto the calculated-NAV estimate, so the
 * cota/NAV series continues past the last NAVPosition upload. Built server-side by
 * `finance.services.compute_unified_fund_series`.
 */
interface UnifiedSeries {
  series: NAVPositionRow[];
  official_through: string | null;
  estimated_from: string | null;
  splice_cota: number | null;
  shares_carried: number | null;
  /** Share count at the last estimated point, after any manual capital events. */
  shares_latest: number | null;
  has_estimate: boolean;
  flows_estimated: boolean;
  manual_flows_applied: number;
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
  unified?: UnifiedSeries | null;
}

// ─── Calculated NAV (cota calculada) ───────────────────────────────────────────

interface CalcNavPoint {
  date: string;
  asset_value: number;
  cash: number;
  gross_asset_value: number;
  gross_cota: number;
  mgmt_fee_day: number;
  mgmt_fee_accrued: number;
  cota_after_mgmt: number;
  perf_fee_provision: number;
  net_nav: number;
  net_cota: number;
  /** Share count used to price this day, including any manual capital event settled on it. */
  shares: number;
  /** Signed cash movement settled on this day (positive in, negative out); null when none. */
  net_flow: number | null;
  daily_return_pct: number | null;
}

interface FundConfig {
  fund: string;
  shares: number;
  mgmt_fee_rate: number;
  trading_days: number;
  perf_fee_rate: number;
  high_water_mark: number;
  mtd_base_cota: number | null;
  ytd_base_cota: number | null;
  mgmt_fee_paid_through: string | null;
  perf_fee_paid_through: string | null;
  /** Price a ManualFundFlow converts into shares at: "prev_cota" | "same_cota". */
  flow_share_convention: string;
}

interface CalcNavData {
  config: FundConfig;
  latest: CalcNavPoint;
  previous: CalcNavPoint | null;
  excess_over_hwm: number;
  total_fees_to_pay: number;
  official_cota: { date: string; nav_per_share: number; nav: number | null } | null;
  series: CalcNavPoint[];
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
  n == null ? "—" : n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

const fmtSig = (n: number | null | undefined, sig = 4): string => {
  if (n == null || !isFinite(n)) return "—";
  if (n === 0) return (0).toLocaleString("en-US", { minimumFractionDigits: sig - 1, maximumFractionDigits: sig - 1 });
  const rounded = Number(n.toPrecision(sig));
  const magnitude = Math.floor(Math.log10(Math.abs(rounded)));
  const decimals = Math.max(0, sig - 1 - magnitude);
  return rounded.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
};

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

// ─── Calculated NAV panel ──────────────────────────────────────────────────

const fmtPct4 = (n: number | null | undefined) =>
  n == null ? "—" : `${n >= 0 ? "+" : ""}${n.toFixed(4)}%`;

function CalculatedNavPanel() {
  const [data, setData] = useState<CalcNavData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [cashInput, setCashInput] = useState("");
  const [savingCash, setSavingCash] = useState(false);

  const [showSettings, setShowSettings] = useState(false);
  const [form, setForm] = useState<Partial<FundConfig>>({});
  const [savingCfg, setSavingCfg] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);

  const fetchCalc = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch(`${API_BASE}/igf-tr/calculated-nav/`);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      const json: CalcNavData = await res.json();
      setData(json);
      setCashInput(json.latest.cash != null ? String(json.latest.cash) : "");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCalc(); }, [fetchCalc]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) setShowSettings(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const saveCash = async () => {
    if (!data) return;
    const val = parseFloat(cashInput);
    if (isNaN(val)) return;
    setSavingCash(true);
    try {
      const res = await authFetch(`${API_BASE}/igf-tr/daily-cash/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: data.latest.date, cash: val }),
      });
      if (res.ok) await fetchCalc();
    } finally {
      setSavingCash(false);
    }
  };

  const openSettings = () => {
    if (data) setForm({ ...data.config });
    setShowSettings((o) => !o);
  };

  const saveSettings = async () => {
    setSavingCfg(true);
    try {
      const res = await authFetch(`${API_BASE}/fund-config/`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        setShowSettings(false);
        await fetchCalc();
      }
    } finally {
      setSavingCfg(false);
    }
  };

  const cardCls = "rounded-xl border border-slate-200 dark:border-slate-800/60 bg-white dark:bg-slate-900/50 shadow-sm";

  if (loading) {
    return (
      <div className={`${cardCls} p-6 flex items-center justify-center h-40`}>
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className={`${cardCls} p-6`}>
        <SectionHeader title="Cota Calculada (Estimada)" subtitle="NAV estimado a partir dos preços do dia" />
        <EmptyState message={
          error?.includes("snapshot")
            ? "Nenhum snapshot de portfólio encontrado. Faça upload do Excel na página Portfolio para calcular o NAV."
            : `Não foi possível calcular o NAV. ${error ?? ""}`
        } />
      </div>
    );
  }

  const L = data.latest;
  const cfg = data.config;
  const officialDelta = data.official_cota?.nav_per_share != null
    ? L.net_cota - data.official_cota.nav_per_share
    : null;

  return (
    <div className={`${cardCls} p-6`}>
      <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
        <SectionHeader
          title="Cota Calculada (Estimada)"
          subtitle={`NAV estimado a partir dos preços do último snapshot (${fmtDate(L.date)}) — líquido de taxas`}
        />
        <div ref={settingsRef} className="relative">
          <button
            onClick={openSettings}
            className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/60 transition-colors"
          >
            <Settings className="w-3.5 h-3.5" /> Parâmetros
          </button>
          {showSettings && (
            <div className="absolute right-0 top-full mt-1.5 z-30 w-72 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl p-4 space-y-3">
              {([
                ["shares", "Cotas (shares)", 1, false],
                ["mgmt_fee_rate", "Taxa de adm. (% a.a.)", 0.0001, true],
                ["trading_days", "Dias úteis (ano)", 1, false],
                ["perf_fee_rate", "Taxa de perf. (%)", 0.01, true],
                ["high_water_mark", "High-water mark (cota)", 0.0001, false],
                ["mtd_base_cota", "Cota início do mês (MTD)", 0.00001, false],
                ["ytd_base_cota", "Cota início do ano (YTD)", 0.00001, false],
              ] as [keyof FundConfig, string, number, boolean][]).map(([key, label, step, isPct]) => (
                <div key={key} className="flex items-center justify-between gap-2">
                  <label className="text-xs text-slate-500 dark:text-slate-400">{label}</label>
                  <input
                    type="number"
                    step={step}
                    value={isPct
                      ? ((form[key] as number) ?? 0) * 100
                      : ((form[key] as number) ?? "")}
                    onChange={(e) => {
                      const raw = parseFloat(e.target.value);
                      setForm((f) => ({ ...f, [key]: isNaN(raw) ? 0 : (isPct ? raw / 100 : raw) }));
                    }}
                    className="w-28 px-2 py-1 text-right text-xs rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                  />
                </div>
              ))}
              {([
                ["mgmt_fee_paid_through", "Taxa adm. paga até"],
                ["perf_fee_paid_through", "Perf. cristalizada até"],
              ] as [keyof FundConfig, string][]).map(([key, label]) => (
                <div key={key} className="flex items-center justify-between gap-2">
                  <label className="text-xs text-slate-500 dark:text-slate-400">{label}</label>
                  <input
                    type="date"
                    value={(form[key] as string) ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value || null }))}
                    className="w-36 px-2 py-1 text-xs rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                  />
                </div>
              ))}
              {/* Price at which a manual capital event converts into shares */}
              <div className="flex flex-col gap-1 pt-1 border-t border-slate-200 dark:border-slate-700/60">
                <label className="text-xs text-slate-500 dark:text-slate-400">
                  Cota de emissão (captação/resgate)
                </label>
                <select
                  value={form.flow_share_convention ?? "prev_cota"}
                  onChange={(e) => setForm((f) => ({ ...f, flow_share_convention: e.target.value }))}
                  className="w-full px-2 py-1 text-xs rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                >
                  <option value="prev_cota">Cota do dia anterior (D0 por D-1)</option>
                  <option value="same_cota">Cota do próprio dia (ex-fluxo)</option>
                </select>
              </div>
              <button
                onClick={saveSettings}
                disabled={savingCfg}
                className="w-full mt-1 px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
              >
                {savingCfg ? "Salvando…" : "Salvar parâmetros"}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Headline cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
        <StatCard
          label="Cota Líquida (Net)"
          value={fmt(L.net_cota, 6)}
          sub={`Bruta ${fmt(L.gross_cota, 6)}`}
          icon={Activity}
          trend="neutral"
          color="blue"
        />
        <StatCard
          label="Variação no Dia"
          value={fmtPct4(L.daily_return_pct)}
          sub="vs. cota líquida anterior"
          icon={L.daily_return_pct != null && L.daily_return_pct >= 0 ? TrendingUp : TrendingDown}
          trend={L.daily_return_pct != null ? (L.daily_return_pct >= 0 ? "up" : "down") : "neutral"}
          color={L.daily_return_pct != null && L.daily_return_pct >= 0 ? "emerald" : "rose"}
        />
        <StatCard
          label="Patrimônio Líquido"
          value={`$${fmtM(L.net_nav)}`}
          sub={`Bruto $${fmtM(L.gross_asset_value)}`}
          icon={DollarSign}
          color="violet"
        />
        <StatCard
          label="vs. High-Water Mark"
          value={`${data.excess_over_hwm >= 0 ? "+" : ""}${fmt(data.excess_over_hwm, 6)}`}
          sub={`HWM ${fmt(cfg.high_water_mark, 4)}`}
          icon={data.excess_over_hwm >= 0 ? TrendingUp : TrendingDown}
          trend={data.excess_over_hwm >= 0 ? "up" : "down"}
          color={data.excess_over_hwm >= 0 ? "emerald" : "amber"}
        />
      </div>

      {/* Breakdown + fees-to-pay */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* NAV bridge */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800/60 p-4">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-3">Composição do NAV</h3>
          <div className="space-y-2 text-sm">
            <Row label="Valor das posições" value={`$${fmt(L.asset_value, 2)}`} />
            <div className="flex items-center justify-between gap-2 py-1">
              <span className="text-slate-500 dark:text-slate-400">Caixa ($)</span>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.01"
                  value={cashInput}
                  onChange={(e) => setCashInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") saveCash(); }}
                  className="w-32 px-2 py-1 text-right text-sm rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                />
                <button
                  onClick={saveCash}
                  disabled={savingCash}
                  className="px-2.5 py-1 text-xs font-semibold rounded bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
                >
                  {savingCash ? "…" : "OK"}
                </button>
              </div>
            </div>
            <div className="border-t border-slate-200 dark:border-slate-700/60 pt-2">
              <Row label="Patrimônio bruto" value={`$${fmt(L.gross_asset_value, 2)}`} bold />
            </div>
            <Row label="(−) Taxa de administração acumulada" value={`$${fmt(L.mgmt_fee_accrued, 2)}`} negative />
            <Row label="(−) Provisão de taxa de performance" value={`$${fmt(L.perf_fee_provision, 2)}`} negative />
            <div className="border-t border-slate-200 dark:border-slate-700/60 pt-2">
              <Row label="Patrimônio líquido" value={`$${fmt(L.net_nav, 2)}`} bold />
            </div>
          </div>
        </div>

        {/* Fees to pay (accrued / provisioned) */}
        <div className="rounded-xl border border-amber-200 dark:border-amber-500/20 bg-amber-50/40 dark:bg-amber-500/5 p-4">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-amber-600 dark:text-amber-400 mb-3">
            Taxas a Pagar (provisionado)
          </h3>
          <div className="space-y-2 text-sm">
            <Row label="Taxa de adm. — acumulada" value={`$${fmt(L.mgmt_fee_accrued, 2)}`} />
            <Row label="Taxa de adm. — do dia" value={`$${fmt(L.mgmt_fee_day, 2)}`} muted />
            <Row label="Taxa de performance — provisão" value={`$${fmt(L.perf_fee_provision, 2)}`} />
            <p className="text-[11px] text-slate-500 dark:text-slate-400 pt-1">
              Performance cristaliza ao fim de maio e novembro. Adm. acumulada{" "}
              {cfg.mgmt_fee_paid_through ? `desde ${fmtDate(cfg.mgmt_fee_paid_through)}` : "no mês corrente (paga mensalmente)"}.
            </p>
            <div className="border-t border-amber-200 dark:border-amber-500/20 pt-2">
              <Row label="Total a pagar" value={`$${fmt(data.total_fees_to_pay, 2)}`} bold />
            </div>
          </div>

          {data.official_cota?.nav_per_share != null && (
            <div className="mt-4 pt-3 border-t border-amber-200 dark:border-amber-500/20 text-xs text-slate-500 dark:text-slate-400">
              Cota oficial (administrador): <strong className="text-slate-700 dark:text-slate-200">{fmt(data.official_cota.nav_per_share, 6)}</strong>
              {officialDelta != null && (
                <span className={officialDelta >= 0 ? "text-emerald-500 ml-2" : "text-rose-500 ml-2"}>
                  (calc {officialDelta >= 0 ? "+" : ""}{fmt(officialDelta, 6)})
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, bold, negative, muted }: {
  label: string; value: string; bold?: boolean; negative?: boolean; muted?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className={`${muted ? "text-slate-400 dark:text-slate-500" : "text-slate-500 dark:text-slate-400"}`}>{label}</span>
      <span className={`tabular-nums ${bold ? "font-bold text-slate-900 dark:text-white" : negative ? "text-rose-600 dark:text-rose-400" : "font-medium text-slate-700 dark:text-slate-200"}`}>
        {value}
      </span>
    </div>
  );
}

// ─── Manual fund flows (captações / resgates) ────────────────────────────────

interface ManualFlow {
  date: string;
  subscription: number;
  redemption: number;
  note: string | null;
}

/**
 * Hand entry for capital events past the last administrator upload. The official flow
 * feed stopped, so without these the estimated series has no way to tell a subscription
 * apart from investment performance.
 */
function ManualFlowsPanel({ onSaved }: { onSaved?: () => void }) {
  const [flows, setFlows] = useState<ManualFlow[]>([]);
  const [convention, setConvention] = useState<string>("prev_cota");
  const [date, setDate] = useState("");
  const [subscription, setSubscription] = useState("");
  const [redemption, setRedemption] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await authFetch(`${API_BASE}/igf-tr/manual-flows/`);
      if (res.ok) setFlows(await res.json());
    } catch { /* leave the list as-is; the form still works */ }
    try {
      // Read the issuance convention so the note below states the rule actually in use.
      const res = await authFetch(`${API_BASE}/fund-config/`);
      if (res.ok) {
        const cfg: FundConfig = await res.json();
        if (cfg.flow_share_convention) setConvention(cfg.flow_share_convention);
      }
    } catch { /* keep the default label */ }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setErr(null);
    if (!date) { setErr("Informe a data."); return; }
    const subs = parseFloat(subscription) || 0;
    const redemps = parseFloat(redemption) || 0;
    if (subs < 0 || redemps < 0) { setErr("Use valores positivos."); return; }
    if (!subs && !redemps) { setErr("Informe uma captação ou um resgate."); return; }

    setSaving(true);
    try {
      const res = await authFetch(`${API_BASE}/igf-tr/manual-flows/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, subscription: subs, redemption: redemps, note }),
      });
      if (res.ok) {
        setSubscription(""); setRedemption(""); setNote("");
        await load();
        onSaved?.();
      } else {
        const j = await res.json().catch(() => ({}));
        setErr(j.error || `Erro (HTTP ${res.status})`);
      }
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (d: string) => {
    try {
      const res = await authFetch(`${API_BASE}/igf-tr/manual-flows/?date=${encodeURIComponent(d)}`, {
        method: "DELETE",
      });
      if (res.ok) { await load(); onSaved?.(); }
    } catch { /* ignore — the row stays until the next successful load */ }
  };

  const cardCls = "rounded-xl border border-slate-200 dark:border-slate-800/60 bg-white dark:bg-slate-900/50 shadow-sm";
  const inputCls = "px-2 py-1.5 text-sm rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white";

  return (
    <div className={`${cardCls} p-6`}>
      <SectionHeader
        title="Captações e Resgates (manual)"
        subtitle="Eventos de capital após o último dado do administrador — usados para emitir/cancelar cotas e separar fluxo de performance"
      />

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-[11px] text-slate-500 dark:text-slate-400">Data</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] text-emerald-600 dark:text-emerald-400">Captação ($)</label>
          <input type="number" step="0.01" min="0" placeholder="0,00" value={subscription}
            onChange={(e) => setSubscription(e.target.value)} className={`${inputCls} w-36 text-right`} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] text-rose-600 dark:text-rose-400">Resgate ($)</label>
          <input type="number" step="0.01" min="0" placeholder="0,00" value={redemption}
            onChange={(e) => setRedemption(e.target.value)} className={`${inputCls} w-36 text-right`} />
        </div>
        <div className="flex flex-col gap-1 flex-1 min-w-[10rem]">
          <label className="text-[11px] text-slate-500 dark:text-slate-400">Observação</label>
          <input type="text" placeholder="opcional" value={note}
            onChange={(e) => setNote(e.target.value)} className={`${inputCls} w-full`} />
        </div>
        <button onClick={save} disabled={saving}
          className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 transition-colors">
          {saving ? "Salvando…" : "Lançar"}
        </button>
      </div>

      {err && <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">{err}</p>}

      <p className="mt-3 text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
        Cotas emitidas/canceladas pela{" "}
        <strong>
          {convention === "same_cota" ? "cota do próprio dia (ex-fluxo)" : "cota do dia anterior"}
        </strong>{" "}
        — ajustável em &quot;Parâmetros&quot;. <strong>O caixa do evento também precisa estar refletido
        no dia</strong> — no campo Caixa acima ou já aplicado nas posições — senão o retorno do dia
        sai subestimado. Não ajuste também o parâmetro &quot;Cotas&quot; para o mesmo evento: seria
        contado duas vezes.
      </p>

      {flows.length > 0 && (
        <div className="mt-4 border-t border-slate-200 dark:border-slate-800/60 pt-3">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-slate-400">
                <th className="text-left font-semibold pb-2">Data</th>
                <th className="text-right font-semibold pb-2">Captação</th>
                <th className="text-right font-semibold pb-2">Resgate</th>
                <th className="text-left font-semibold pb-2 pl-4">Obs.</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody>
              {flows.map((f) => (
                <tr key={f.date} className="border-t border-slate-100 dark:border-slate-800/40">
                  <td className="py-1.5 text-slate-700 dark:text-slate-200">{fmtDate(f.date)}</td>
                  <td className="py-1.5 text-right tabular-nums text-emerald-600 dark:text-emerald-400">
                    {f.subscription ? `$${fmt(f.subscription, 2)}` : "—"}
                  </td>
                  <td className="py-1.5 text-right tabular-nums text-rose-600 dark:text-rose-400">
                    {f.redemption ? `$${fmt(f.redemption, 2)}` : "—"}
                  </td>
                  <td className="py-1.5 pl-4 text-slate-500 dark:text-slate-400 text-xs">{f.note || "—"}</td>
                  <td className="py-1.5 text-right">
                    <button onClick={() => remove(f.date)}
                      className="text-xs text-slate-400 hover:text-rose-500 transition-colors">
                      remover
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
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
  // Prefer the unified series (official history chain-linked onto the calculated
  // estimate) so cota / NAV / KPIs continue past the last administrator upload.
  // Falls back to the raw official rows when the splice isn't available.
  const unified = data?.unified ?? null;

  const navRows = useMemo(() => {
    const rows = unified?.series?.length ? unified.series : (data?.nav_positions ?? []);
    return [...rows].sort((a, b) => a.date.localeCompare(b.date));
  }, [unified, data]);

  /** Last date backed by the official upload — everything after it is estimated. */
  const officialThrough = unified?.official_through ?? null;
  const hasEstimate = !!unified?.has_estimate;

  // ── Cota series ────────────────────────────────────────────────────────────
  const cotaSeries = useMemo(
    () => navRows
      .filter((r) => r.nav_per_share != null)
      .map((r) => ({ date: r.date, value: r.nav_per_share!, isEstimated: !!r.is_estimated })),
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

    // Index of the last official point, so the dashed estimated line can start there
    // and visually connect to the solid official line instead of floating detached.
    let lastOfficialIdx = -1;
    filtered.forEach((p, i) => { if (!p.isEstimated) lastOfficialIdx = i; });

    return filtered.map((p, i) => {
      const idxVal = idxBase != null ? idxMap.get(p.date) : undefined;
      const pct = parseFloat(((p.value / cotaBase - 1) * 100).toFixed(4));
      return {
        date: fmtDate(p.date),
        rawDate: p.date,
        // Split across two keys so the estimated tail renders dashed. The splice
        // point itself belongs to both so the segments join.
        fundo: p.isEstimated ? undefined : pct,
        fundoEst: p.isEstimated || i === lastOfficialIdx ? pct : undefined,
        isEstimated: p.isEstimated,
        indice: idxVal != null && idxBase != null ? parseFloat(((idxVal / idxBase - 1) * 100).toFixed(4)) : undefined,
      };
    });
  }, [cotaSeries, cotaRange, compareIndex, data]);

  const cotaHasEstimatedInRange = useMemo(
    () => cotaChartData.some((p) => p.isEstimated),
    [cotaChartData]
  );

  // Ticks aligned to the last data point of each month (used for grid + X-axis labels)
  const cotaMonthEndTicks = useMemo(() => {
    const byMonth = new Map<string, string>();
    for (const p of cotaChartData) {
      byMonth.set(p.rawDate.slice(0, 7), p.date);
    }
    return Array.from(byMonth.values());
  }, [cotaChartData]);

  const isCompareMode = compareIndex != null && cotaChartData.some((p) => p.indice != null);

  const cotaDomain = useMemo((): [number, number] => {
    const values = cotaChartData.flatMap((p) =>
      [p.fundo, p.fundoEst, p.indice].filter((v): v is number => v != null)
    );
    if (!values.length) return [-1, 1];
    const min = Math.min(...values);
    const max = Math.max(...values);
    const pad = (max - min) * 0.05 || 0.5;
    return [parseFloat((min - pad).toFixed(2)), parseFloat((max + pad).toFixed(2))];
  }, [cotaChartData]);

  // ── Flows chart data (monthly aggregation) ─────────────────────────────────
  const flowsChartData = useMemo(() => {
    const byMonth: Record<string, { subscriptions: number; redemptions: number; manual: boolean }> = {};
    for (const row of navRows) {
      // Past the official cutoff the only flow data is what was entered by hand, so an
      // estimated row counts only when it actually carries an amount. Rows with null
      // flows are skipped rather than folded in as zeros — "unknown" is not "no flows".
      const hasFlow = row.subscription_d0 != null || row.redemption_d0 != null;
      if (row.is_estimated && !hasFlow) continue;

      const monthKey = row.date.slice(0, 7);
      if (!byMonth[monthKey]) byMonth[monthKey] = { subscriptions: 0, redemptions: 0, manual: false };
      byMonth[monthKey].subscriptions += row.subscription_d0 ?? 0;
      byMonth[monthKey].redemptions += Math.abs(row.redemption_d0 ?? 0) + Math.abs(row.redemption_d1 ?? 0);
      if (row.is_estimated) byMonth[monthKey].manual = true;
    }
    const sorted = Object.entries(byMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, v]) => ({
        date: month,
        month: fmtMonthYear(month + "-01"),
        subscriptions: v.subscriptions,
        manual: v.manual,
      }));
    return filterByRange(sorted, flowsRange);
  }, [navRows, flowsRange]);

  // ── NAV chart data ─────────────────────────────────────────────────────────
  const navChartData = useMemo(() => {
    const series = navRows
      .filter((r) => r.nav != null)
      .map((r) => ({ date: r.date, nav: r.nav!, isEstimated: !!r.is_estimated }));
    const filtered = filterByRange(series, navRange);

    // Same two-key split as the cota chart so the estimated tail renders dashed.
    let lastOfficialIdx = -1;
    filtered.forEach((p, i) => { if (!p.isEstimated) lastOfficialIdx = i; });

    return filtered.map((p, i) => ({
      date: fmtDate(p.date),
      nav: p.isEstimated ? undefined : p.nav,
      navEst: p.isEstimated || i === lastOfficialIdx ? p.nav : undefined,
      isEstimated: p.isEstimated,
    }));
  }, [navRows, navRange]);

  const navHasEstimatedInRange = useMemo(
    () => navChartData.some((p) => p.isEstimated),
    [navChartData]
  );

  // ── KPI stats ──────────────────────────────────────────────────────────────
  const latest = navRows[navRows.length - 1] ?? null;
  const prev = navRows[navRows.length - 2] ?? null;

  const cotaChange = latest?.nav_per_share != null && prev?.nav_per_share != null
    ? latest.nav_per_share - prev.nav_per_share : null;
  const cotaChangePct = cotaChange != null && prev?.nav_per_share
    ? (cotaChange / prev.nav_per_share) * 100 : null;

  // Period returns off the unified series, so they run to the latest estimated point
  // instead of stopping at the last administrator upload.
  //
  // Base = last cota strictly *before* the period, so the move into the first day of
  // the period counts (matching compute_calculated_nav); falls back to the first
  // observation inside the period when no prior point exists.
  const periodReturn = useCallback((granularity: "month" | "year"): number | null => {
    if (!cotaSeries.length || latest?.nav_per_share == null) return null;
    const key = (d: string) => (granularity === "year" ? d.slice(0, 4) : d.slice(0, 7));
    const currentKey = key(cotaSeries[cotaSeries.length - 1].date);

    let base: number | null = null;
    let firstInPeriod: number | null = null;
    for (const p of cotaSeries) {
      if (key(p.date) < currentKey) base = p.value;
      else if (firstInPeriod == null) firstInPeriod = p.value;
    }
    const ref = base ?? firstInPeriod;
    if (!ref) return null;
    return ((latest.nav_per_share / ref) - 1) * 100;
  }, [cotaSeries, latest]);

  const mtdReturn = useMemo(() => periodReturn("month"), [periodReturn]);
  const ytdReturn = useMemo(() => periodReturn("year"), [periodReturn]);

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
            {/* Splice notice — makes clear where official data ends and the estimate begins */}
            {hasEstimate && officialThrough && (
              <div className="rounded-xl border border-amber-300 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 px-4 py-3 flex items-start gap-3">
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                <p className="text-xs text-amber-800 dark:text-amber-200 leading-relaxed">
                  <span className="font-semibold">Série emendada.</span>{" "}
                  Dados oficiais do administrador até <span className="font-semibold">{fmtDate(officialThrough)}</span>.
                  A partir daí a cota é <span className="font-semibold">estimada</span> a partir dos preços dos
                  Portfolio snapshots, encadeada pelo retorno diário sobre a última cota oficial (linha tracejada).
                  {unified?.shares_latest != null && (
                    <> O NAV estimado usa {fmtM(unified.shares_latest)} cotas
                    {unified.manual_flows_applied ? (
                      <>, já incluindo {unified.manual_flows_applied} lançamento
                      {unified.manual_flows_applied > 1 ? "s" : ""} manual
                      {unified.manual_flows_applied > 1 ? "is" : ""} de capital.</>
                    ) : (
                      <> (última quantidade oficial). Captações ou resgates após o corte só entram se lançados
                      abaixo — sem isso, o dinheiro que entrar aparece como performance.</>
                    )}</>
                  )}
                </p>
              </div>
            )}

            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              <StatCard
                label={latest?.is_estimated ? "Cota Atual (Estimada)" : "Cota Atual (NAV/Cota)"}
                value={latest?.nav_per_share != null ? fmtSig(latest.nav_per_share, 4) : "—"}
                sub={latest?.date ? `${fmtDate(latest.date)}${latest?.is_estimated ? " · est." : ""}` : undefined}
                icon={Activity}
                trend="neutral"
                color="blue"
              />
              <StatCard
                label="Variação no Dia"
                value={cotaChange != null ? `${cotaChange >= 0 ? "+" : ""}${fmtSig(cotaChange, 4)}` : "—"}
                sub={cotaChangePct != null ? `${cotaChangePct >= 0 ? "+" : ""}${fmtSig(cotaChangePct, 4)}%` : undefined}
                icon={cotaChange != null && cotaChange >= 0 ? TrendingUp : TrendingDown}
                trend={cotaChange != null ? (cotaChange >= 0 ? "up" : "down") : "neutral"}
                color={cotaChange != null && cotaChange >= 0 ? "emerald" : "rose"}
              />
              <StatCard
                label="Retorno MTD"
                value={mtdReturn != null ? `${mtdReturn >= 0 ? "+" : ""}${mtdReturn.toFixed(2)}%` : "—"}
                sub={`Acumulado no mês${latest?.is_estimated ? " · est." : ""}`}
                icon={mtdReturn != null && mtdReturn >= 0 ? TrendingUp : TrendingDown}
                trend={mtdReturn != null ? (mtdReturn >= 0 ? "up" : "down") : "neutral"}
                color={mtdReturn != null && mtdReturn >= 0 ? "emerald" : "rose"}
              />
              <StatCard
                label="Retorno YTD"
                value={ytdReturn != null ? `${ytdReturn >= 0 ? "+" : ""}${ytdReturn.toFixed(2)}%` : "—"}
                sub={`Acumulado no ano${latest?.is_estimated ? " · est." : ""}`}
                icon={ytdReturn != null && ytdReturn >= 0 ? TrendingUp : TrendingDown}
                trend={ytdReturn != null ? (ytdReturn >= 0 ? "up" : "down") : "neutral"}
                color={ytdReturn != null && ytdReturn >= 0 ? "emerald" : "rose"}
              />
              <StatCard
                label={latest?.is_estimated ? "Patrimônio (Estimado)" : "Patrimônio (NAV)"}
                value={latest?.nav != null ? `$${fmtM(latest.nav)}` : "—"}
                sub={latest?.shares != null ? `${fmtM(latest.shares)} cotas` : undefined}
                icon={DollarSign}
                color="violet"
              />
            </div>

            {/* Cota Calculada (Estimada) — NAV from daily prices, net of fees */}
            <CalculatedNavPanel />

            {/* Manual capital events — only relevant once the official feed has stopped */}
            {hasEstimate && <ManualFlowsPanel onSaved={fetchData} />}


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

              {/* Legend when comparing and/or when the estimated tail is on screen */}
              {(isCompareMode || cotaHasEstimatedInRange) && (
                <div className="flex items-center gap-5 mb-4 flex-wrap">
                  <span className="flex items-center gap-1.5 text-xs text-slate-500">
                    <span className="w-5 h-0.5 rounded bg-blue-500 inline-block" />
                    IGF TR {cotaHasEstimatedInRange && <span className="text-slate-400">(oficial)</span>}
                  </span>
                  {cotaHasEstimatedInRange && (
                    <span className="flex items-center gap-1.5 text-xs text-slate-500">
                      <span className="w-5 inline-block" style={{ borderTop: "2px dashed #8b5cf6" }} />
                      IGF TR (estimado{officialThrough ? ` · após ${fmtDate(officialThrough)}` : ""})
                    </span>
                  )}
                  {isCompareMode && (
                    <span className="flex items-center gap-1.5 text-xs text-slate-500">
                      <span className="w-5 inline-block" style={{ borderTop: "2px dashed #fb923c" }} />
                      {indexDisplayName(compareIndex!)}
                    </span>
                  )}
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
                    <XAxis
                      dataKey="date"
                      tick={{ fill: "#94a3b8", fontSize: 10 }}
                      tickLine={false}
                      axisLine={false}
                      ticks={cotaMonthEndTicks}
                      interval={0}
                    />
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
                    {cotaHasEstimatedInRange && (
                      <Line type="monotone" dataKey="fundoEst" name="IGF TR (estimado)" stroke="#8b5cf6" strokeWidth={2} strokeDasharray="4 3" dot={false} activeDot={{ r: 4, fill: "#8b5cf6" }} connectNulls />
                    )}
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
                    subtitle={navHasEstimatedInRange
                      ? `Evolução do patrimônio — tracejado estimado após ${officialThrough ? fmtDate(officialThrough) : "o último dado oficial"}`
                      : "Evolução do patrimônio total do fundo"}
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
                      <YAxis tick={{ fill: "#94a3b8", fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v) => `$${fmtM(v)}`} width={72} />
                      <Tooltip content={<ChartTooltip formatter={(v: number) => `$${fmtM(v)}`} />} />
                      <Area type="monotone" dataKey="nav" name="Patrimônio" stroke="#8b5cf6" strokeWidth={2} fill="url(#navGrad)" dot={false} activeDot={{ r: 4, fill: "#8b5cf6" }} />
                      {navHasEstimatedInRange && (
                        <Area type="monotone" dataKey="navEst" name="Patrimônio (estimado)" stroke="#8b5cf6" strokeWidth={2} strokeDasharray="4 3" fill="url(#navGrad)" fillOpacity={0.5} dot={false} activeDot={{ r: 4, fill: "#8b5cf6" }} connectNulls />
                      )}
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
                      subtitle={hasEstimate && officialThrough
                        ? `Oficial até ${fmtDate(officialThrough)}; depois somente lançamentos manuais`
                        : "Subscription D0 — fluxo mensal de aplicações"}
                    />
                    <div className="flex items-center gap-3 mt-2 flex-wrap">
                      <span className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-sm bg-emerald-500/80 inline-block" />
                        <span className="text-xs text-slate-500">Total: <strong className="text-emerald-600 dark:text-emerald-400">${fmtM(totalSubs)}</strong></span>
                      </span>
                      {flowsChartData.some((m) => m.manual) && (
                        <span className="flex items-center gap-2">
                          <span className="w-3 h-3 rounded-sm bg-sky-400/80 inline-block" />
                          <span className="text-xs text-slate-500">Lançamento manual</span>
                        </span>
                      )}
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
                      <Tooltip content={<ChartTooltip formatter={(v: number) => `$${fmtM(v)}`} />} />
                      {/* Manual (post-cutoff) months are tinted so they aren't read as official */}
                      <Bar dataKey="subscriptions" name="Captações" fill="#10b981" fillOpacity={0.85} radius={[3, 3, 0, 0]}>
                        {flowsChartData.map((m) => (
                          <Cell key={m.date} fill={m.manual ? "#38bdf8" : "#10b981"} />
                        ))}
                      </Bar>
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
                              {latestAlloc.total != null ? `$${fmtM(latestAlloc.total as number * pct / 100)}` : ""}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                    <div className={`${cardCls} px-4 py-3 flex items-center gap-3 min-w-[140px]`}>
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Total</p>
                        <p className="text-lg font-bold text-slate-900 dark:text-white tabular-nums">
                          {latestAlloc.total != null ? `$${fmtM(latestAlloc.total as number)}` : "—"}
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

        {/* navRows, not nav_positions — the unified series can carry estimated points
            even when no official upload exists, and that isn't "no data". */}
        {!loading && !error && data && !navRows.length && (
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

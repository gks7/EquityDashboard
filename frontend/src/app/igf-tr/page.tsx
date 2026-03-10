"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  ResponsiveContainer, LineChart, Line, AreaChart, Area,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ReferenceLine,
} from "recharts";
import { TrendingUp, TrendingDown, Activity, DollarSign, ArrowUpDown, RefreshCcw, ChevronDown } from "lucide-react";
import { authFetch } from "@/lib/authFetch";

const API_BASE = `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api`;

// ─── Types ──────────────────────────────────────────────────────────────────

interface IndexPriceRow {
  date: string;
  fund: string;
  asset: string;
  info: string;
  flt_value: number;
  st_value: string | null;
}

interface CashTxRow {
  date: string;
  fund: string;
  amount: number;
  type: string;
  cash_account: string | null;
  obs: string | null;
}

interface NavRow {
  date: string;
  nav: number;
}

interface IgfData {
  index_prices: IndexPriceRow[];
  cash_transactions: CashTxRow[];
  nav_history: NavRow[];
  available_funds: string[];
  available_assets: string[];
  available_infos: string[];
  available_tx_types: string[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const fmt = (n: number | null | undefined, decimals = 2) =>
  n == null ? "—" : n.toLocaleString("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

const fmtM = (n: number) => {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toFixed(0);
};

const fmtDate = (d: string) => {
  if (!d) return "";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
};

const fmtMonthYear = (d: string) => {
  if (!d) return "";
  const [y, m] = d.split("-");
  const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  return `${months[parseInt(m) - 1]}/${y.slice(2)}`;
};

// Re-index a series to 100 at the first available date
const reindex = (series: { date: string; value: number }[]) => {
  if (!series.length) return [];
  const base = series[0].value;
  if (!base) return series;
  return series.map((p) => ({ ...p, indexed: parseFloat(((p.value / base) * 100).toFixed(4)) }));
};

// ─── Custom Tooltip ──────────────────────────────────────────────────────────

const ChartTooltip = ({ active, payload, label, formatter }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#0f1629] border border-slate-700/60 rounded-xl px-4 py-3 shadow-2xl text-xs min-w-[160px]">
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

// ─── Stat Card ───────────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, icon: Icon, trend, color = "blue",
}: {
  label: string; value: string; sub?: string;
  icon: React.ElementType; trend?: "up" | "down" | "neutral"; color?: string;
}) {
  const colors: Record<string, string> = {
    blue: "from-blue-500/20 to-blue-600/5 border-blue-500/20",
    emerald: "from-emerald-500/20 to-emerald-600/5 border-emerald-500/20",
    violet: "from-violet-500/20 to-violet-600/5 border-violet-500/20",
    amber: "from-amber-500/20 to-amber-600/5 border-amber-500/20",
    rose: "from-rose-500/20 to-rose-600/5 border-rose-500/20",
  };
  const iconColors: Record<string, string> = {
    blue: "text-blue-400", emerald: "text-emerald-400",
    violet: "text-violet-400", amber: "text-amber-400", rose: "text-rose-400",
  };
  return (
    <div className={`rounded-2xl border bg-gradient-to-br ${colors[color]} p-5 flex flex-col gap-3`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">{label}</span>
        <Icon className={`w-4 h-4 ${iconColors[color]}`} />
      </div>
      <div>
        <p className="text-2xl font-bold text-white tracking-tight">{value}</p>
        {sub && (
          <p className={`text-xs mt-1 font-medium ${trend === "up" ? "text-emerald-400" : trend === "down" ? "text-rose-400" : "text-slate-500"}`}>
            {sub}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Section Header ──────────────────────────────────────────────────────────

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-sm font-semibold text-white tracking-wide">{title}</h2>
      {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
    </div>
  );
}

// ─── Dropdown ────────────────────────────────────────────────────────────────

function Dropdown({ value, options, onChange, placeholder = "Select…" }: {
  value: string; options: { value: string; label: string }[];
  onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none bg-slate-800/60 border border-slate-700/60 text-slate-200 text-xs rounded-lg pl-3 pr-8 py-2 focus:outline-none focus:border-blue-500/60 cursor-pointer transition-colors"
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

// ─── RANGE BUTTONS ───────────────────────────────────────────────────────────

const RANGES = ["1M", "3M", "6M", "YTD", "1A", "3A", "Máx"] as const;
type Range = typeof RANGES[number];

function filterByRange<T extends { date: string }>(data: T[], range: Range): T[] {
  if (range === "Máx" || !data.length) return data;
  const last = new Date(data[data.length - 1].date);
  const cutoff = new Date(last);
  if (range === "1M") cutoff.setMonth(cutoff.getMonth() - 1);
  else if (range === "3M") cutoff.setMonth(cutoff.getMonth() - 3);
  else if (range === "6M") cutoff.setMonth(cutoff.getMonth() - 6);
  else if (range === "YTD") cutoff.setMonth(0, 1);
  else if (range === "1A") cutoff.setFullYear(cutoff.getFullYear() - 1);
  else if (range === "3A") cutoff.setFullYear(cutoff.getFullYear() - 3);
  return data.filter((d) => new Date(d.date) >= cutoff);
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function IgfTrPage() {
  const [data, setData] = useState<IgfData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [selectedFund, setSelectedFund] = useState("");
  const [cotaAsset, setCotaAsset] = useState("");
  const [cotaInfo, setCotaInfo] = useState("");
  const [compareAsset, setCompareAsset] = useState("");
  const [compareInfo, setCompareInfo] = useState("");
  const [cotaRange, setCotaRange] = useState<Range>("Máx");
  const [navRange, setNavRange] = useState<Range>("Máx");
  const [flowsRange, setFlowsRange] = useState<Range>("Máx");
  const [subType, setSubType] = useState("");
  const [redType, setRedType] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = selectedFund ? `?fund=${encodeURIComponent(selectedFund)}` : "";
      const res = await authFetch(`${API_BASE}/igf-tr/${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: IgfData = await res.json();
      setData(json);

      // Auto-select first available cota series
      if (!cotaAsset && json.available_assets.length) setCotaAsset(json.available_assets[0]);
      if (!cotaInfo && json.available_infos.length) setCotaInfo(json.available_infos[0]);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [selectedFund]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Derived series ─────────────────────────────────────────────────────────

  const cotaSeries = useMemo(() => {
    if (!data) return [];
    let rows = data.index_prices;
    if (cotaAsset) rows = rows.filter((r) => r.asset === cotaAsset);
    if (cotaInfo) rows = rows.filter((r) => r.info === cotaInfo);
    return rows
      .filter((r) => r.flt_value != null)
      .map((r) => ({ date: r.date, value: r.flt_value }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [data, cotaAsset, cotaInfo]);

  const compareSeries = useMemo(() => {
    if (!data || !compareAsset) return [];
    let rows = data.index_prices.filter((r) => r.asset === compareAsset);
    if (compareInfo) rows = rows.filter((r) => r.info === compareInfo);
    return rows
      .filter((r) => r.flt_value != null)
      .map((r) => ({ date: r.date, value: r.flt_value }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [data, compareAsset, compareInfo]);

  // Merge cota + compare into a single indexed series for the comparison chart
  const cotaChartData = useMemo(() => {
    const ranged = filterByRange(cotaSeries, cotaRange);
    const indexed = reindex(ranged);
    if (!compareAsset || !compareSeries.length) {
      return indexed.map((p) => ({ date: fmtDate(p.date), rawDate: p.date, cota: p.indexed }));
    }
    // Align compare to same date range
    const minDate = ranged.length ? ranged[0].date : "";
    const compFiltered = compareSeries.filter((p) => p.date >= minDate);
    const compIndexed = reindex(compFiltered);
    const compMap = new Map(compIndexed.map((p) => [p.date, p.indexed]));
    return indexed.map((p) => ({
      date: fmtDate(p.date), rawDate: p.date,
      cota: p.indexed,
      compare: compMap.get(p.rawDate) ?? null,
    }));
  }, [cotaSeries, compareSeries, cotaRange, compareAsset]);

  // NAV over time
  const navChartData = useMemo(() => {
    if (!data) return [];
    const ranged = filterByRange(data.nav_history, navRange);
    return ranged.map((p) => ({ date: fmtDate(p.date), nav: p.nav }));
  }, [data, navRange]);

  // Subscriptions & redemptions — aggregate by month
  const flowsChartData = useMemo(() => {
    if (!data) return [];
    const txs = data.cash_transactions.filter((t) => {
      if (!t.date || t.amount == null) return false;
      const typeLC = (t.type || "").toLowerCase();
      const isSub = subType
        ? t.type === subType
        : typeLC.includes("subscri") || typeLC.includes("applica") || typeLC.includes("entrada") || typeLC.includes("sub");
      const isRed = redType
        ? t.type === redType
        : typeLC.includes("redemp") || typeLC.includes("resgate") || typeLC.includes("saída") || typeLC.includes("red");
      return isSub || isRed;
    });

    const byMonth: Record<string, { subscriptions: number; redemptions: number }> = {};
    for (const tx of txs) {
      const monthKey = tx.date.slice(0, 7);
      if (!byMonth[monthKey]) byMonth[monthKey] = { subscriptions: 0, redemptions: 0 };
      const typeLC = (tx.type || "").toLowerCase();
      const isSub = subType
        ? tx.type === subType
        : typeLC.includes("subscri") || typeLC.includes("applica") || typeLC.includes("entrada") || typeLC.includes("sub");
      if (isSub) byMonth[monthKey].subscriptions += tx.amount;
      else byMonth[monthKey].redemptions += Math.abs(tx.amount);
    }
    const sorted = Object.entries(byMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, v]) => ({
        date: month,
        month: fmtMonthYear(month + "-01"),
        subscriptions: v.subscriptions,
        redemptions: -v.redemptions,
        net: v.subscriptions - v.redemptions,
      }));
    return filterByRange(sorted, flowsRange);
  }, [data, flowsRange, subType, redType]);

  // ── Key stats ──────────────────────────────────────────────────────────────

  const latestCota = cotaSeries[cotaSeries.length - 1]?.value ?? null;
  const prevCota = cotaSeries[cotaSeries.length - 2]?.value ?? null;
  const cotaChange = latestCota && prevCota ? latestCota - prevCota : null;
  const cotaChangePct = cotaChange && prevCota ? (cotaChange / prevCota) * 100 : null;

  const latestNav = data?.nav_history[data.nav_history.length - 1]?.nav ?? null;

  const ytdCota = useMemo(() => {
    if (!cotaSeries.length) return null;
    const year = new Date(cotaSeries[cotaSeries.length - 1].date).getFullYear();
    const ytdStart = cotaSeries.find((p) => new Date(p.date).getFullYear() === year);
    if (!ytdStart) return null;
    return ((latestCota! / ytdStart.value) - 1) * 100;
  }, [cotaSeries, latestCota]);

  const totalSubs = useMemo(() => flowsChartData.reduce((s, r) => s + r.subscriptions, 0), [flowsChartData]);
  const totalReds = useMemo(() => flowsChartData.reduce((s, r) => s + Math.abs(r.redemptions), 0), [flowsChartData]);

  // ── Asset / Info option lists ──────────────────────────────────────────────

  const assetOptions = useMemo(
    () => (data?.available_assets ?? []).map((a) => ({ value: a, label: a })),
    [data]
  );
  const infoOptions = useMemo(
    () => (data?.available_infos ?? []).map((i) => ({ value: i, label: i })),
    [data]
  );
  const txTypeOptions = useMemo(
    () => (data?.available_tx_types ?? []).map((t) => ({ value: t, label: t })),
    [data]
  );
  const fundOptions = useMemo(
    () => (data?.available_funds ?? []).map((f) => ({ value: f, label: f })),
    [data]
  );

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#060d1f] text-white">
      {/* ── Header bar ── */}
      <div className="border-b border-slate-800/60 bg-[#080f23]/80 backdrop-blur-sm px-8 py-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2.5 mb-1">
              <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#10b981]" />
              <span className="text-[10px] font-semibold text-emerald-400 uppercase tracking-widest">Live</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white">IGF TR</h1>
            <p className="text-xs text-slate-500 mt-0.5">Fundo de Investimento — Histórico e Performance</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {data?.available_funds && data.available_funds.length > 1 && (
              <Dropdown
                value={selectedFund}
                options={fundOptions}
                onChange={setSelectedFund}
                placeholder="Todos os fundos"
              />
            )}
            <button
              onClick={fetchData}
              className="flex items-center gap-2 px-3 py-2 text-xs font-medium bg-slate-800/60 border border-slate-700/60 text-slate-300 rounded-lg hover:bg-slate-700/60 transition-colors"
            >
              <RefreshCcw className="w-3.5 h-3.5" />
              Atualizar
            </button>
          </div>
        </div>
      </div>

      <div className="px-8 py-7 space-y-8 max-w-[1600px]">

        {/* ── Loading / Error ── */}
        {loading && (
          <div className="flex items-center justify-center h-64">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-slate-400">Carregando dados…</p>
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-6 py-5 text-sm text-rose-300">
            Erro ao carregar dados: {error}
          </div>
        )}

        {!loading && !error && data && (
          <>
            {/* ── KPI Cards ── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard
                label="Cota Atual"
                value={latestCota ? fmt(latestCota, 4) : "—"}
                sub={cotaChangePct != null ? `${cotaChangePct >= 0 ? "+" : ""}${cotaChangePct.toFixed(2)}% no dia` : undefined}
                icon={Activity}
                trend={cotaChangePct != null ? (cotaChangePct >= 0 ? "up" : "down") : "neutral"}
                color="blue"
              />
              <StatCard
                label="Variação no Dia"
                value={cotaChange != null ? `${cotaChange >= 0 ? "+" : ""}${fmt(cotaChange, 4)}` : "—"}
                sub={cotaSeries[cotaSeries.length - 1]?.date ? fmtDate(cotaSeries[cotaSeries.length - 1].date) : undefined}
                icon={cotaChange != null && cotaChange >= 0 ? TrendingUp : TrendingDown}
                trend={cotaChange != null ? (cotaChange >= 0 ? "up" : "down") : "neutral"}
                color={cotaChange != null && cotaChange >= 0 ? "emerald" : "rose"}
              />
              <StatCard
                label="Retorno YTD"
                value={ytdCota != null ? `${ytdCota >= 0 ? "+" : ""}${ytdCota.toFixed(2)}%` : "—"}
                sub="Acumulado no ano"
                icon={TrendingUp}
                trend={ytdCota != null ? (ytdCota >= 0 ? "up" : "down") : "neutral"}
                color={ytdCota != null && ytdCota >= 0 ? "emerald" : "rose"}
              />
              <StatCard
                label="Patrimônio Total"
                value={latestNav ? `R$ ${fmtM(latestNav)}` : "—"}
                sub="Posições consolidadas"
                icon={DollarSign}
                color="violet"
              />
            </div>

            {/* ── Cota Histórica ── */}
            <div className="rounded-2xl border border-slate-800/60 bg-[#0c1528]/80 p-6">
              <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
                <SectionHeader
                  title="Cota Histórica"
                  subtitle="Evolução do valor da cota indexado à base 100"
                />
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Series selector */}
                  <Dropdown value={cotaAsset} options={assetOptions} onChange={setCotaAsset} placeholder="Ativo (Cota)" />
                  <Dropdown value={cotaInfo} options={infoOptions} onChange={setCotaInfo} placeholder="Tipo de Info" />
                  {/* Comparar com */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">Comparar:</span>
                    <Dropdown value={compareAsset} options={assetOptions} onChange={setCompareAsset} placeholder="Índice" />
                    {compareAsset && (
                      <Dropdown value={compareInfo} options={infoOptions} onChange={setCompareInfo} placeholder="Tipo" />
                    )}
                  </div>
                  {/* Range buttons */}
                  <div className="flex items-center gap-0.5 bg-slate-800/60 rounded-lg p-0.5 border border-slate-700/40">
                    {RANGES.map((r) => (
                      <button
                        key={r}
                        onClick={() => setCotaRange(r)}
                        className={`px-2.5 py-1 text-[10px] font-semibold rounded-md transition-all ${cotaRange === r
                          ? "bg-blue-600 text-white shadow"
                          : "text-slate-400 hover:text-slate-200"
                          }`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {cotaChartData.length === 0 ? (
                <EmptyState message="Nenhum dado de cota disponível. Verifique os filtros de ativo e tipo de informação." />
              ) : (
                <ResponsiveContainer width="100%" height={320}>
                  <LineChart data={cotaChartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="cotaGrad" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#3b82f6" />
                        <stop offset="100%" stopColor="#8b5cf6" />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="date" tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                    <YAxis tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v) => v.toFixed(1)} width={48} />
                    <Tooltip
                      content={<ChartTooltip formatter={(v: number) => v.toFixed(2)} />}
                    />
                    <ReferenceLine y={100} stroke="#334155" strokeDasharray="4 4" />
                    <Line
                      type="monotone" dataKey="cota" name={cotaAsset || "Cota"}
                      stroke="url(#cotaGrad)" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: "#3b82f6" }}
                    />
                    {compareAsset && (
                      <Line
                        type="monotone" dataKey="compare" name={compareAsset}
                        stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="4 3" dot={false}
                        activeDot={{ r: 3, fill: "#f59e0b" }}
                      />
                    )}
                    {compareAsset && <Legend wrapperStyle={{ fontSize: 11, color: "#94a3b8" }} />}
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* ── NAV over time ── */}
            <div className="rounded-2xl border border-slate-800/60 bg-[#0c1528]/80 p-6">
              <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
                <SectionHeader
                  title="Patrimônio Líquido (NAV)"
                  subtitle="Evolução do patrimônio total do fundo"
                />
                <div className="flex items-center gap-0.5 bg-slate-800/60 rounded-lg p-0.5 border border-slate-700/40">
                  {RANGES.map((r) => (
                    <button
                      key={r}
                      onClick={() => setNavRange(r)}
                      className={`px-2.5 py-1 text-[10px] font-semibold rounded-md transition-all ${navRange === r
                        ? "bg-violet-600 text-white shadow"
                        : "text-slate-400 hover:text-slate-200"
                        }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>

              {navChartData.length === 0 ? (
                <EmptyState message="Nenhum dado de patrimônio disponível. Faça upload dos dados de posições históricas." />
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart data={navChartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="navGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="date" tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                    <YAxis tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v) => `R$ ${fmtM(v)}`} width={64} />
                    <Tooltip
                      content={<ChartTooltip formatter={(v: number) => `R$ ${fmtM(v)}`} />}
                    />
                    <Area
                      type="monotone" dataKey="nav" name="Patrimônio"
                      stroke="#8b5cf6" strokeWidth={2} fill="url(#navGrad)"
                      activeDot={{ r: 4, fill: "#8b5cf6" }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* ── Subscriptions & Redemptions ── */}
            <div className="rounded-2xl border border-slate-800/60 bg-[#0c1528]/80 p-6">
              <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
                <div>
                  <SectionHeader
                    title="Captações e Resgates"
                    subtitle="Fluxo mensal de aplicações e resgates"
                  />
                  <div className="flex items-center gap-4 mt-2">
                    <span className="flex items-center gap-1.5 text-xs text-slate-400">
                      <span className="w-3 h-3 rounded-sm bg-emerald-500/80" />
                      Captações: <strong className="text-emerald-400">R$ {fmtM(totalSubs)}</strong>
                    </span>
                    <span className="flex items-center gap-1.5 text-xs text-slate-400">
                      <span className="w-3 h-3 rounded-sm bg-rose-500/80" />
                      Resgates: <strong className="text-rose-400">R$ {fmtM(totalReds)}</strong>
                    </span>
                    <span className="flex items-center gap-1.5 text-xs text-slate-400">
                      Líquido: <strong className={totalSubs - totalReds >= 0 ? "text-emerald-400" : "text-rose-400"}>
                        R$ {fmtM(totalSubs - totalReds)}
                      </strong>
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider">Captação:</span>
                    <Dropdown value={subType} options={txTypeOptions} onChange={setSubType} placeholder="Auto" />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider">Resgate:</span>
                    <Dropdown value={redType} options={txTypeOptions} onChange={setRedType} placeholder="Auto" />
                  </div>
                  <div className="flex items-center gap-0.5 bg-slate-800/60 rounded-lg p-0.5 border border-slate-700/40">
                    {RANGES.map((r) => (
                      <button
                        key={r}
                        onClick={() => setFlowsRange(r)}
                        className={`px-2.5 py-1 text-[10px] font-semibold rounded-md transition-all ${flowsRange === r
                          ? "bg-emerald-600 text-white shadow"
                          : "text-slate-400 hover:text-slate-200"
                          }`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {flowsChartData.length === 0 ? (
                <EmptyState message="Nenhum dado de fluxo disponível. Verifique os tipos de transação ou faça upload dos dados." />
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={flowsChartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }} barCategoryGap="30%">
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                    <XAxis dataKey="month" tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v) => `${fmtM(Math.abs(v))}`} width={52} />
                    <Tooltip
                      content={<ChartTooltip formatter={(v: number, name: string) => `R$ ${fmtM(Math.abs(v))}`} />}
                    />
                    <ReferenceLine y={0} stroke="#334155" />
                    <Bar dataKey="subscriptions" name="Captações" fill="#10b981" fillOpacity={0.85} radius={[3, 3, 0, 0]} />
                    <Bar dataKey="redemptions" name="Resgates" fill="#ef4444" fillOpacity={0.85} radius={[0, 0, 3, 3]} />
                    <Legend wrapperStyle={{ fontSize: 11, color: "#94a3b8", paddingTop: 8 }} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* ── Summary table — latest transactions ── */}
            {data.cash_transactions.length > 0 && (
              <div className="rounded-2xl border border-slate-800/60 bg-[#0c1528]/80 p-6">
                <SectionHeader title="Últimas Movimentações" subtitle="10 transações mais recentes" />
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-800/80">
                        {["Data", "Fundo", "Tipo", "Valor", "Conta", "Obs"].map((h) => (
                          <th key={h} className="text-left py-2 px-3 text-slate-500 font-medium uppercase tracking-wider text-[10px]">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[...data.cash_transactions]
                        .sort((a, b) => b.date.localeCompare(a.date))
                        .slice(0, 10)
                        .map((tx, i) => {
                          const isPos = tx.amount >= 0;
                          return (
                            <tr key={i} className="border-b border-slate-800/40 hover:bg-slate-800/20 transition-colors">
                              <td className="py-2.5 px-3 text-slate-300 font-mono">{fmtDate(tx.date)}</td>
                              <td className="py-2.5 px-3 text-slate-400">{tx.fund || "—"}</td>
                              <td className="py-2.5 px-3">
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${isPos ? "bg-emerald-500/15 text-emerald-400" : "bg-rose-500/15 text-rose-400"}`}>
                                  {tx.type || "—"}
                                </span>
                              </td>
                              <td className={`py-2.5 px-3 font-semibold font-mono ${isPos ? "text-emerald-400" : "text-rose-400"}`}>
                                {isPos ? "+" : ""}R$ {fmtM(tx.amount)}
                              </td>
                              <td className="py-2.5 px-3 text-slate-500">{tx.cash_account || "—"}</td>
                              <td className="py-2.5 px-3 text-slate-500 max-w-[200px] truncate">{tx.obs || "—"}</td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

        {/* Empty state when no data at all */}
        {!loading && !error && data && !data.index_prices.length && !data.cash_transactions.length && !data.nav_history.length && (
          <div className="rounded-2xl border border-slate-700/40 bg-[#0c1528]/60 p-12 text-center">
            <ArrowUpDown className="w-10 h-10 text-slate-600 mx-auto mb-4" />
            <p className="text-slate-300 font-semibold text-base mb-1">Nenhum dado encontrado</p>
            <p className="text-slate-500 text-sm">
              Faça upload das tabelas históricas usando o macro Excel UploadTables para começar.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center h-40 rounded-xl border border-slate-800/40 bg-slate-800/10">
      <p className="text-xs text-slate-500 text-center max-w-xs">{message}</p>
    </div>
  );
}

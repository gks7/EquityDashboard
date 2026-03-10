"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  ResponsiveContainer, LineChart, Line, AreaChart, Area,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ReferenceLine,
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

const reindex = (
  series: { date: string; value: number }[]
): { date: string; value: number; indexed: number }[] => {
  if (!series.length) return [];
  const base = series[0].value;
  if (!base) return series.map((p) => ({ ...p, indexed: p.value }));
  return series.map((p) => ({ ...p, indexed: parseFloat(((p.value / base) * 100).toFixed(4)) }));
};

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

function StatCard({
  label, value, sub, icon: Icon, trend, color = "blue",
}: {
  label: string; value: string; sub?: string;
  icon: React.ElementType; trend?: "up" | "down" | "neutral"; color?: string;
}) {
  const border: Record<string, string> = {
    blue: "border-blue-500/20 from-blue-500/10 to-blue-600/5",
    emerald: "border-emerald-500/20 from-emerald-500/10 to-emerald-600/5",
    violet: "border-violet-500/20 from-violet-500/10 to-violet-600/5",
    amber: "border-amber-500/20 from-amber-500/10 to-amber-600/5",
    rose: "border-rose-500/20 from-rose-500/10 to-rose-600/5",
  };
  const ic: Record<string, string> = {
    blue: "text-blue-400", emerald: "text-emerald-400",
    violet: "text-violet-400", amber: "text-amber-400", rose: "text-rose-400",
  };
  return (
    <div className={`rounded-2xl border bg-gradient-to-br ${border[color]} p-5 flex flex-col gap-3`}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">{label}</span>
        <Icon className={`w-4 h-4 ${ic[color]}`} />
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

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-1">
      <h2 className="text-sm font-semibold text-white tracking-wide">{title}</h2>
      {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
    </div>
  );
}

function RangeBar({ value, onChange, color = "blue" }: { value: Range; onChange: (r: Range) => void; color?: string }) {
  const active: Record<string, string> = {
    blue: "bg-blue-600", emerald: "bg-emerald-600", violet: "bg-violet-600",
  };
  return (
    <div className="flex items-center gap-0.5 bg-slate-800/60 rounded-lg p-0.5 border border-slate-700/40">
      {RANGES.map((r) => (
        <button
          key={r}
          onClick={() => onChange(r)}
          className={`px-2.5 py-1 text-[10px] font-semibold rounded-md transition-all ${value === r ? `${active[color]} text-white shadow` : "text-slate-400 hover:text-slate-200"}`}
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

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center h-40 rounded-xl border border-slate-800/40 bg-slate-800/10">
      <p className="text-xs text-slate-500 text-center max-w-xs px-4">{message}</p>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function IgfTrPage() {
  const [data, setData] = useState<IgfData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedFund, setSelectedFund] = useState("");
  const [compareAsset, setCompareAsset] = useState("");
  const [compareInfo, setCompareInfo] = useState("");
  const [cotaRange, setCotaRange] = useState<Range>("Máx");
  const [navRange, setNavRange] = useState<Range>("Máx");
  const [flowsRange, setFlowsRange] = useState<Range>("Máx");
  const [cotaPage, setCotaPage] = useState(0);
  const [navPage, setNavPage] = useState(0);
  const COTA_PAGE_SIZE = 20;
  const NAV_PAGE_SIZE = 20;

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

  // ── Sorted NAV positions ────────────────────────────────────────────────────
  const navRows = useMemo(
    () => [...(data?.nav_positions ?? [])].sort((a, b) => a.date.localeCompare(b.date)),
    [data]
  );

  // ── Cota Histórica (NAV/Share) series ──────────────────────────────────────
  const cotaSeries = useMemo(
    () => navRows.filter((r) => r.nav_per_share != null).map((r) => ({ date: r.date, value: r.nav_per_share! })),
    [navRows]
  );

  // ── Compare series from HistIndexPrice ─────────────────────────────────────
  const compareSeries = useMemo(() => {
    if (!data || !compareAsset) return [];
    let rows = data.index_prices.filter((r) => r.asset === compareAsset);
    if (compareInfo) rows = rows.filter((r) => r.info === compareInfo);
    return rows
      .filter((r) => r.flt_value != null)
      .map((r) => ({ date: r.date, value: r.flt_value }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [data, compareAsset, compareInfo]);

  // ── Cota chart data (indexed to 100) ───────────────────────────────────────
  const cotaChartData = useMemo(() => {
    const ranged = filterByRange(cotaSeries, cotaRange);
    const indexed = reindex(ranged);
    if (!compareAsset || !compareSeries.length) {
      return indexed.map((p) => ({ date: fmtDate(p.date), rawDate: p.date, cota: p.indexed }));
    }
    const minDate = ranged.length ? ranged[0].date : "";
    const compFiltered = compareSeries.filter((p) => p.date >= minDate);
    const compIndexed = reindex(compFiltered);
    const compMap = new Map(compIndexed.map((p) => [p.date, p.indexed]));
    return indexed.map((p) => ({
      date: fmtDate(p.date), rawDate: p.date,
      cota: p.indexed,
      compare: compMap.get(p.date) ?? null,
    }));
  }, [cotaSeries, compareSeries, cotaRange, compareAsset]);

  // ── NAV chart data ─────────────────────────────────────────────────────────
  const navChartData = useMemo(() => {
    const series = navRows.filter((r) => r.nav != null).map((r) => ({ date: r.date, nav: r.nav! }));
    return filterByRange(series, navRange).map((p) => ({ date: fmtDate(p.date), nav: p.nav }));
  }, [navRows, navRange]);

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
        redemptions: -v.redemptions,
        net: v.subscriptions - v.redemptions,
      }));
    return filterByRange(sorted, flowsRange);
  }, [navRows, flowsRange]);

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
  const totalReds = useMemo(() => flowsChartData.reduce((s, r) => s + Math.abs(r.redemptions), 0), [flowsChartData]);

  const assetOptions = useMemo(() => (data?.available_assets ?? []).map((a) => ({ value: a, label: a })), [data]);
  const infoOptions = useMemo(() => (data?.available_infos ?? []).map((i) => ({ value: i, label: i })), [data]);
  const fundOptions = useMemo(() => (data?.available_funds ?? []).map((f) => ({ value: f, label: f })), [data]);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#060d1f] text-white">
      {/* Header */}
      <div className="border-b border-slate-800/60 bg-[#080f23]/80 backdrop-blur-sm px-8 py-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2.5 mb-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#10b981]" />
              <span className="text-[10px] font-semibold text-emerald-400 uppercase tracking-widest">Live</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white">IGF TR</h1>
            <p className="text-xs text-slate-500 mt-0.5">Fundo de Investimento — Histórico e Performance</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {fundOptions.length > 1 && (
              <Dropdown value={selectedFund} options={fundOptions} onChange={setSelectedFund} placeholder="Todos os fundos" />
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

            {/* Cota Histórica */}
            <div className="rounded-2xl border border-slate-800/60 bg-[#0c1528]/80 p-6">
              <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
                <SectionHeader
                  title="Cota Histórica"
                  subtitle="Valor da cota (NAV/Cota) indexado à base 100"
                />
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">Comparar:</span>
                    <Dropdown value={compareAsset} options={assetOptions} onChange={setCompareAsset} placeholder="Índice" />
                    {compareAsset && (
                      <Dropdown value={compareInfo} options={infoOptions} onChange={setCompareInfo} placeholder="Tipo" />
                    )}
                  </div>
                  <RangeBar value={cotaRange} onChange={setCotaRange} color="blue" />
                </div>
              </div>

              {cotaChartData.length === 0 ? (
                <EmptyState message="Nenhum dado de cota disponível. Faça upload da tabela RefTableAuxNAVPosition." />
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
                    <Tooltip content={<ChartTooltip formatter={(v: number) => v.toFixed(2)} />} />
                    <ReferenceLine y={100} stroke="#334155" strokeDasharray="4 4" />
                    <Line type="monotone" dataKey="cota" name="IGF TR" stroke="url(#cotaGrad)" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: "#3b82f6" }} />
                    {compareAsset && (
                      <Line type="monotone" dataKey="compare" name={compareAsset} stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="4 3" dot={false} activeDot={{ r: 3, fill: "#f59e0b" }} />
                    )}
                    {compareAsset && <Legend wrapperStyle={{ fontSize: 11, color: "#94a3b8" }} />}
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* ── Tabela de Cotas (NAV/Share) ─────────────────────────────────────── */}
            {navRows.length > 0 && (() => {
              const cotaRows = [...navRows].reverse();
              const cotaTotalPages = Math.ceil(cotaRows.length / COTA_PAGE_SIZE);
              const cotaSlice = cotaRows.slice(cotaPage * COTA_PAGE_SIZE, (cotaPage + 1) * COTA_PAGE_SIZE);
              return (
                <div className="rounded-2xl border border-slate-800/60 bg-[#0c1528]/80 p-6">
                  <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
                    <SectionHeader
                      title="Histórico de Cotas"
                      subtitle="Valor diário da cota (NAV por cota) — todos os registros"
                    />
                    <span className="text-[10px] text-slate-500 font-medium self-end">
                      {cotaRows.length} registros
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-slate-800/80">
                          {["Data", "Fundo", "Cota (NAV/Cota)", "Var. Dia", "Var. %"].map((h) => (
                            <th key={h} className="text-left py-2 px-3 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {cotaSlice.map((row, i) => {
                          const globalIdx = cotaRows.indexOf(row);
                          const prevRow = cotaRows[globalIdx + 1];
                          const varDia = row.nav_per_share != null && prevRow?.nav_per_share != null
                            ? row.nav_per_share - prevRow.nav_per_share : null;
                          const varPct = varDia != null && prevRow?.nav_per_share
                            ? (varDia / prevRow.nav_per_share) * 100 : null;
                          return (
                            <tr key={i} className="border-b border-slate-800/40 hover:bg-slate-800/20 transition-colors">
                              <td className="py-2.5 px-3 text-slate-300 font-mono">{fmtDate(row.date)}</td>
                              <td className="py-2.5 px-3 text-slate-400">{row.fund || "—"}</td>
                              <td className="py-2.5 px-3 text-blue-300 font-mono font-semibold">
                                {row.nav_per_share != null ? fmt(row.nav_per_share, 6) : "—"}
                              </td>
                              <td className={`py-2.5 px-3 font-mono ${varDia == null ? "text-slate-500" : varDia >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                {varDia != null ? `${varDia >= 0 ? "+" : ""}${fmt(varDia, 6)}` : "—"}
                              </td>
                              <td className={`py-2.5 px-3 font-mono ${varPct == null ? "text-slate-500" : varPct >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                {varPct != null ? `${varPct >= 0 ? "+" : ""}${varPct.toFixed(4)}%` : "—"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {cotaTotalPages > 1 && (
                    <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-800/60">
                      <span className="text-[10px] text-slate-500">
                        Página {cotaPage + 1} de {cotaTotalPages}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setCotaPage(0)}
                          disabled={cotaPage === 0}
                          className="px-2 py-1 text-[10px] font-medium rounded-md bg-slate-800/60 border border-slate-700/40 text-slate-400 hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        >«</button>
                        <button
                          onClick={() => setCotaPage((p) => Math.max(0, p - 1))}
                          disabled={cotaPage === 0}
                          className="px-2.5 py-1 text-[10px] font-medium rounded-md bg-slate-800/60 border border-slate-700/40 text-slate-400 hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        >‹</button>
                        <button
                          onClick={() => setCotaPage((p) => Math.min(cotaTotalPages - 1, p + 1))}
                          disabled={cotaPage === cotaTotalPages - 1}
                          className="px-2.5 py-1 text-[10px] font-medium rounded-md bg-slate-800/60 border border-slate-700/40 text-slate-400 hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        >›</button>
                        <button
                          onClick={() => setCotaPage(cotaTotalPages - 1)}
                          disabled={cotaPage === cotaTotalPages - 1}
                          className="px-2 py-1 text-[10px] font-medium rounded-md bg-slate-800/60 border border-slate-700/40 text-slate-400 hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        >»</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* ── NAV Table + Subscriptions Bar Chart ─────────────────────────────── */}
            <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">

              {/* NAV Table */}
              {navRows.length > 0 && (() => {
                const navTableRows = [...navRows].reverse();
                const navTotalPages = Math.ceil(navTableRows.length / NAV_PAGE_SIZE);
                const navSlice = navTableRows.slice(navPage * NAV_PAGE_SIZE, (navPage + 1) * NAV_PAGE_SIZE);
                return (
                  <div className="xl:col-span-3 rounded-2xl border border-slate-800/60 bg-[#0c1528]/80 p-6 flex flex-col">
                    <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
                      <SectionHeader
                        title="Patrimônio Líquido (NAV)"
                        subtitle="NAV total do fundo, cotas e fluxos diários"
                      />
                      <span className="text-[10px] text-slate-500 font-medium self-end">
                        {navTableRows.length} registros
                      </span>
                    </div>
                    <div className="overflow-x-auto flex-1">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-slate-800/80">
                            {["Data", "Fundo", "NAV", "Cotas", "Captação D0", "Resgate D0+D1"].map((h) => (
                              <th key={h} className="text-left py-2 px-3 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {navSlice.map((row, i) => {
                            const totalRed = (row.redemption_d0 ?? 0) + (row.redemption_d1 ?? 0);
                            return (
                              <tr key={i} className="border-b border-slate-800/40 hover:bg-slate-800/20 transition-colors">
                                <td className="py-2.5 px-3 text-slate-300 font-mono">{fmtDate(row.date)}</td>
                                <td className="py-2.5 px-3 text-slate-400">{row.fund || "—"}</td>
                                <td className="py-2.5 px-3 text-violet-300 font-mono font-semibold">
                                  {row.nav != null ? `R$ ${fmtM(row.nav)}` : "—"}
                                </td>
                                <td className="py-2.5 px-3 text-slate-200 font-mono">
                                  {row.shares != null ? fmtM(row.shares) : "—"}
                                </td>
                                <td className={`py-2.5 px-3 font-mono ${row.subscription_d0 && row.subscription_d0 > 0 ? "text-emerald-400" : "text-slate-500"}`}>
                                  {row.subscription_d0 != null && row.subscription_d0 !== 0 ? `R$ ${fmtM(row.subscription_d0)}` : "—"}
                                </td>
                                <td className={`py-2.5 px-3 font-mono ${totalRed !== 0 ? "text-rose-400" : "text-slate-500"}`}>
                                  {totalRed !== 0 ? `R$ ${fmtM(Math.abs(totalRed))}` : "—"}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    {navTotalPages > 1 && (
                      <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-800/60">
                        <span className="text-[10px] text-slate-500">
                          Página {navPage + 1} de {navTotalPages}
                        </span>
                        <div className="flex items-center gap-1">
                          <button onClick={() => setNavPage(0)} disabled={navPage === 0} className="px-2 py-1 text-[10px] font-medium rounded-md bg-slate-800/60 border border-slate-700/40 text-slate-400 hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">«</button>
                          <button onClick={() => setNavPage((p) => Math.max(0, p - 1))} disabled={navPage === 0} className="px-2.5 py-1 text-[10px] font-medium rounded-md bg-slate-800/60 border border-slate-700/40 text-slate-400 hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">‹</button>
                          <button onClick={() => setNavPage((p) => Math.min(navTotalPages - 1, p + 1))} disabled={navPage === navTotalPages - 1} className="px-2.5 py-1 text-[10px] font-medium rounded-md bg-slate-800/60 border border-slate-700/40 text-slate-400 hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">›</button>
                          <button onClick={() => setNavPage(navTotalPages - 1)} disabled={navPage === navTotalPages - 1} className="px-2 py-1 text-[10px] font-medium rounded-md bg-slate-800/60 border border-slate-700/40 text-slate-400 hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">»</button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Monthly Subscriptions Bar Chart */}
              <div className="xl:col-span-2 rounded-2xl border border-slate-800/60 bg-[#0c1528]/80 p-6 flex flex-col">
                <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
                  <div>
                    <SectionHeader
                      title="Captações por Mês"
                      subtitle="Subscription D0 — fluxo mensal de aplicações"
                    />
                    <div className="flex items-center gap-3 mt-2.5">
                      <span className="flex items-center gap-1.5 text-xs text-slate-400">
                        <span className="w-3 h-3 rounded-sm bg-emerald-500/80 inline-block" />
                        Total: <strong className="text-emerald-400 ml-1">R$ {fmtM(totalSubs)}</strong>
                      </span>
                    </div>
                  </div>
                  <RangeBar value={flowsRange} onChange={setFlowsRange} color="emerald" />
                </div>
                {flowsChartData.length === 0 ? (
                  <EmptyState message="Nenhum dado de captação disponível." />
                ) : (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={flowsChartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} barCategoryGap="30%">
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                      <XAxis dataKey="month" tick={{ fill: "#64748b", fontSize: 9 }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fill: "#64748b", fontSize: 9 }} tickLine={false} axisLine={false} tickFormatter={(v) => fmtM(v)} width={52} />
                      <Tooltip content={<ChartTooltip formatter={(v: number) => `R$ ${fmtM(v)}`} />} />
                      <Bar dataKey="subscriptions" name="Captações" fill="#10b981" fillOpacity={0.85} radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </>
        )}

        {!loading && !error && data && !data.nav_positions.length && (
          <div className="rounded-2xl border border-slate-700/40 bg-[#0c1528]/60 p-12 text-center">
            <ArrowUpDown className="w-10 h-10 text-slate-600 mx-auto mb-4" />
            <p className="text-slate-300 font-semibold text-base mb-1">Nenhum dado encontrado</p>
            <p className="text-slate-500 text-sm max-w-sm mx-auto">
              Faça upload da tabela <code className="text-blue-400">RefTableAuxNAVPosition</code> usando o macro Excel UploadTables para começar.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

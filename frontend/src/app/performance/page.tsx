"use client";

/**
 * IGF TR — Performance
 *
 * Cota da série líder (oficial do administrador em cada fim de mês, estimada entre fechamentos),
 * retorno e P&L de cada ativo, atribuição, captações e as verificações de conciliação.
 * Tudo vem de GET /api/igf-tr/performance/ (motor em backend/finance/perf/engine.py).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
} from "recharts";
import { RefreshCcw, Upload, Download, CheckCircle2, AlertTriangle, XCircle, Info, ChevronDown, Trash2, Plus, TrendingUp, TrendingDown } from "lucide-react";
import { authFetch } from "@/lib/authFetch";

const API = `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/igf-tr/performance`;

// ─── Types ───────────────────────────────────────────────────────────────────
interface Kpi { cota: number; date: string; mtd: number; ytd: number; m12: number | null; itd: number; ann: number | null; vol: number; maxdd: number; maxdd_date: string; nav: number; shares: number; hwm: number; inception: string; }
interface Asset {
  id: string; name: string; bucket: string; sector: string; status: string; first: string; last: string; units: number; price: number | null;
  mv: number; w: number; cost: number | null; gain: number | null; r_mtd: number | null; r_3m: number | null; r_ytd: number | null; r_itd: number | null;
  spx_ytd: number | null; spx_itd: number | null; pnl_mtd: number; pnl_ytd: number; pnl_itd: number; inc: number; c_ytd: number; c_itd: number; spark: number[];
}
interface Check { status: "ok" | "warn" | "error" | "info"; title: string; detail: string; rows: Record<string, unknown>[]; }
interface Payload {
  asof: string; official_last: string; official_cota: number; kpi: Kpi;
  fund: [string, number, number, number][];
  bench: Record<string, (number | null)[]>; sleeves: Record<string, number[]>;
  months: Record<string, number | string | null>[]; attrib: Record<string, number | string | null>[];
  assets: Asset[]; subs: { d: string; v: number }[]; subs_bank: { d: string; v: number; o: string }[];
  engine_check: { month_end: string; est: number; off: number; bps: number }[];
  checks: Check[]; hwm: number; method: { cutover: string; last_official_daily: string; admin_reports: string[] };
  run?: { created_at: string; duration_s: number };
}
interface ManualEntry { id: number; trade_date: string; type: string; asset_id: string; units: number; amount: number; note: string; }

// ─── Formatting ──────────────────────────────────────────────────────────────
const MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const pct = (v: number | null | undefined, d = 2) => v == null || isNaN(v) ? "–" : `${v > 0 ? "+" : ""}${(v * 100).toFixed(d).replace(".", ",")}%`;
const pp = (v: number | null | undefined, d = 2) => v == null || isNaN(v) ? "–" : `${v > 0 ? "+" : ""}${(v * 100).toFixed(d).replace(".", ",")}`;
const num = (v: number | null | undefined, d = 0) => v == null || isNaN(v) ? "–" : v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
const kmi = (v: number | null | undefined) => v == null ? "–" : Math.abs(v) >= 1e6 ? `${(v / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} mi` : `${(v / 1e3).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} mil`;
const dBR = (s?: string | null) => s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : "";
const tone = (v: number | null | undefined) => v == null ? "" : v > 0 ? "text-emerald-600 dark:text-emerald-400" : v < 0 ? "text-rose-600 dark:text-rose-400" : "";

const card = "rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] shadow-sm";
const POS = "#10b981", NEG = "#f43f5e", BLUE = "#3b82f6";
const btn = "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111827] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-50";
const seg = (on: boolean) => `px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${on ? "bg-white dark:bg-[#111827] text-slate-900 dark:text-white shadow-sm" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"}`;
const segWrap = "flex flex-wrap items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg";

const SERIES = [
  { key: "fund", label: "IGF TR (cota)", color: "#3b82f6" },
  { key: "S&P 500", label: "S&P 500", color: "#eb6834" },
  { key: "Nasdaq Composite", label: "Nasdaq Composite", color: "#1baf7a" },
  { key: "SOFR (caixa USD)", label: "SOFR (caixa USD)", color: "#7c6ce0" },
  { key: "Livro de ações", label: "Livro de ações", color: "#e87ba4" },
];
const BUCKETS = ["Renda variável", "Todas", "Ações individuais", "ETFs de ações", "ETFs de crédito", "Bonds (crédito)", "Treasuries"];
const BUCKET_SHORT: Record<string, string> = { "Ações individuais": "Ações", "ETFs de ações": "ETFs ações", "ETFs de crédito": "ETFs crédito", "Bonds (crédito)": "Bonds", "Treasuries": "Treasuries", "Renda variável": "Renda variável", "Todas": "Todas as classes" };

function Spark({ v }: { v: number[] }) {
  if (!v || v.length < 2) return null;
  const w = 88, h = 22, lo = Math.min(...v), hi = Math.max(...v);
  const x = (i: number) => 2 + (i * (w - 4)) / (v.length - 1), y = (z: number) => h - 3 - ((h - 6) * (z - lo)) / ((hi - lo) || 1);
  const d = v.map((z, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(z).toFixed(1)}`).join("");
  const c = v[v.length - 1] >= v[0] ? POS : NEG;
  return <svg width={w} height={h} aria-hidden="true"><path d={d} fill="none" stroke={c} strokeWidth={1.5} /><circle cx={x(v.length - 1)} cy={y(v[v.length - 1])} r={2.2} fill={c} /></svg>;
}

function CheckIcon({ s }: { s: Check["status"] }) {
  if (s === "ok") return <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />;
  if (s === "warn") return <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />;
  if (s === "error") return <XCircle className="w-4 h-4 text-rose-500 shrink-0" />;
  return <Info className="w-4 h-4 text-slate-400 shrink-0" />;
}

// ─── Page ────────────────────────────────────────────────────────────────────
export default function PerformancePage() {
  const [data, setData] = useState<Payload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [uploadMsg, setUploadMsg] = useState<{ file: string; ok: boolean; text: string }[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async (rebuild = false) => {
    setBusy(rebuild ? "Recalculando…" : "Carregando…"); setErr(null);
    try {
      const r = await authFetch(`${API}/${rebuild ? "?rebuild=1" : ""}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `Erro ${r.status}`);
      setData(j);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    setBusy(null);
  }, []);
  useEffect(() => { load(); }, [load]);

  const upload = async (files: FileList | null) => {
    if (!files || !files.length) return;
    const fd = new FormData(); Array.from(files).forEach(f => fd.append("files", f));
    setBusy("Importando e recalculando…"); setUploadMsg(null);
    try {
      const r = await authFetch(`${API}/upload/`, { method: "POST", body: fd });
      const j = await r.json();
      setUploadMsg((j.results || []).map((x: Record<string, unknown>) => ({
        file: String(x.file), ok: Boolean(x.ok),
        text: x.ok ? (x.kind === "Extrato bancário"
          ? `Extrato: ${x.rows} linhas (${x.created} novas). ${x.balance_diff === 0 ? "Saldo final confere." : x.balance_diff != null ? `Diferença de saldo ${x.balance_diff}.` : ""}${(x.unmapped as unknown[])?.length ? ` ${(x.unmapped as unknown[]).length} sem ativo cadastrado.` : ""}`
          : `Relatório do administrador de ${dBR(String(x.date))}: cota ${Number(x.lead_cota).toFixed(6)}.`) : String(x.error),
      })));
      if (!j.rebuild_ok) setErr(`Importado, mas o recálculo falhou: ${j.rebuild_error}`);
      await load();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); setBusy(null); }
    if (fileRef.current) fileRef.current.value = "";
  };

  const exportXlsx = async () => {
    setBusy("Gerando Excel…");
    try {
      const r = await authFetch(`${API}/export/`);
      if (!r.ok) throw new Error(`Erro ${r.status}`);
      const blob = await r.blob(); const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `IGF_TR_performance_${data?.asof || ""}.xlsx`; a.click(); URL.revokeObjectURL(url);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    setBusy(null);
  };

  return (
    <div className="w-full max-w-6xl mx-auto space-y-5 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Performance</h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-0.5">IGF WM Total Return · cota, retorno e ativos</p>
        </div>
        <div className="flex flex-col sm:items-end gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <input ref={fileRef} type="file" accept=".xlsx" multiple className="hidden" id="perf-upload" onChange={e => upload(e.target.files)} />
            <button className={btn} onClick={() => fileRef.current?.click()} disabled={!!busy}><Upload className="w-3.5 h-3.5" />Enviar relatório adm / extrato</button>
            <button className={btn} onClick={() => load(true)} disabled={!!busy}><RefreshCcw className={`w-3.5 h-3.5 ${busy ? "animate-spin" : ""}`} />Recalcular</button>
            <button className={btn} onClick={exportXlsx} disabled={!!busy || !data}><Download className="w-3.5 h-3.5" />Excel</button>
          </div>
          {data?.run && <p className="text-[11px] sm:text-xs text-slate-400 font-medium tabular-nums">Atualizado: {new Date(data.run.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</p>}
        </div>
      </div>
      {(busy || err || uploadMsg) && (
        <div className={`${card} p-4 space-y-1`}>
          {busy && <p className="text-xs text-slate-500">{busy}</p>}
          {err && <p className="text-xs text-rose-600">{err}</p>}
          {uploadMsg && uploadMsg.map((m, i) => <p key={i} className={`text-xs ${m.ok ? "text-emerald-700 dark:text-emerald-400" : "text-rose-600"}`}><b>{m.file}</b>: {m.text}</p>)}
        </div>
      )}
      {data && <Body data={data} reload={() => load()} />}
    </div>
  );
}

function ReturnBadge({ label: l, value }: { label: string; value: number | null }) {
  if (value == null) return <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-1 text-xs font-semibold text-slate-400 tabular-nums">{l} —</span>;
  const up = value >= 0; const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums ${up ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400" : "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400"}`}>
      <Icon className="w-3.5 h-3.5" /><span className="text-[10px] font-bold uppercase tracking-wider opacity-70">{l}</span>{pct(value)}
    </span>
  );
}

function HeroMetric({ label: l, children, sub }: { label: string; children: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 whitespace-nowrap mb-1.5">{l}</p>
      <p className="text-2xl sm:text-3xl font-bold tracking-tight tabular-nums leading-none text-slate-900 dark:text-white">{children}</p>
      {sub && <p className="text-[11px] text-slate-400 mt-1.5 tabular-nums">{sub}</p>}
    </div>
  );
}

const HeroDivider = () => <div className="hidden lg:block self-stretch w-px bg-slate-200 dark:bg-slate-700" />;

function Body({ data, reload }: { data: Payload; reload: () => void }) {
  const K = data.kpi;
  const nWarn = data.checks.filter(c => c.status === "warn" || c.status === "error").length;
  const [tab, setTab] = useState<"ativos" | "atribuicao" | "pl" | "conciliacao">("ativos");
  const eq = data.assets.filter(a => a.status === "Em carteira" && (a.bucket === "Ações individuais" || a.bucket === "ETFs de ações")).reduce((t, a) => t + a.w, 0);
  const fi = data.assets.filter(a => a.status === "Em carteira").reduce((t, a) => t + a.w, 0) - eq;
  const tabs: [typeof tab, string][] = [["ativos", "Ativos"], ["atribuicao", "Atribuição"], ["pl", "PL e captações"], ["conciliacao", nWarn ? `Conciliação (${nWarn})` : "Conciliação"]];
  return (
    <>
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] shadow-sm p-4 sm:p-6">
        <div className="flex flex-wrap items-start gap-x-7 sm:gap-x-9 gap-y-5">
          <HeroMetric label="Cota" sub={data.asof > data.official_last ? `estimada · oficial ${dBR(data.official_last)}: ${data.official_cota.toFixed(4).replace(".", ",")}` : `oficial ${dBR(data.official_last)}`}>
            {K.cota.toLocaleString("pt-BR", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}
          </HeroMetric>
          <HeroMetric label="Patrimônio" sub={`${(K.shares / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi de cotas`}>${(K.nav / 1e6).toFixed(2)}M</HeroMetric>
          <HeroDivider />
          <div className="flex flex-col gap-2.5">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 whitespace-nowrap mb-1.5">Rentabilidade no ano</p>
              <p className="text-2xl sm:text-3xl font-bold tracking-tight tabular-nums leading-none"><span className={tone(K.ytd)}>{pct(K.ytd)}</span></p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <ReturnBadge label="Mês" value={K.mtd} />
              <ReturnBadge label="12M" value={K.m12} />
              <ReturnBadge label="Início" value={K.itd} />
            </div>
          </div>
          <HeroDivider />
          <div className="flex flex-col gap-2 min-w-[210px] flex-1">
            <div className="flex items-center justify-between gap-4">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Risco</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">vol. <span className="text-slate-900 dark:text-white font-semibold">{pct(K.vol, 1).replace("+", "")}</span> · máx. queda <span className="text-rose-600 dark:text-rose-400 font-semibold">{pct(K.maxdd, 1)}</span></p>
            </div>
            <div className="flex h-2 rounded-full overflow-hidden bg-slate-100 dark:bg-slate-800">
              <div className="bg-blue-500" style={{ width: `${eq * 100}%` }} />
              <div className="bg-teal-500" style={{ width: `${fi * 100}%` }} />
            </div>
            <div className="flex items-center justify-between gap-4 text-xs">
              <span className="inline-flex items-center gap-1.5 text-slate-500 dark:text-slate-400"><span className="w-2 h-2 rounded-full bg-blue-500" />Renda variável<span className="text-slate-900 dark:text-white font-semibold tabular-nums">{(eq * 100).toFixed(1)}%</span></span>
              <span className="inline-flex items-center gap-1.5 text-slate-500 dark:text-slate-400"><span className="w-2 h-2 rounded-full bg-teal-500" />Renda fixa<span className="text-slate-900 dark:text-white font-semibold tabular-nums">{(fi * 100).toFixed(1)}%</span></span>
            </div>
          </div>
        </div>
      </div>

      <CotaChart data={data} />
      <MonthlyHeat data={data} />

      <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl w-full sm:w-fit overflow-x-auto">
        {tabs.map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`flex-1 sm:flex-none whitespace-nowrap px-5 py-2 text-sm font-semibold rounded-lg transition-all ${tab === k ? "bg-white dark:bg-[#111827] text-slate-900 dark:text-white shadow-sm" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"}`}>{l}</button>
        ))}
      </div>

      {tab === "ativos" && <AssetsTable data={data} />}
      {tab === "atribuicao" && <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 sm:gap-6"><ContribChart data={data} /><AttribTable data={data} /></div>}
      {tab === "pl" && <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 sm:gap-6"><NavChart data={data} /><SubsChart data={data} /></div>}
      {tab === "conciliacao" && <div className="space-y-5 sm:space-y-6"><Checks data={data} /><ManualEntries onChange={reload} /><HowTo data={data} /></div>}
    </>
  );
}

// ─── Cota chart ──────────────────────────────────────────────────────────────
function CotaChart({ data }: { data: Payload }) {
  const [range, setRange] = useState("Início");
  const [on, setOn] = useState<Record<string, boolean>>({ fund: true, "S&P 500": true, "SOFR (caixa USD)": true });
  const rows = useMemo(() => {
    const dates = data.fund.map(r => r[0]);
    const last = new Date(dates[dates.length - 1]);
    const back = (m: number) => { const d = new Date(last); d.setMonth(d.getMonth() - m); return d.toISOString().slice(0, 10); };
    const start = range === "Início" ? dates[0] : range === "Ano" ? `${last.getFullYear() - 1}-12-31` : range === "12m" ? back(12) : range === "6m" ? back(6) : back(3);
    let i0 = dates.findIndex(d => d >= start); if (range !== "Início") i0 = Math.max(0, i0 - 1);
    const src: Record<string, (number | null)[]> = { fund: data.fund.map(r => r[1]), ...data.bench, "Livro de ações": data.sleeves["Livro de ações"] || [] };
    const base: Record<string, number | null> = {};
    Object.keys(src).forEach(k => { base[k] = src[k].slice(i0).find(v => v != null) ?? null; });
    const estFrom = dates.findIndex(d => d > data.official_last);
    return dates.slice(i0).map((d, j) => {
      const i = i0 + j; const o: Record<string, number | string | null> = { d };
      Object.keys(src).forEach(k => { const v = src[k][i]; o[k] = v == null || !base[k] ? null : (100 * v) / (base[k] as number); });
      o.fundEst = estFrom >= 0 && i >= estFrom - 1 ? o.fund : null;
      if (estFrom >= 0 && i >= estFrom) o.fund = null;
      o.cota = data.fund[i][1];
      return o;
    });
  }, [data, range]);
  return (
    <div className={`${card} p-4 sm:p-5`}>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">Cota vs referências <span className="font-normal text-slate-500">(base 100)</span></h2>
        <div className={segWrap}>{["Início", "Ano", "12m", "6m", "3m"].map(r => <button key={r} className={seg(range === r)} onClick={() => setRange(r)}>{r}</button>)}</div>
      </div>
      <div className="flex flex-wrap gap-2 mb-3">
        {SERIES.map(s => (
          <button key={s.key} onClick={() => setOn(o => ({ ...o, [s.key]: !o[s.key] }))}
            className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border border-slate-200 dark:border-slate-700 ${on[s.key] ? "text-slate-700 dark:text-slate-200" : "opacity-40"}`}>
            <span className="w-3 h-[3px] rounded" style={{ background: s.color }} />{s.label}
          </button>
        ))}
      </div>
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 5, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#94a3b833" vertical={false} />
            <XAxis dataKey="d" tickFormatter={(d: string) => `${MES[+d.slice(5, 7) - 1]}/${d.slice(2, 4)}`} minTickGap={40} tick={{ fontSize: 11, fill: "#94a3b8" }} />
            <YAxis domain={["auto", "auto"]} tick={{ fontSize: 11, fill: "#94a3b8" }} width={40} />
            <Tooltip formatter={(v, n) => [v == null ? "–" : pct(Number(v) / 100 - 1), n === "fund" || n === "fundEst" ? "IGF TR" : String(n)]}
              labelFormatter={(d) => dBR(String(d))} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
            <ReferenceLine y={100} stroke="#94a3b8" strokeDasharray="2 4" />
            {on["fund"] && <Line dataKey="fund" stroke={BLUE} strokeWidth={2.2} dot={false} isAnimationActive={false} />}
            {on["fund"] && <Line dataKey="fundEst" stroke={BLUE} strokeWidth={2.2} strokeDasharray="5 4" dot={false} isAnimationActive={false} />}
            {SERIES.filter(s => s.key !== "fund" && on[s.key]).map(s => <Line key={s.key} dataKey={s.key} stroke={s.color} strokeWidth={1.5} dot={false} isAnimationActive={false} />)}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="text-[11px] text-slate-500 mt-2">Linha tracejada = estimativa após o último relatório do administrador. S&amp;P 500 e Nasdaq sem dividendos (índice Bloomberg até jun/26, depois variação de SPY/QQQ).</p>
    </div>
  );
}

// ─── Monthly heat ────────────────────────────────────────────────────────────
function MonthlyHeat({ data }: { data: Payload }) {
  const keys = ["Fundo", "Fundo − S&P 500", "S&P 500", "Nasdaq Composite", "SOFR (caixa USD)", "Livro de ações", "Ações individuais", "Crédito"];
  const [k, setK] = useState("Fundo");
  const byYear = useMemo(() => {
    const out: Record<string, Record<number, number | null>> = {};
    data.months.forEach(r => {
      const m = String(r.m); const y = m.slice(0, 4), mm = +m.slice(5, 7);
      const v = k === "Fundo − S&P 500" ? (r["Fundo"] != null && r["S&P 500"] != null ? (r["Fundo"] as number) - (r["S&P 500"] as number) : null) : (r[k] as number | null);
      (out[y] = out[y] || {})[mm] = v;
    });
    return out;
  }, [data, k]);
  const scale = k.startsWith("SOFR") ? 0.006 : 0.05;
  const bg = (v: number | null | undefined) => {
    if (v == null) return undefined;
    const t = Math.max(-1, Math.min(1, v / scale)); const a = Math.abs(t) * 0.45;
    return t >= 0 ? `rgba(16,185,129,${a})` : `rgba(244,63,94,${a})`;
  };
  const isDiff = k === "Fundo − S&P 500";
  const tableRows = useMemo(() => {
    const out: { y: string; cells: (number | null)[]; yv: number; acc: number }[] = [];
    let acc = 1;
    for (const y of Object.keys(byYear).sort()) {
      let yr = 1, sum = 0;
      const cells: (number | null)[] = [];
      for (let i = 1; i <= 12; i++) { const v = byYear[y][i]; cells.push(v ?? null); if (v != null) { yr *= 1 + v; sum += v; } }
      acc *= yr;
      out.push({ y, cells, yv: isDiff ? sum : yr - 1, acc: acc - 1 });
    }
    return out;
  }, [byYear, isDiff]);
  return (
    <div className={`${card} p-4 sm:p-5`}>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">Rentabilidade mensal</h2>
        <select value={k} onChange={e => setK(e.target.value)} className="text-xs px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">{keys.map(x => <option key={x}>{x}</option>)}</select>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs tabular-nums">
          <thead><tr className="text-slate-500">{["Ano", ...MES, "Ano", "Acum."].map((h, i) => <th key={i} className="px-1.5 py-1.5 text-right first:text-left font-medium">{h}</th>)}</tr></thead>
          <tbody>
            {tableRows.map(({ y, cells, yv, acc }) => (
                <tr key={y}>
                  <td className="px-1.5 py-1 font-semibold font-sans">{y}</td>
                  {cells.map((v, i) => <td key={i} className="px-1.5 py-1 text-right rounded" style={{ background: bg(v) }}>{v == null ? "" : isDiff ? pp(v) : pct(v)}</td>)}
                  <td className="px-1.5 py-1 text-right font-semibold bg-slate-50 dark:bg-slate-800/50">{isDiff ? pp(yv) : pct(yv)}</td>
                  <td className="px-1.5 py-1 text-right bg-slate-50 dark:bg-slate-800/50">{isDiff ? "" : pct(acc)}</td>
                </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Assets ──────────────────────────────────────────────────────────────────
type SortKey = keyof Asset | "vs";
function AssetsTable({ data }: { data: Payload }) {
  const [st, setSt] = useState("Em carteira");
  const [cl, setCl] = useState("Renda variável");
  const [sort, setSort] = useState<{ k: SortKey; dir: number }>({ k: "mv", dir: -1 });
  const rows = useMemo(() => {
    const isEq = (b: string) => b === "Ações individuais" || b === "ETFs de ações";
    const r = data.assets
      .filter(a => (st === "Todas" || a.status === st) && (cl === "Todas" || a.bucket === cl || (cl === "Renda variável" && isEq(a.bucket))))
      .map(a => ({ ...a, vs: a.r_ytd != null && a.spx_ytd != null && isEq(a.bucket) ? a.r_ytd - a.spx_ytd : null }));
    return r.sort((a, b) => {
      const x = a[sort.k as keyof typeof a] as number | string | null, y = b[sort.k as keyof typeof b] as number | string | null;
      if (x == null) return 1; if (y == null) return -1; return (x > y ? 1 : x < y ? -1 : 0) * sort.dir;
    });
  }, [data, st, cl, sort]);
  const tot = rows.reduce((t, a) => ({ mv: t.mv + a.mv, w: t.w + a.w, pnl_ytd: t.pnl_ytd + a.pnl_ytd, pnl_itd: t.pnl_itd + a.pnl_itd, c_ytd: t.c_ytd + a.c_ytd }), { mv: 0, w: 0, pnl_ytd: 0, pnl_itd: 0, c_ytd: 0 });
  const cols: [SortKey, string][] = [["id", "Ativo"], ["bucket", "Classe"], ["w", "% PL"], ["mv", "Valor"], ["gain", "s/ custo"], ["r_mtd", "Mês"], ["r_3m", "3m"], ["r_ytd", "Ano"], ["vs", "vs S&P (ano)"], ["r_itd", "Desde entrada"], ["first", "Entrada"], ["pnl_ytd", "P&L ano"], ["pnl_itd", "P&L total"], ["c_ytd", "Contrib. ano"]];
  const th = (k: SortKey, l: string) => (
    <th key={k} className="px-2 py-2 text-right first:text-left font-medium whitespace-nowrap">
      <button onClick={() => setSort(s => ({ k, dir: s.k === k ? -s.dir : (k === "id" || k === "bucket" ? 1 : -1) }))} className="hover:text-slate-900 dark:hover:text-white">
        {l}{sort.k === k ? (sort.dir > 0 ? " ▲" : " ▼") : ""}
      </button>
    </th>
  );
  return (
    <div className={`${card} p-4 sm:p-5`}>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">Quanto cada ativo rende</h2>
        <div className="flex flex-wrap gap-3">
          <div className={segWrap}>{["Em carteira", "Encerrada", "Todas"].map(x => <button key={x} className={seg(st === x)} onClick={() => setSt(x)}>{x === "Encerrada" ? "Encerradas" : x}</button>)}</div>
          <div className={segWrap}>{BUCKETS.map(x => <button key={x} className={seg(cl === x)} onClick={() => setCl(x)}>{BUCKET_SHORT[x]}</button>)}</div>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs whitespace-nowrap">
          <thead className="text-slate-500 border-b border-slate-200 dark:border-slate-800"><tr>{cols.map(([k, l]) => th(k, l))}<th className="px-2 py-2 text-right font-medium">Trajetória</th></tr></thead>
          <tbody className="tabular-nums">
            {rows.map(a => (
              <tr key={a.id} className="border-b border-slate-100 dark:border-slate-800/60 hover:bg-slate-50 dark:hover:bg-slate-800/40">
                <td className="px-2 py-1.5 font-sans"><div className="font-semibold text-slate-900 dark:text-white">{a.id}</div><div className="text-[11px] text-slate-500 max-w-[220px] truncate">{a.name !== a.id ? a.name : ""}{a.status === "Encerrada" ? ` encerrada ${dBR(a.last)}` : ""}</div></td>
                <td className="px-2 py-1.5 text-right font-sans"><span className="text-[11px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">{BUCKET_SHORT[a.bucket] || a.bucket}</span></td>
                <td className="px-2 py-1.5 text-right">{a.w ? pct(a.w, 1).replace("+", "") : "–"}</td>
                <td className="px-2 py-1.5 text-right">{kmi(a.mv)}</td>
                <td className={`px-2 py-1.5 text-right ${tone(a.gain)}`}>{pct(a.gain, 1)}</td>
                <td className={`px-2 py-1.5 text-right ${tone(a.r_mtd)}`}>{pct(a.r_mtd, 1)}</td>
                <td className={`px-2 py-1.5 text-right ${tone(a.r_3m)}`}>{pct(a.r_3m, 1)}</td>
                <td className={`px-2 py-1.5 text-right ${tone(a.r_ytd)}`}>{pct(a.r_ytd, 1)}</td>
                <td className={`px-2 py-1.5 text-right ${tone(a.vs)}`}>{pp(a.vs)}</td>
                <td className={`px-2 py-1.5 text-right ${tone(a.r_itd)}`}>{pct(a.r_itd, 1)}</td>
                <td className="px-2 py-1.5 text-right">{dBR(a.first)}</td>
                <td className={`px-2 py-1.5 text-right ${tone(a.pnl_ytd)}`}>{kmi(a.pnl_ytd)}</td>
                <td className={`px-2 py-1.5 text-right ${tone(a.pnl_itd)}`}>{kmi(a.pnl_itd)}</td>
                <td className={`px-2 py-1.5 text-right ${tone(a.c_ytd)}`}>{pp(a.c_ytd)}</td>
                <td className="px-2 py-1.5 text-right"><Spark v={a.spark} /></td>
              </tr>
            ))}
            <tr className="bg-slate-50 dark:bg-slate-800/50 font-semibold">
              <td className="px-2 py-1.5 font-sans">Total filtrado</td><td /><td className="px-2 py-1.5 text-right">{pct(tot.w, 1).replace("+", "")}</td><td className="px-2 py-1.5 text-right">{kmi(tot.mv)}</td>
              <td colSpan={7} /><td className={`px-2 py-1.5 text-right ${tone(tot.pnl_ytd)}`}>{kmi(tot.pnl_ytd)}</td><td className={`px-2 py-1.5 text-right ${tone(tot.pnl_itd)}`}>{kmi(tot.pnl_itd)}</td><td className={`px-2 py-1.5 text-right ${tone(tot.c_ytd)}`}>{pp(tot.c_ytd)}</td><td />
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-slate-500 mt-2">Retornos TWR (sem efeito de compras e vendas no meio do período). &quot;vs S&amp;P&quot; = retorno no ano menos o S&amp;P 500 na mesma janela. Custo = custo médio do administrador. Contribuição em pontos percentuais da cota.</p>
    </div>
  );
}

// ─── Contribution & attribution ──────────────────────────────────────────────
function ContribChart({ data }: { data: Payload }) {
  const rows = useMemo(() => {
    const r = data.assets.filter(a => Math.abs(a.c_ytd) > 0.00005).sort((a, b) => b.c_ytd - a.c_ytd);
    const top = r.slice(0, 8), bot = r.slice(-6).filter(x => !top.includes(x));
    return [...top, ...bot].map(a => ({ id: a.id.length > 18 ? a.id.slice(0, 17) + "…" : a.id, v: a.c_ytd * 100, pnl: a.pnl_ytd }));
  }, [data]);
  return (
    <div className={`${card} p-4 sm:p-5`}>
      <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white mb-3">Quem mais contribuiu no ano <span className="font-normal text-slate-500">(p.p. da cota)</span></h2>
      <div style={{ height: rows.length * 24 + 30 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 40, left: 10, bottom: 0 }}>
            <XAxis type="number" tick={{ fontSize: 11, fill: "#94a3b8" }} tickFormatter={(v: number) => v.toFixed(1).replace(".", ",")} />
            <YAxis type="category" dataKey="id" width={130} tick={{ fontSize: 11, fill: "#94a3b8" }} />
            <Tooltip formatter={(v, _n, p) => [`${pp(Number(v) / 100)} p.p. · P&L US$ ${num((p as { payload?: { pnl?: number } })?.payload?.pnl)}`, "Contribuição"]} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
            <ReferenceLine x={0} stroke="#94a3b8" />
            <Bar dataKey="v" radius={3} isAnimationActive={false}>{rows.map((r, i) => <Cell key={i} fill={r.v >= 0 ? POS : NEG} />)}</Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function AttribTable({ data }: { data: Payload }) {
  const year = data.asof.slice(0, 4);
  const rows = data.attrib.filter(r => String(r.m).startsWith(year));
  const keys = ["Ações individuais", "ETFs de ações", "ETFs de crédito", "Bonds (crédito)", "Treasuries", "Taxas, caixa e outros", "Cota"];
  const sum: Record<string, number> = {};
  return (
    <div className={`${card} p-4 sm:p-5`}>
      <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white mb-3">Atribuição por classe, {year} <span className="font-normal text-slate-500">(p.p. da cota)</span></h2>
      <div className="overflow-x-auto">
        <table className="w-full text-xs tabular-nums">
          <thead className="text-slate-500"><tr><th className="px-1.5 py-1.5 text-left font-medium">Mês</th>{keys.map(k => <th key={k} className="px-1.5 py-1.5 text-right font-medium font-sans">{k.replace("ETFs de crédito", "ETFs créd.").replace("Bonds (crédito)", "Bonds").replace("Taxas, caixa e outros", "Taxas/outros").replace("Ações individuais", "Ações").replace("ETFs de ações", "ETFs ações")}</th>)}</tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={String(r.m)} className="border-b border-slate-100 dark:border-slate-800/60">
                <td className="px-1.5 py-1 font-sans">{MES[+String(r.m).slice(5, 7) - 1]}</td>
                {keys.map(k => { const v = (r[k] as number) ?? 0; sum[k] = (sum[k] || 0) + v; return <td key={k} className={`px-1.5 py-1 text-right ${tone(v)} ${k === "Cota" ? "font-semibold" : ""}`}>{pp(v)}</td>; })}
              </tr>
            ))}
            <tr className="bg-slate-50 dark:bg-slate-800/50 font-semibold"><td className="px-1.5 py-1 font-sans">Soma</td>{keys.map(k => <td key={k} className={`px-1.5 py-1 text-right ${tone(sum[k])}`}>{pp(sum[k])}</td>)}</tr>
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-slate-500 mt-2">&quot;Taxas/outros&quot; = cota menos a soma das classes: taxa de administração, performance, despesas e caixa. Soma simples dos meses.</p>
    </div>
  );
}

// ─── NAV & subscriptions ─────────────────────────────────────────────────────
function NavChart({ data }: { data: Payload }) {
  const rows = useMemo(() => data.fund.map(r => ({ d: r[0], v: r[3] / 1e6 })), [data]);
  return (
    <div className={`${card} p-4 sm:p-5`}>
      <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white mb-3">Patrimônio líquido <span className="font-normal text-slate-500">(US$ mi)</span></h2>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 5, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#94a3b833" vertical={false} />
            <XAxis dataKey="d" tickFormatter={(d: string) => `${MES[+d.slice(5, 7) - 1]}/${d.slice(2, 4)}`} minTickGap={40} tick={{ fontSize: 11, fill: "#94a3b8" }} />
            <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} width={36} />
            <Tooltip formatter={(v) => [`US$ ${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} mi`, "PL"]} labelFormatter={(d) => dBR(String(d))} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
            <Line dataKey="v" stroke={BLUE} strokeWidth={2} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function SubsChart({ data }: { data: Payload }) {
  const rows = useMemo(() => {
    const by: Record<string, number> = {};
    data.subs.slice(1).forEach(s => { const k = s.d.slice(0, 7); by[k] = (by[k] || 0) + s.v; });
    const out: { m: string; v: number }[] = [];
    const start = new Date(data.kpi.inception); start.setMonth(start.getMonth() + 1); start.setDate(15);
    for (let d = start; d <= new Date(data.asof); d.setMonth(d.getMonth() + 1)) { const k = d.toISOString().slice(0, 7); out.push({ m: k, v: (by[k] || 0) / 1e6 }); }
    return out;
  }, [data]);
  return (
    <div className={`${card} p-4 sm:p-5`}>
      <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white mb-3">Captações por cotização <span className="font-normal text-slate-500">(US$ mi, exclui o aporte inicial)</span></h2>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#94a3b833" vertical={false} />
            <XAxis dataKey="m" tickFormatter={(m: string) => `${MES[+m.slice(5, 7) - 1]}/${m.slice(2, 4)}`} minTickGap={24} tick={{ fontSize: 11, fill: "#94a3b8" }} />
            <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} width={30} />
            <Tooltip formatter={(v) => [`US$ ${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} mi`, "Aplicações"]} labelFormatter={(m) => `${MES[+String(m).slice(5, 7) - 1]}/${String(m).slice(0, 4)}`} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
            <Bar dataKey="v" fill={BLUE} radius={[3, 3, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── Checks, manual entries, how-to ──────────────────────────────────────────
function Checks({ data }: { data: Payload }) {
  const [open, setOpen] = useState<number | null>(null);
  const order = { error: 0, warn: 1, info: 2, ok: 3 } as const;
  const list = [...data.checks].sort((a, b) => order[a.status] - order[b.status]);
  return (
    <div id="checks" className={`${card} p-4 sm:p-5`}>
      <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white mb-3">Conciliação e verificações</h2>
      <ul className="divide-y divide-slate-100 dark:divide-slate-800">
        {list.map((c, i) => (
          <li key={i} className="py-2">
            <button className="w-full flex items-start gap-2 text-left" onClick={() => setOpen(open === i ? null : i)} disabled={!c.rows.length}>
              <CheckIcon s={c.status} />
              <span className="flex-1 min-w-0"><span className="text-xs font-medium text-slate-800 dark:text-slate-200">{c.title}</span><span className="block text-[11px] text-slate-500">{c.detail}</span></span>
              {c.rows.length > 0 && <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${open === i ? "rotate-180" : ""}`} />}
            </button>
            {open === i && <pre className="mt-2 ml-6 text-[11px] bg-slate-50 dark:bg-slate-800/60 rounded p-2 overflow-x-auto">{c.rows.map(r => JSON.stringify(r)).join("\n")}</pre>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ManualEntries({ onChange }: { onChange: () => void }) {
  const [rows, setRows] = useState<ManualEntry[]>([]);
  const [form, setForm] = useState({ trade_date: "", type: "SELL", asset_id: "", units: "", amount: "", note: "" });
  const [msg, setMsg] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const fetchRows = useCallback(async () => setTick(t => t + 1), []);
  useEffect(() => {
    let alive = true;
    authFetch(`${API}/manual/`).then(r => (r.ok ? r.json() : [])).then((j: ManualEntry[]) => { if (alive) setRows(j); }).catch(() => {});
    return () => { alive = false; };
  }, [tick]);
  const add = async () => {
    setMsg(null);
    const r = await authFetch(`${API}/manual/`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    if (!r.ok) { const j = await r.json(); setMsg(j.error || "Erro"); return; }
    setForm({ trade_date: "", type: "SELL", asset_id: "", units: "", amount: "", note: "" }); await fetchRows(); onChange();
  };
  const del = async (id: number) => { await authFetch(`${API}/manual/?id=${id}`, { method: "DELETE" }); await fetchRows(); onChange(); };
  const inp = "px-2 py-1.5 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 min-w-0";
  return (
    <div className={`${card} p-4 sm:p-5`}>
      <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">Ajustes manuais</h2>
      <p className="text-[11px] text-slate-500 mb-3">Operações fora do extrato enviado (subconta CAD, conta CSWML, correções). Valor em US$: + recebido, − pago. Quantidade: + compra, − venda. Depois de salvar, clique em Recalcular.</p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs mb-3">
          <thead className="text-slate-500"><tr>{["Data", "Tipo", "Ativo", "Quantidade", "Valor (US$)", "Nota", ""].map(h => <th key={h} className="px-2 py-1 text-left font-medium">{h}</th>)}</tr></thead>
          <tbody>
            {rows.map(r => <tr key={r.id} className="border-t border-slate-100 dark:border-slate-800"><td className="px-2 py-1">{dBR(r.trade_date)}</td><td className="px-2 py-1">{r.type}</td><td className="px-2 py-1 tabular-nums">{r.asset_id}</td><td className="px-2 py-1 tabular-nums">{num(r.units, 2)}</td><td className="px-2 py-1 tabular-nums">{num(r.amount, 2)}</td><td className="px-2 py-1">{r.note}</td><td className="px-2 py-1"><button onClick={() => del(r.id)} aria-label="Excluir ajuste"><Trash2 className="w-3.5 h-3.5 text-slate-400 hover:text-rose-500" /></button></td></tr>)}
            {!rows.length && <tr><td colSpan={7} className="px-2 py-2 text-slate-400">Nenhum ajuste.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-7 gap-2">
        <input id="me-date" type="date" className={inp} value={form.trade_date} onChange={e => setForm({ ...form, trade_date: e.target.value })} />
        <select id="me-type" className={inp} value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>{["BUY", "SELL", "DIVIDEND", "COUPON", "REDEMPTION", "EXPENSE", "OTHER_INCOME"].map(t => <option key={t}>{t}</option>)}</select>
        <input id="me-asset" placeholder="Ativo (ex.: CSU)" className={inp} value={form.asset_id} onChange={e => setForm({ ...form, asset_id: e.target.value })} />
        <input id="me-units" placeholder="Quantidade" className={inp} value={form.units} onChange={e => setForm({ ...form, units: e.target.value })} />
        <input id="me-amount" placeholder="Valor US$" className={inp} value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} />
        <input id="me-note" placeholder="Nota" className={inp} value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} />
        <button onClick={add} className={btn}><Plus className="w-3.5 h-3.5" />Adicionar</button>
      </div>
      {msg && <p className="text-xs text-rose-600 mt-2">{msg}</p>}
    </div>
  );
}

function HowTo({ data }: { data: Payload }) {
  return (
    <details className={`${card} p-4 sm:p-5`}>
      <summary className="text-sm sm:text-base font-bold text-slate-900 dark:text-white cursor-pointer">Como manter batendo</summary>
      <ol className="list-decimal pl-5 mt-3 space-y-1.5 text-xs text-slate-600 dark:text-slate-300 max-w-3xl">
        <li><b>Todo dia</b> (automático): cada upload do Portfolio (macro Bloomberg) atualiza esta base na hora. O preço do dia é o do snapshot depois do fechamento americano; antes do fechamento, a cota de hoje usa o último upload intraday.</li>
        <li><b>Quantidades</b>: compras e vendas são lidas pela mudança de quantidade no Portfolio, ao preço de fechamento do dia. Atualize a quantidade na planilha no dia da operação.</li>
        <li><b>Todo mês</b>, quando chegar o NAV Calculation do administrador: envie o arquivo (sem senha). A cota do mês passa a ser a oficial e a página confere a quantidade de cada ativo.</li>
        <li><b>Captações</b>: lance em IGF TR → Captações e Resgates (manual) até chegar o relatório do administrador.</li>
        <li><b>Extrato</b> (opcional): se enviar, ele manda nas datas que cobre e traz dividendos e preços reais de execução. Sem extrato, os cupons dos bonds entram pelo calendário e os dividendos das ações só aparecem na cota oficial.</li>
        <li>Se aparecer &quot;sem ativo cadastrado&quot;: cadastre o ativo em Django admin → Asset aliases (id, ISIN, tickers) e recalcule.</li>
      </ol>
      <p className="text-[11px] text-slate-500 mt-3">Base: histórico de posições até {dBR(data.method.cutover)}; depois extrato + preços. Relatórios do administrador carregados: {data.method.admin_reports.map(dBR).join(", ") || "nenhum"}. Marca d&apos;água atual: {data.hwm.toFixed(6)}.</p>
    </details>
  );
}

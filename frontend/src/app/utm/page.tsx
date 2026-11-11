"use client";

/**
 * UTM — carteira interna montada a partir dos 13Fs dos gestores: 10 nomes a 10%,
 * rebalanceada logo após cada prazo de 13F. Às vezes entra dinheiro (aporte) e às
 * vezes sai (resgate) no rebalanceamento; o retorno é encadeado dia a dia e tira
 * esses fluxos, então aporte/resgate nunca aparece como rentabilidade.
 * Dados: GET /api/utm/ (motor em backend/finance/utm.py).
 */
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
} from "recharts";
import { RefreshCcw, Upload, Plus, Trash2, X, CalendarClock, ChevronDown, ChevronRight } from "lucide-react";
import { authFetch } from "@/lib/authFetch";

const API = `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/utm`;

// ─── Types ───────────────────────────────────────────────────────────────────
type Pt = [string, number, number, number, number]; // date, UTM, SPY, QQQ (índices TR), patrimônio
interface Holding { t: string; shares: number; px_reb: number | null; px: number | null; px_date: string | null; ret: number | null; ret_px: number | null; divs: number; r1d: number | null; mv: number; w: number | null; w_reb: number | null; contrib: number | null; }
interface Rebal {
  date: string; end: string; current: boolean; n: number; source: string; note: string;
  ins: string[]; outs: string[]; added: string[]; trimmed: string[];
  value_after: number; value_before: number | null; flow: number | null; flow_pct: number | null; signal: string;
  ret: number; spy: number; qqq: number; best: [string, number] | null; worst: [string, number] | null;
  names: Record<string, number | null>; in_avg: number | null; out_avg: number | null; out_ret: Record<string, number | null>;
}
interface NameStat { t: string; n: number; first: string; last: string | null; held: boolean; ret: number | null; contrib: number; periods: string[]; }
interface Payload {
  empty?: false; asof: string; today: string; stale: boolean; inception: string; last_excel: string | null;
  series: Pt[]; holdings: Holding[]; rebalance: string; value: number;
  rebalances: Rebal[]; names: NameStat[];
  next13f: { deadline: string; quarter: string; expected_rebalance: string; days: number };
  pending: { date: string; n: number; tickers: string[]; source: string }[];
  warnings: string[]; refresh: { ok: boolean; warnings?: string[]; error?: string } | null;
}

// ─── Formatting ──────────────────────────────────────────────────────────────
const MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const pct = (v: number | null | undefined, d = 2) => v == null || isNaN(v) ? "–" : `${v > 0 ? "+" : ""}${(v * 100).toFixed(d).replace(".", ",")}%`;
const pp = (v: number | null | undefined, d = 1) => v == null || isNaN(v) ? "–" : `${v > 0 ? "+" : ""}${(v * 100).toFixed(d).replace(".", ",")} p.p.`;
const w1 = (v: number | null | undefined) => v == null ? "–" : `${(v * 100).toFixed(1).replace(".", ",")}%`;
const usd = (v: number | null | undefined) => v == null ? "–" : `${v < 0 ? "−" : ""}$${Math.abs(v) >= 1e6 ? `${(Math.abs(v) / 1e6).toFixed(2).replace(".", ",")}M` : `${Math.round(Math.abs(v) / 1e3).toLocaleString("pt-BR")}k`}`;
const dBR = (s?: string | null) => s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : "";
const dShort = (s?: string | null) => s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(2, 4)}` : "";
const mLabel = (s: string) => `${MES[+s.slice(5, 7) - 1]}/${s.slice(2, 4)}`;
const tone = (v: number | null | undefined) => v == null ? "" : v > 0 ? "text-emerald-600 dark:text-emerald-400" : v < 0 ? "text-rose-600 dark:text-rose-400" : "";

const card = "rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] shadow-sm";
const btn = "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111827] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-50";
const seg = (on: boolean) => `px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${on ? "bg-white dark:bg-[#111827] text-slate-900 dark:text-white shadow-sm" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"}`;
const segWrap = "flex flex-wrap items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg";
const th = "px-2 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400 text-right first:text-left";
const H2 = ({ children, sub }: { children: React.ReactNode; sub?: React.ReactNode }) => (
  <div className="mb-3"><h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">{children}</h2>{sub && <p className="text-[11px] text-slate-500 mt-0.5">{sub}</p>}</div>
);

const C = { UTM: "#3b82f6", SPY: "#eb6834", QQQ: "#1baf7a" };
const POS = "#10b981", NEG = "#f43f5e";

// ─── Series helpers ──────────────────────────────────────────────────────────
/** Índice do último ponto com data <= d (ou < d). -1 se nenhum. */
function lastIdx(s: Pt[], d: string, strict = false) {
  let lo = 0, hi = s.length - 1, k = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (strict ? s[m][0] < d : s[m][0] <= d) { k = m; lo = m + 1; } else hi = m - 1; }
  return k;
}
function periodRet(s: Pt[], a: number, b: number) {
  if (a < 0 || b < 0 || b <= a) return null;
  return [1, 2, 3].map(c => (s[b][c] as number) / (s[a][c] as number) - 1) as [number, number, number];
}

// ─── Page ────────────────────────────────────────────────────────────────────
export default function UtmPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [empty, setEmpty] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string }[]>([]);
  const [showRebal, setShowRebal] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const autoRefreshed = useRef(false);

  const load = useCallback(async (refresh = false) => {
    setBusy(refresh ? "Buscando preços…" : "Carregando…");
    try {
      const r = await authFetch(`${API}/${refresh ? "?refresh=1" : ""}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `Erro ${r.status}`);
      if (j.empty) { setEmpty(true); setData(null); }
      else {
        setEmpty(false); setData(j);
        const w = [...(j.refresh?.warnings || []), ...(j.refresh && !j.refresh.ok && j.refresh.error ? [`Atualização de preços falhou: ${j.refresh.error}`] : [])];
        if (refresh) setMsg(w.map((t: string) => ({ ok: false, text: t })));
        // Preços atrasados: busca uma vez sozinho.
        if (j.stale && !refresh && !autoRefreshed.current) { autoRefreshed.current = true; setBusy(null); return load(true); }
      }
    } catch (e) { setMsg([{ ok: false, text: e instanceof Error ? e.message : String(e) }]); }
    setBusy(null);
  }, []);
  useEffect(() => { load(); }, [load]);

  const upload = async (f: File | undefined) => {
    if (!f) return;
    const fd = new FormData(); fd.append("file", f);
    setBusy("Importando o Excel e buscando preços…"); setMsg([]);
    try {
      const r = await authFetch(`${API}/upload/`, { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `Erro ${r.status}`);
      setMsg([{ ok: true, text: `${f.name}: ${j.rebalances} rebalanceamentos e ${j.prices.toLocaleString("pt-BR")} preços de ${dBR(j.first)} a ${dBR(j.last)}.` },
        ...((j.refresh?.warnings || []) as string[]).map(t => ({ ok: false, text: t }))]);
      await load();
    } catch (e) { setMsg([{ ok: false, text: e instanceof Error ? e.message : String(e) }]); setBusy(null); }
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div className="w-full max-w-6xl mx-auto space-y-5 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">UTM</h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-0.5">Carteira 13F · 10 nomes a 10%, rebalanceada após cada prazo de 13F</p>
        </div>
        <div className="flex flex-col sm:items-end gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <input ref={fileRef} type="file" accept=".xlsx" className="hidden" onChange={e => upload(e.target.files?.[0])} />
            <button className={btn} onClick={() => load(true)} disabled={!!busy || empty}><RefreshCcw className={`w-3.5 h-3.5 ${busy ? "animate-spin" : ""}`} />Atualizar preços</button>
            <button className={btn} onClick={() => setShowRebal(true)} disabled={!!busy || !data}><Plus className="w-3.5 h-3.5" />Novo rebalanceamento</button>
            <button className={btn} onClick={() => fileRef.current?.click()} disabled={!!busy}><Upload className="w-3.5 h-3.5" />Enviar Excel</button>
          </div>
          {data && <p className="text-[11px] sm:text-xs text-slate-400 font-medium tabular-nums">Preços de {dBR(data.asof)} · patrimônio {usd(data.value)}</p>}
        </div>
      </div>

      {(busy || msg.length > 0) && (
        <div className={`${card} p-4 space-y-1`}>
          {busy && <p className="text-xs text-slate-500">{busy}</p>}
          {msg.map((m, i) => <p key={i} className={`text-xs ${m.ok ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400"}`}>{m.text}</p>)}
        </div>
      )}

      {empty && (
        <div className={`${card} p-6 text-sm text-slate-600 dark:text-slate-300 space-y-2`}>
          <p className="font-semibold text-slate-900 dark:text-white">Nenhum dado da UTM ainda.</p>
          <p>Envie o Excel interno da UTM (abas <b>Position</b>, <b>Stock Prices</b> e <b>Dividends</b>) em <b>Enviar Excel</b>. O histórico de posições e preços é importado e os preços seguintes vêm do Yahoo.</p>
        </div>
      )}

      {data && <Body data={data} />}
      {data && showRebal && <RebalanceDialog data={data} onClose={() => setShowRebal(false)} onSaved={async (t) => { setShowRebal(false); setMsg([{ ok: true, text: t }]); await load(); }} />}
    </div>
  );
}

function Body({ data }: { data: Payload }) {
  return (
    <>
      <NextBanner data={data} />
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6 items-start">
        <div className="lg:col-span-7"><ReturnsTable data={data} /></div>
        <div className="lg:col-span-5"><CurrentBasket data={data} /></div>
      </div>
      <RiskStrip data={data} />
      <IndexChart data={data} />
      <MonthlyHeat data={data} />
      <RebalanceTable data={data} />
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 sm:gap-6 items-start">
        <SwapScore data={data} />
        <FlowsChart data={data} />
      </div>
      <NamesTable data={data} />
      <p className="text-[11px] text-slate-500 leading-relaxed">
        Retorno total (com dividendos), encadeado dia a dia: cada dia rende com a cesta da véspera e o fluxo do rebalanceamento
        (variação de quantidade × fechamento) é retirado, então aporte e resgate não contam como rentabilidade. SPY e QQQ também com dividendos.
        Histórico até {dBR(data.last_excel)} vem do Excel interno; depois, fechamentos do Yahoo.
      </p>
      {data.warnings.length > 0 && <div className={`${card} p-4`}>{data.warnings.map((w, i) => <p key={i} className="text-xs text-amber-700 dark:text-amber-400">{w}</p>)}</div>}
    </>
  );
}

// ─── Próximo 13F ─────────────────────────────────────────────────────────────
function NextBanner({ data }: { data: Payload }) {
  const n = data.next13f;
  const last = data.rebalances[data.rebalances.length - 1];
  return (
    <div className={`${card} px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-1 text-xs`}>
      <span className="inline-flex items-center gap-2 font-semibold text-slate-700 dark:text-slate-200"><CalendarClock className="w-4 h-4 text-blue-500" />Próximo 13F ({n.quarter})</span>
      <span className="text-slate-500">prazo <b className="text-slate-900 dark:text-white tabular-nums">{dBR(n.deadline)}</b>{n.days >= 0 && <> · {n.days === 0 ? "hoje" : `faltam ${n.days} dia${n.days > 1 ? "s" : ""}`}</>}</span>
      <span className="text-slate-500">rebalanceamento esperado <b className="text-slate-900 dark:text-white tabular-nums">~{dBR(n.expected_rebalance)}</b></span>
      {data.pending.map(p => <span key={p.date} className="font-semibold text-amber-600 dark:text-amber-400">lançado para {dBR(p.date)} ({p.n} nomes) · entra quando houver o fechamento do dia</span>)}
      <span className="text-slate-500">último: <b className="text-slate-900 dark:text-white tabular-nums">{dBR(last.date)}</b> ({last.ins.length ? `entraram ${last.ins.join(", ")}` : "sem trocas"}{last.outs.length ? `; saíram ${last.outs.join(", ")}` : ""})</span>
    </div>
  );
}

// ─── Tabela de rentabilidade ─────────────────────────────────────────────────
function ReturnsTable({ data }: { data: Payload }) {
  const s = data.series;
  const end = s.length - 1;
  const asof = data.asof;
  const y = +asof.slice(0, 4);
  const [from, setFrom] = useState(data.rebalance);
  const [to, setTo] = useState(asof);
  const rows = useMemo(() => {
    const back = (months: number) => { const d = new Date(asof + "T12:00:00"); d.setMonth(d.getMonth() - months); return d.toISOString().slice(0, 10); };
    const out: { l: string; cap?: string; r: [number, number, number] | null; ann?: boolean; sep?: boolean }[] = [
      { l: "Desde o rebalanceamento", cap: dShort(data.rebalance), r: periodRet(s, lastIdx(s, data.rebalance), end) },
      { l: "Mês", cap: mLabel(asof), r: periodRet(s, Math.max(0, lastIdx(s, `${asof.slice(0, 7)}-01`, true)), end) },
      { l: "Ano", cap: String(y), r: periodRet(s, Math.max(0, lastIdx(s, `${y - 1}-12-31`)), end) },
      { l: "12 meses", r: periodRet(s, lastIdx(s, back(12)), end) },
      { l: "Desde o início", cap: mLabel(data.inception), r: periodRet(s, 0, end) },
    ];
    const yrs = end > 0 ? (new Date(asof).getTime() - new Date(data.inception).getTime()) / (365.25 * 864e5) : 0;
    const itd = out[4].r;
    out.push({ l: "Início, ao ano", r: itd && yrs > 0 ? itd.map(v => Math.pow(1 + v, 1 / yrs) - 1) as [number, number, number] : null, ann: true });
    const firstY = +data.inception.slice(0, 4);
    for (let yy = y - 1; yy >= firstY; yy--) {
      const a = yy === firstY ? 0 : lastIdx(s, `${yy - 1}-12-31`);
      out.push({ l: String(yy), cap: yy === firstY ? `desde ${dShort(data.inception)}` : undefined, r: periodRet(s, a, lastIdx(s, `${yy}-12-31`)), sep: yy === y - 1 });
    }
    return out;
  }, [s, end, asof, y, data.rebalance, data.inception]);
  const custom = periodRet(s, lastIdx(s, from), lastIdx(s, to));
  const cells = (r: [number, number, number] | null) => (
    <>
      <td className={`px-2 py-2 text-right font-semibold ${tone(r?.[0])}`}>{pct(r?.[0])}</td>
      <td className="px-2 py-2 text-right text-slate-600 dark:text-slate-300">{pct(r?.[1])}</td>
      <td className="px-2 py-2 text-right text-slate-600 dark:text-slate-300">{pct(r?.[2])}</td>
      <td className={`px-2 py-2 text-right whitespace-nowrap ${tone(r ? r[0] - r[1] : null)}`}>{r ? pp(r[0] - r[1]).replace(" p.p.", "") : "–"}</td>
      <td className={`px-2 py-2 text-right whitespace-nowrap hidden sm:table-cell ${tone(r ? r[0] - r[2] : null)}`}>{r ? pp(r[0] - r[2]).replace(" p.p.", "") : "–"}</td>
    </>
  );
  const dateIn = "text-xs px-1.5 py-0.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 tabular-nums";
  return (
    <div className={`${card} p-4 sm:p-5`}>
      <H2 sub="Retorno total, ajustado por aportes e resgates">Rentabilidade</H2>
      <div className="overflow-x-auto">
        <table className="w-full text-xs sm:text-[13px] tabular-nums">
          <thead><tr className="border-b border-slate-100 dark:border-slate-800">
            <th className={th}>Período</th><th className={th} style={{ color: C.UTM }}>UTM</th><th className={th}>SPY</th><th className={th}>QQQ</th>
            <th className={th}>vs SPY <span className="normal-case tracking-normal">(p.p.)</span></th><th className={`${th} hidden sm:table-cell`}>vs QQQ <span className="normal-case tracking-normal">(p.p.)</span></th>
          </tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.l} className={`${r.sep ? "border-t-2 border-slate-200 dark:border-slate-700" : "border-t border-slate-50 dark:border-slate-800/60"} ${r.ann ? "text-slate-500" : ""}`}>
                <td className="px-2 py-2 whitespace-nowrap">
                  <span className={r.ann ? "pl-3 text-slate-500" : "font-medium text-slate-800 dark:text-slate-100"}>{r.l}</span>
                  {r.cap && <span className="ml-1.5 text-[10px] text-slate-400">{r.cap}</span>}
                </td>
                {cells(r.r)}
              </tr>
            ))}
            <tr className="border-t-2 border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/30">
              <td className="px-2 py-2">
                <div className="flex flex-wrap items-center gap-1">
                  <span className="font-medium text-slate-800 dark:text-slate-100 mr-1">Período</span>
                  <input type="date" className={dateIn} value={from} min={data.inception} max={to} onChange={e => e.target.value && setFrom(e.target.value)} />
                  <span className="text-slate-400">a</span>
                  <input type="date" className={dateIn} value={to} min={from} max={asof} onChange={e => e.target.value && setTo(e.target.value)} />
                </div>
              </td>
              {cells(custom)}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Carteira atual ──────────────────────────────────────────────────────────
function CurrentBasket({ data }: { data: Payload }) {
  const h = data.holdings;
  const maxW = Math.max(0.14, ...h.map(x => x.w || 0));
  const drift = h.reduce((m, x) => Math.max(m, Math.abs((x.w || 0) - 0.1)), 0);
  const tot = h.reduce((a, x) => a + (x.contrib || 0), 0);
  const pxOld = h.filter(x => x.px_date && x.px_date < data.asof).map(x => x.t);
  return (
    <div className={`${card} p-4 sm:p-5`}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <H2 sub={<>desde o rebalanceamento de {dBR(data.rebalance)} · {usd(data.value)}</>}>Carteira atual · {h.length} nomes</H2>
      </div>
      <table className="w-full text-xs sm:text-[13px] tabular-nums">
        <thead><tr className="border-b border-slate-100 dark:border-slate-800">
          <th className={th}>Ticker</th><th className={th}>Dia</th><th className={th}>Desde rebal.</th><th className={`${th} w-[42%]`}>Peso hoje</th>
        </tr></thead>
        <tbody>
          {h.map(x => (
            <tr key={x.t} className="border-t border-slate-50 dark:border-slate-800/60" title={`${x.shares.toLocaleString("pt-BR")} ações · ${x.px_reb?.toFixed(2)} → ${x.px?.toFixed(2)}${x.divs ? ` · dividendos ${x.divs.toFixed(2)}/ação` : ""} · contribuição ${pp(x.contrib)}`}>
              <td className="px-2 py-1.5 font-semibold text-slate-800 dark:text-slate-100">{x.t}</td>
              <td className={`px-2 py-1.5 text-right ${tone(x.r1d)}`}>{pct(x.r1d, 1)}</td>
              <td className={`px-2 py-1.5 text-right font-semibold ${tone(x.ret)}`}>{pct(x.ret, 1)}</td>
              <td className="px-2 py-1.5">
                <div className="flex items-center gap-2 justify-end">
                  <div className="relative flex-1 h-2 rounded-full bg-slate-100 dark:bg-slate-800 max-w-[120px]">
                    <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${((x.w || 0) / maxW) * 100}%`, background: (x.w || 0) >= 0.1 ? C.UTM : "#93c5fd" }} />
                    <div className="absolute -top-0.5 -bottom-0.5 w-px bg-slate-500" style={{ left: `${(0.1 / maxW) * 100}%` }} title="10%" />
                  </div>
                  <span className="w-11 text-right">{w1(x.w)}</span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot><tr className="border-t-2 border-slate-200 dark:border-slate-700">
          <td className="px-2 py-2 font-semibold">Carteira</td><td />
          <td className={`px-2 py-2 text-right font-semibold ${tone(tot)}`}>{pct(tot, 1)}</td>
          <td className="px-2 py-2 text-right text-[11px] text-slate-500">maior desvio de 10%: <b className="text-slate-700 dark:text-slate-200">{pp(drift)}</b></td>
        </tr></tfoot>
      </table>
      <p className="text-[11px] text-slate-500 mt-2">Retorno com dividendos. Traço = 10% (peso do rebalanceamento).{pxOld.length > 0 && <> Preço antigo: {pxOld.join(", ")}.</>}</p>
    </div>
  );
}

// ─── Risco ───────────────────────────────────────────────────────────────────
function RiskStrip({ data }: { data: Payload }) {
  const st = useMemo(() => {
    const s = data.series;
    const ru: number[] = [], rs: number[] = [];
    let peak = 0, mdd = 0, mddD = "";
    for (let i = 1; i < s.length; i++) { ru.push(s[i][1] / s[i - 1][1] - 1); rs.push(s[i][2] / s[i - 1][2] - 1); }
    s.forEach(p => { peak = Math.max(peak, p[1]); const dd = p[1] / peak - 1; if (dd < mdd) { mdd = dd; mddD = p[0]; } });
    const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
    const mu = mean(ru), ms = mean(rs);
    let cov = 0, vu = 0, vs = 0, te = 0;
    ru.forEach((r, i) => { cov += (r - mu) * (rs[i] - ms); vu += (r - mu) ** 2; vs += (rs[i] - ms) ** 2; });
    const ex = ru.map((r, i) => r - rs[i]); const me = mean(ex); ex.forEach(e => { te += (e - me) ** 2; });
    const n = ru.length - 1;
    // Mensal
    const ends: number[] = [];
    s.forEach((p, i) => { if (i === s.length - 1 || s[i + 1][0].slice(0, 7) !== p[0].slice(0, 7)) ends.push(i); });
    let beat = 0, nm = 0, best = -1, worst = 1, bestM = "", worstM = "";
    let prev = 0;
    ends.forEach(i => { const u = s[i][1] / s[prev][1] - 1, b = s[i][2] / s[prev][2] - 1; if (i > prev) { nm++; if (u > b) beat++; if (u > best) { best = u; bestM = s[i][0]; } if (u < worst) { worst = u; worstM = s[i][0]; } } prev = i; });
    const cur = s[s.length - 1][1] / peak - 1;
    return { vol: Math.sqrt(vu / n * 252), volS: Math.sqrt(vs / n * 252), beta: cov / vs, corr: cov / Math.sqrt(vu * vs), te: Math.sqrt(te / n * 252), mdd, mddD, cur, beat, nm, best, bestM, worst, worstM };
  }, [data]);
  const kpi = (l: string, v: React.ReactNode, sub?: React.ReactNode, cls = "") => (
    <div key={l} className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-1">{l}</p>
      <p className={`text-lg font-bold tabular-nums leading-none ${cls || "text-slate-900 dark:text-white"}`}>{v}</p>
      {sub && <p className="text-[11px] text-slate-400 mt-1 tabular-nums">{sub}</p>}
    </div>
  );
  return (
    <div className={`${card} p-4 sm:p-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-x-6 gap-y-4`}>
      {kpi("Volatilidade", w1(st.vol), <>SPY {w1(st.volS)}</>, "")}
      {kpi("Máx. queda", pct(st.mdd, 1), <>em {dShort(st.mddD)} · hoje {pct(st.cur, 1)}</>, "text-rose-600 dark:text-rose-400")}
      {kpi("Beta vs SPY", st.beta.toFixed(2).replace(".", ","), <>correlação {st.corr.toFixed(2).replace(".", ",")}</>, "")}
      {kpi("Tracking error", w1(st.te), "ao ano, vs SPY")}
      {kpi("Meses acima do SPY", `${st.beat}/${st.nm}`, w1(st.beat / st.nm), "")}
      {kpi("Melhor / pior mês", <span><span className="text-emerald-600 dark:text-emerald-400">{pct(st.best, 1)}</span> <span className="text-rose-600 dark:text-rose-400">{pct(st.worst, 1)}</span></span>, <>{mLabel(st.bestM)} · {mLabel(st.worstM)}</>, "")}
    </div>
  );
}

// ─── Gráfico ─────────────────────────────────────────────────────────────────
function IndexChart({ data }: { data: Payload }) {
  const [range, setRange] = useState("Início");
  const [marks, setMarks] = useState(true);
  const { rows, rebs } = useMemo(() => {
    const s = data.series; const last = data.asof;
    const back = (m: number) => { const d = new Date(last + "T12:00:00"); d.setMonth(d.getMonth() - m); return d.toISOString().slice(0, 10); };
    const start = range === "Início" ? s[0][0] : range === "Ano" ? `${+last.slice(0, 4) - 1}-12-31` : range === "12m" ? back(12) : range === "3 anos" ? back(36) : data.rebalance;
    const i0 = Math.max(0, lastIdx(s, start));
    const b = s[i0];
    const rows = s.slice(i0).map(p => ({ d: p[0], UTM: 100 * p[1] / b[1], SPY: 100 * p[2] / b[2], QQQ: 100 * p[3] / b[3] }));
    const rebs = data.rebalances.map(r => r.date).filter(d => d >= rows[0].d);
    return { rows, rebs };
  }, [data, range]);
  return (
    <div className={`${card} p-4 sm:p-5`}>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">UTM vs SPY vs QQQ <span className="font-normal text-slate-500">(base 100, retorno total)</span></h2>
        <div className="flex items-center gap-2 flex-wrap">
          <label className="inline-flex items-center gap-1.5 text-xs text-slate-500"><input type="checkbox" checked={marks} onChange={e => setMarks(e.target.checked)} />rebalanceamentos</label>
          <div className={segWrap}>{["Início", "3 anos", "12m", "Ano", "Rebal."].map(r => <button key={r} className={seg(range === r)} onClick={() => setRange(r)}>{r}</button>)}</div>
        </div>
      </div>
      <div className="flex gap-4 mb-2 text-xs">{(["UTM", "SPY", "QQQ"] as const).map(k => <span key={k} className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300"><span className="w-3 h-[3px] rounded" style={{ background: C[k] }} />{k} <b className={tone(rows[rows.length - 1][k] / 100 - 1)}>{pct(rows[rows.length - 1][k] / 100 - 1, 1)}</b></span>)}</div>
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 5, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#94a3b833" vertical={false} />
            <XAxis dataKey="d" tickFormatter={(d: string) => mLabel(d)} minTickGap={40} tick={{ fontSize: 11, fill: "#94a3b8" }} />
            <YAxis domain={["auto", "auto"]} tick={{ fontSize: 11, fill: "#94a3b8" }} width={40} />
            <Tooltip formatter={(v, n) => [pct(Number(v) / 100 - 1), String(n)]} labelFormatter={(d) => dBR(String(d))} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
            <ReferenceLine y={100} stroke="#94a3b8" strokeDasharray="2 4" />
            {marks && rebs.map(d => <ReferenceLine key={d} x={d} stroke="#94a3b8" strokeOpacity={0.35} />)}
            <Line dataKey="SPY" stroke={C.SPY} strokeWidth={1.5} dot={false} isAnimationActive={false} />
            <Line dataKey="QQQ" stroke={C.QQQ} strokeWidth={1.5} dot={false} isAnimationActive={false} />
            <Line dataKey="UTM" stroke={C.UTM} strokeWidth={2.2} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── Rentabilidade mensal ────────────────────────────────────────────────────
function MonthlyHeat({ data }: { data: Payload }) {
  const keys = ["UTM", "UTM − SPY", "UTM − QQQ", "SPY", "QQQ"];
  const [k, setK] = useState("UTM");
  const rows = useMemo(() => {
    const s = data.series;
    const m: Record<string, Record<number, [number, number, number]>> = {};
    let prev = 0;
    s.forEach((p, i) => {
      if (i === s.length - 1 || s[i + 1][0].slice(0, 7) !== p[0].slice(0, 7)) {
        if (i > prev) { const r = [1, 2, 3].map(c => (p[c] as number) / (s[prev][c] as number) - 1) as [number, number, number]; (m[p[0].slice(0, 4)] = m[p[0].slice(0, 4)] || {})[+p[0].slice(5, 7)] = r; }
        prev = i;
      }
    });
    const pick = (r: [number, number, number]) => k === "UTM" ? r[0] : k === "SPY" ? r[1] : k === "QQQ" ? r[2] : k === "UTM − SPY" ? r[0] - r[1] : r[0] - r[2];
    const isDiff = k.includes("−");
    return Object.keys(m).sort().map(y => {
      const cells: (number | null)[] = []; const yr = [1, 1, 1];
      for (let i = 1; i <= 12; i++) { const r = m[y][i]; cells.push(r ? pick(r) : null); if (r) r.forEach((v, j) => { yr[j] *= 1 + v; }); }
      const yv = pick(yr.map(v => v - 1) as [number, number, number]);
      return { y, cells, yv, isDiff };
    });
  }, [data, k]);
  const bg = (v: number | null) => { if (v == null) return undefined; const t = Math.max(-1, Math.min(1, v / 0.08)); const a = Math.abs(t) * 0.45; return t >= 0 ? `rgba(16,185,129,${a})` : `rgba(244,63,94,${a})`; };
  return (
    <div className={`${card} p-4 sm:p-5`}>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">Rentabilidade mensal</h2>
        <select value={k} onChange={e => setK(e.target.value)} className="text-xs px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">{keys.map(x => <option key={x}>{x}</option>)}</select>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs tabular-nums">
          <thead><tr className="text-slate-500">{["Ano", ...MES, "Ano"].map((h, i) => <th key={i} className="px-1.5 py-1.5 text-right first:text-left font-medium">{h}</th>)}</tr></thead>
          <tbody>
            {rows.map(({ y, cells, yv, isDiff }) => (
              <tr key={y}>
                <td className="px-1.5 py-1 font-semibold font-sans">{y}</td>
                {cells.map((v, i) => <td key={i} className="px-1.5 py-1 text-right rounded" style={{ background: bg(v) }}>{v == null ? "" : isDiff ? pp(v).replace(" p.p.", "") : pct(v, 1)}</td>)}
                <td className="px-1.5 py-1 text-right font-semibold bg-slate-50 dark:bg-slate-800/50">{isDiff ? pp(yv).replace(" p.p.", "") : pct(yv, 1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {k.includes("−") && <p className="text-[11px] text-slate-500 mt-2">Diferença em pontos percentuais; no ano, retorno anual da UTM menos o do índice.</p>}
    </div>
  );
}

// ─── Rebalanceamentos ────────────────────────────────────────────────────────
const badge = (s: string) => s === "Aporte" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400" : s === "Resgate" ? "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300";

function RebalanceTable({ data }: { data: Payload }) {
  const [open, setOpen] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const list = [...data.rebalances].reverse();
  const shown = all ? list : list.slice(0, 8);
  const chips = (ts: string[], cls: string) => ts.length ? ts.map(t => <span key={t} className={`inline-block px-1.5 py-0.5 mr-1 mb-0.5 rounded text-[11px] font-semibold ${cls}`}>{t}</span>) : <span className="text-slate-400">–</span>;
  return (
    <div className={`${card} p-4 sm:p-5`}>
      <H2 sub="O que entrou e saiu, quanto dinheiro entrou ou saiu, e como a cesta rendeu até o rebalanceamento seguinte. Clique numa linha para ver nome a nome.">Rebalanceamentos</H2>
      <div className="overflow-x-auto">
        <table className="w-full text-xs tabular-nums">
          <thead><tr className="border-b border-slate-100 dark:border-slate-800">
            <th className={th}>Data</th><th className={`${th} !text-left`}>Tipo</th><th className={th}>Fluxo</th>
            <th className={`${th} !text-left`}>Entraram</th><th className={`${th} !text-left`}>Saíram</th>
            <th className={th}>Patrimônio</th><th className={th}>Cesta</th><th className={th}>SPY</th><th className={th}>Dif.</th>
          </tr></thead>
          <tbody>
            {shown.map(r => {
              const isOpen = open === r.date;
              return (
                <Fragment key={r.date}>
                  <tr className="border-t border-slate-50 dark:border-slate-800/60 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40" onClick={() => setOpen(isOpen ? null : r.date)}>
                    <td className="px-2 py-2 whitespace-nowrap font-medium text-slate-800 dark:text-slate-100">
                      {isOpen ? <ChevronDown className="inline w-3 h-3 mr-1" /> : <ChevronRight className="inline w-3 h-3 mr-1" />}{dShort(r.date)}
                      {r.current && <span className="ml-1.5 text-[10px] text-blue-500 font-semibold">atual</span>}
                    </td>
                    <td className="px-2 py-2"><span className={`px-1.5 py-0.5 rounded text-[11px] font-semibold ${badge(r.signal)}`}>{r.signal}</span></td>
                    <td className={`px-2 py-2 text-right whitespace-nowrap ${r.signal === "Rotação" ? "text-slate-500" : tone(r.flow)}`}>{r.flow == null ? "–" : <>{usd(r.flow)} <span className="text-[10px] text-slate-400">{pct(r.flow_pct, 1)}</span></>}</td>
                    <td className="px-2 py-2">{chips(r.ins, "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400")}</td>
                    <td className="px-2 py-2">{chips(r.outs, "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400")}</td>
                    <td className="px-2 py-2 text-right">{usd(r.value_after)}</td>
                    <td className={`px-2 py-2 text-right font-semibold ${tone(r.ret)}`}>{pct(r.ret, 1)}</td>
                    <td className="px-2 py-2 text-right text-slate-500">{pct(r.spy, 1)}</td>
                    <td className={`px-2 py-2 text-right ${tone(r.ret - r.spy)}`}>{pp(r.ret - r.spy)}</td>
                  </tr>
                  {isOpen && (
                    <tr className="bg-slate-50/70 dark:bg-slate-800/30">
                      <td colSpan={9} className="px-3 py-3">
                        <p className="text-[11px] text-slate-500 mb-2">{dBR(r.date)} a {dBR(r.end)}{r.current ? " (em curso)" : ""} · QQQ {pct(r.qqq, 1)}{r.added.length ? ` · aumentou ${r.added.join(", ")}` : ""}{r.trimmed.length ? ` · reduziu ${r.trimmed.join(", ")}` : ""}{r.note ? ` · ${r.note}` : ""}</p>
                        <div className="flex flex-wrap gap-1.5">
                          {Object.entries(r.names).sort((a, b) => (b[1] ?? -9) - (a[1] ?? -9)).map(([t, v]) => (
                            <span key={t} className={`px-2 py-1 rounded-md border text-[11px] tabular-nums ${r.ins.includes(t) ? "border-emerald-300 dark:border-emerald-700" : "border-slate-200 dark:border-slate-700"} bg-white dark:bg-[#111827]`}>
                              <b className="text-slate-700 dark:text-slate-200">{t}</b> <span className={tone(v)}>{pct(v, 1)}</span>
                            </span>
                          ))}
                          {Object.entries(r.out_ret).map(([t, v]) => (
                            <span key={t} className="px-2 py-1 rounded-md border border-dashed border-rose-300 dark:border-rose-800 text-[11px] tabular-nums text-slate-500" title="Saiu neste rebalanceamento: quanto teria rendido se tivesse ficado">
                              {t} (saiu) <span className={tone(v)}>{pct(v, 1)}</span>
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      {list.length > 8 && <button className={`${btn} mt-3`} onClick={() => setAll(a => !a)}>{all ? "Mostrar só os últimos 8" : `Mostrar todos (${list.length})`}</button>}
      <p className="text-[11px] text-slate-500 mt-2">Fluxo = variação de ações × fechamento do dia. Aporte/Resgate quando passa de 5% do patrimônio; abaixo disso é rotação autofinanciada. Cesta = retorno até o próximo rebalanceamento.</p>
    </div>
  );
}

// ─── Entraram vs saíram ──────────────────────────────────────────────────────
function SwapScore({ data }: { data: Payload }) {
  const rows = data.rebalances.filter(r => r.ins.length && r.in_avg != null && r.out_avg != null && r.signal !== "Início")
    .map(r => ({ d: r.date, diff: (r.in_avg as number) - (r.out_avg as number), ins: r.in_avg as number, outs: r.out_avg as number, cur: r.current }));
  const done = rows.filter(r => !r.cur);
  const wins = done.filter(r => r.diff > 0).length;
  const avg = done.length ? done.reduce((a, r) => a + r.diff, 0) / done.length : null;
  const last4 = done.slice(-4);
  const avg4 = last4.length ? last4.reduce((a, r) => a + r.diff, 0) / last4.length : null;
  const cur = rows.find(r => r.cur);
  return (
    <div className={`${card} p-4 sm:p-5`}>
      <H2 sub="Média de quem entrou menos média de quem saiu, do rebalanceamento até o seguinte (retorno total).">Trocas: quem entrou vs quem saiu</H2>
      <div className="grid grid-cols-3 gap-4 mb-4">
        <div><p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-1">Acerto</p><p className="text-lg font-bold tabular-nums">{wins}/{done.length}</p><p className="text-[11px] text-slate-400">trocas que ganharam</p></div>
        <div><p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-1">Média</p><p className={`text-lg font-bold tabular-nums ${tone(avg)}`}>{pp(avg)}</p><p className="text-[11px] text-slate-400">por trimestre · últimas 4 <span className={tone(avg4)}>{pp(avg4)}</span></p></div>
        <div><p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-1">Troca atual</p><p className={`text-lg font-bold tabular-nums ${tone(cur?.diff)}`}>{pp(cur?.diff)}</p><p className="text-[11px] text-slate-400">desde {dShort(data.rebalance)}</p></div>
      </div>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#94a3b833" vertical={false} />
            <XAxis dataKey="d" tickFormatter={(d: string) => mLabel(d)} tick={{ fontSize: 10, fill: "#94a3b8" }} minTickGap={8} />
            <YAxis tickFormatter={(v: number) => `${Math.round(v * 100)}`} tick={{ fontSize: 10, fill: "#94a3b8" }} width={32} />
            <Tooltip formatter={(v) => [pp(Number(v)), "entraram − saíram"]} labelFormatter={(d) => dBR(String(d))} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
            <ReferenceLine y={0} stroke="#94a3b8" />
            <Bar dataKey="diff" isAnimationActive={false}>{rows.map(r => <Cell key={r.d} fill={r.diff >= 0 ? POS : NEG} fillOpacity={r.cur ? 0.45 : 1} />)}</Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="text-[11px] text-slate-500 mt-2">Barra clara = troca ainda em curso. Só entram rebalanceamentos com preço de todos os nomes que saíram.</p>
    </div>
  );
}

// ─── Aportes e resgates ──────────────────────────────────────────────────────
function FlowsChart({ data }: { data: Payload }) {
  const rows = data.rebalances.filter(r => r.flow != null).map(r => ({ d: r.date, flow: r.flow as number, sig: r.signal }));
  const tot = rows.reduce((a, r) => a + r.flow, 0);
  const start = data.series[0][4], end = data.value;
  const gain = end - start - tot;
  return (
    <div className={`${card} p-4 sm:p-5`}>
      <H2 sub="Dinheiro que entrou (+) ou saiu (−) da UTM em cada rebalanceamento">Aportes e resgates</H2>
      <div className="grid grid-cols-3 gap-4 mb-4">
        <div><p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-1">Início</p><p className="text-lg font-bold tabular-nums">{usd(start)}</p><p className="text-[11px] text-slate-400">{dShort(data.inception)}</p></div>
        <div><p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-1">Fluxo líquido</p><p className={`text-lg font-bold tabular-nums ${tone(tot)}`}>{usd(tot)}</p><p className="text-[11px] text-slate-400">aportes − resgates</p></div>
        <div><p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-1">Ganho</p><p className={`text-lg font-bold tabular-nums ${tone(gain)}`}>{usd(gain)}</p><p className="text-[11px] text-slate-400">hoje {usd(end)}</p></div>
      </div>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#94a3b833" vertical={false} />
            <XAxis dataKey="d" tickFormatter={(d: string) => mLabel(d)} tick={{ fontSize: 10, fill: "#94a3b8" }} minTickGap={8} />
            <YAxis tickFormatter={(v: number) => `${(v / 1e6).toFixed(1)}M`} tick={{ fontSize: 10, fill: "#94a3b8" }} width={40} />
            <Tooltip formatter={(v) => [usd(Number(v)), "fluxo"]} labelFormatter={(d) => dBR(String(d))} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
            <ReferenceLine y={0} stroke="#94a3b8" />
            <Bar dataKey="flow" isAnimationActive={false}>{rows.map(r => <Cell key={r.d} fill={r.flow >= 0 ? POS : NEG} fillOpacity={r.sig === "Rotação" ? 0.35 : 1} />)}</Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="text-[11px] text-slate-500 mt-2">Barras claras = rotação (menos de 5% do patrimônio).</p>
    </div>
  );
}

// ─── Nomes ───────────────────────────────────────────────────────────────────
function NamesTable({ data }: { data: Payload }) {
  const [sort, setSort] = useState<{ k: "n" | "ret" | "contrib" | "t"; dir: number }>({ k: "n", dir: -1 });
  const total = data.rebalances.length;
  const rows = useMemo(() => [...data.names].sort((a, b) => {
    const x = a[sort.k], y = b[sort.k];
    if (x == null) return 1; if (y == null) return -1;
    return (x > y ? 1 : x < y ? -1 : 0) * sort.dir || b.n - a.n;
  }), [data.names, sort]);
  const thSort = (k: typeof sort.k, l: string) => (
    <th key={k} className={`${th} cursor-pointer select-none hover:text-slate-600`} onClick={() => setSort(s => ({ k, dir: s.k === k ? -s.dir : -1 }))}>{l}{sort.k === k ? (sort.dir < 0 ? " ↓" : " ↑") : ""}</th>
  );
  const core = data.names.filter(n => n.n >= total * 0.6).map(n => n.t);
  return (
    <div className={`${card} p-4 sm:p-5`}>
      <H2 sub={<>Todos os {data.names.length} nomes que já passaram pela UTM em {total} rebalanceamentos. Núcleo (em 60%+ deles): <b className="text-slate-700 dark:text-slate-200">{core.join(", ")}</b>.</>}>Nomes</H2>
      <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
        <table className="w-full text-xs tabular-nums">
          <thead className="sticky top-0 bg-white dark:bg-[#111827]"><tr className="border-b border-slate-100 dark:border-slate-800">
            {thSort("t", "Ticker")}{thSort("n", "Rebalanc.")}<th className={`${th} !text-left`}>Presença</th><th className={th}>Período</th>{thSort("ret", "Retorno na carteira")}{thSort("contrib", "Contribuição")}
          </tr></thead>
          <tbody>
            {rows.map(n => (
              <tr key={n.t} className="border-t border-slate-50 dark:border-slate-800/60">
                <td className="px-2 py-1.5 font-semibold text-slate-800 dark:text-slate-100">{n.t}{n.held && <span className="ml-1.5 text-[10px] text-blue-500">atual</span>}</td>
                <td className="px-2 py-1.5 text-right">{n.n}</td>
                <td className="px-2 py-1.5">
                  <div className="flex gap-px">{data.rebalances.map(r => <span key={r.date} className="w-1.5 h-3 rounded-sm" style={{ background: n.periods.includes(r.date) ? C.UTM : "#94a3b833" }} title={dBR(r.date)} />)}</div>
                </td>
                <td className="px-2 py-1.5 text-right text-slate-500 whitespace-nowrap">{mLabel(n.first)} – {n.last ? mLabel(n.last) : "hoje"}</td>
                <td className={`px-2 py-1.5 text-right font-semibold ${tone(n.ret)}`}>{pct(n.ret, 1)}</td>
                <td className={`px-2 py-1.5 text-right ${tone(n.contrib)}`}>{pp(n.contrib)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-slate-500 mt-2">Retorno na carteira = retorno total encadeado só nos dias em que o nome estava na UTM. Contribuição = soma diária de peso × retorno (p.p. do retorno da UTM).</p>
    </div>
  );
}

// ─── Novo rebalanceamento ────────────────────────────────────────────────────
function RebalanceDialog({ data, onClose, onSaved }: { data: Payload; onClose: () => void; onSaved: (msg: string) => void }) {
  const [date, setDate] = useState(data.next13f.expected_rebalance);
  const [note, setNote] = useState("");
  const [rows, setRows] = useState(data.holdings.map(h => ({ ticker: h.t, shares: String(h.shares) })));
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true); setErr(null);
    try {
      const r = await authFetch(`${API}/rebalances/`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, note, holdings: rows.filter(x => x.ticker.trim()).map(x => ({ ticker: x.ticker.trim(), shares: x.shares.includes(",") ? Number(x.shares.replace(/\./g, "").replace(",", ".")) : Number(x.shares) })) }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `Erro ${r.status}`);
      onSaved(`Rebalanceamento de ${dBR(j.date)} salvo com ${j.n} nomes.`);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    setSaving(false);
  };
  const del = async () => {
    setSaving(true); setErr(null);
    try {
      const r = await authFetch(`${API}/rebalances/?date=${date}`, { method: "DELETE" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `Erro ${r.status}`);
      onSaved(`Rebalanceamento de ${dBR(date)} apagado.`);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    setSaving(false);
  };
  const inp = "w-full text-xs px-2 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900";
  const isManual = [...data.rebalances, ...data.pending].some(r => r.date === date && r.source === "manual");
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className={`${card} w-full max-w-lg p-5 max-h-[90vh] overflow-y-auto`} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-bold text-slate-900 dark:text-white">Novo rebalanceamento</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800"><X className="w-4 h-4" /></button>
        </div>
        <p className="text-[11px] text-slate-500 mb-3">Informe a <b>quantidade final de ações</b> de cada nome depois do trade (data do trade, fechamento). Aporte ou resgate sai sozinho da diferença de quantidade × preço; não lance o dinheiro à parte. Já vem preenchido com a carteira atual.</p>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <label className="text-xs text-slate-500">Data do trade<input type="date" className={`${inp} mt-1`} value={date} onChange={e => setDate(e.target.value)} /></label>
          <label className="text-xs text-slate-500">Observação<input className={`${inp} mt-1`} value={note} onChange={e => setNote(e.target.value)} placeholder="ex.: 13F 3T26" /></label>
        </div>
        <table className="w-full text-xs mb-2">
          <thead><tr><th className={th}>Ticker</th><th className={th}>Ações</th><th /></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="py-1 pr-2"><input className={inp} value={r.ticker} onChange={e => setRows(rs => rs.map((x, j) => j === i ? { ...x, ticker: e.target.value.toUpperCase() } : x))} /></td>
                <td className="py-1 pr-2"><input className={`${inp} text-right tabular-nums`} value={r.shares} inputMode="decimal" onChange={e => setRows(rs => rs.map((x, j) => j === i ? { ...x, shares: e.target.value } : x))} /></td>
                <td className="py-1 w-8"><button className="p-1 rounded text-slate-400 hover:text-rose-500" onClick={() => setRows(rs => rs.filter((_, j) => j !== i))}><Trash2 className="w-3.5 h-3.5" /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <button className={btn} onClick={() => setRows(rs => [...rs, { ticker: "", shares: "" }])}><Plus className="w-3.5 h-3.5" />Adicionar nome</button>
        <p className="text-[11px] text-slate-500 mt-2">{rows.filter(r => r.ticker.trim()).length} nomes. Tickers como no Yahoo (ex.: GOOGL, TSM).</p>
        {err && <p className="text-xs text-rose-600 mt-2">{err}</p>}
        <div className="flex justify-between gap-2 mt-4">
          <div>{isManual && <button className={`${btn} !text-rose-600`} onClick={del} disabled={saving}><Trash2 className="w-3.5 h-3.5" />Apagar o de {dShort(date)}</button>}</div>
          <div className="flex gap-2">
            <button className={btn} onClick={onClose} disabled={saving}>Cancelar</button>
            <button className={`${btn} !bg-blue-600 !text-white !border-blue-600 hover:!bg-blue-700`} onClick={save} disabled={saving}>{saving ? "Salvando…" : "Salvar"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

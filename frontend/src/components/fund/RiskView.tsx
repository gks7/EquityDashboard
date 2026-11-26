"use client";

/**
 * Aba "Risco" do Dashboard: volatilidade, drawdown, VaR, beta e de onde vem o risco do IGF TR.
 *
 * Tudo é calculado no navegador a partir do payload de /api/igf-tr/performance/ que a página já
 * carrega (cota diária do fundo, índices em `bench` e as séries de Livro de ações / Crédito em
 * `sleeves`); não há chamada extra ao backend.
 *
 * Retornos são medidos entre os pontos em que a cota mudou. Dia sem preço novo (feriado, planilha
 * sem preços) deixa a cota parada e daria um retorno zero falso, que puxaria a vol. para baixo; esses
 * dias saem da conta e o retorno seguinte cobre o intervalo inteiro, para todas as séries juntas.
 */
import { useMemo, useState } from "react";
import {
  ResponsiveContainer, LineChart, Line, AreaChart, Area, BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
} from "recharts";

type Num = number | null;
/** O pedaço do payload de performance que a aba usa (FundPage passa o payload inteiro). */
export interface RiskData {
  asof: string; official_last: string;
  px_asof: string | null; px_kind: string | null;
  kpi: { nav: number };
  fund: [string, number, number, number][];
  bench: Record<string, Num[]>; sleeves: Record<string, number[]>;
  assets: { bucket: string; status: string; w: number }[];
}

// ─── Formatting ──────────────────────────────────────────────────────────────
const MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const pct = (v: Num | undefined, d = 2) => v == null || !isFinite(v) ? "–" : `${v > 0 ? "+" : ""}${(v * 100).toFixed(d).replace(".", ",")}%`;
const pctU = (v: Num | undefined, d = 1) => v == null || !isFinite(v) ? "–" : `${(v * 100).toFixed(d).replace(".", ",")}%`;
const dec = (v: Num | undefined, d = 2) => v == null || !isFinite(v) ? "–" : v.toFixed(d).replace(".", ",").replace(/^-/, "−");
const dBR = (s?: string | null) => s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : "";
const mon = (d: string) => `${MES[+d.slice(5, 7) - 1]}/${d.slice(2, 4)}`;
const usd = (v: number) => `${v < 0 ? "−" : ""}$${Math.abs(v) >= 1e6 ? `${(Math.abs(v) / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} mi` : `${Math.round(Math.abs(v) / 1e3).toLocaleString("pt-BR")} mil`}`;
const tone = (v: Num | undefined) => v == null ? "" : v > 0 ? "text-emerald-600 dark:text-emerald-400" : v < 0 ? "text-rose-600 dark:text-rose-400" : "";

const card = "rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] shadow-sm";
const seg = (on: boolean) => `px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${on ? "bg-white dark:bg-[#111827] text-slate-900 dark:text-white shadow-sm" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"}`;
const segWrap = "flex flex-wrap items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg";
const h2 = "text-sm sm:text-base font-bold text-slate-900 dark:text-white";
const tip = { fontSize: 12, borderRadius: 8 };
const axis = { fontSize: 11, fill: "#94a3b8" };
const POS = "#10b981", NEG = "#f43f5e";

const FUND = "IGF TR", SPX = "S&P 500", RF = "SOFR (caixa USD)";
const SERIES = [
  { k: FUND, label: "IGF TR", color: "#3b82f6" },
  { k: "Livro de ações", label: "Livro de ações", color: "#e87ba4" },
  { k: "Crédito", label: "Crédito", color: "#14b8a6" },
  { k: SPX, label: "S&P 500", color: "#eb6834" },
  { k: "Nasdaq Composite", label: "Nasdaq", color: "#1baf7a" },
];
const EQ = ["Ações individuais", "ETFs de ações"], CR = ["ETFs de crédito", "Bonds (crédito)"];
const PERIODS = ["1M", "3M", "6M", "12M", "Ano", "Início"] as const;
type Period = typeof PERIODS[number];
const AN = 252;

// ─── Statistics ──────────────────────────────────────────────────────────────
const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
const sd = (a: number[]) => {
  if (a.length < 2) return null;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1));
};
const quant = (a: number[], p: number) => {
  const s = [...a].sort((x, y) => x - y), h = (s.length - 1) * p, lo = Math.floor(h);
  return s[lo] + (s[Math.min(lo + 1, s.length - 1)] - s[lo]) * (h - lo);
};
/** Pares (x, y) nos intervalos [j0, j1] em que as duas séries têm retorno. */
function pairs(x: Num[] | undefined, y: Num[] | undefined, j0: number, j1: number): [number[], number[]] {
  const a: number[] = [], b: number[] = [];
  if (!x || !y) return [a, b];
  for (let j = j0; j <= j1; j++) if (x[j] != null && y[j] != null) { a.push(x[j] as number); b.push(y[j] as number); }
  return [a, b];
}
function co(a: number[], b: number[]) {
  if (a.length < 10) return { corr: null, beta: null };
  const ma = mean(a), mb = mean(b);
  let c = 0, va = 0, vb = 0;
  for (let i = 0; i < a.length; i++) { c += (a[i] - ma) * (b[i] - mb); va += (a[i] - ma) ** 2; vb += (b[i] - mb) ** 2; }
  return { corr: va && vb ? c / Math.sqrt(va * vb) : null, beta: vb ? c / vb : null };
}

/** Pontos em que a cota mudou, com o nível de cada série nesses pontos e o retorno entre eles. */
function build(data: RiskData) {
  let n = data.fund.length;
  // Ponto intradiário de hoje é um dia pela metade: fica fora até virar fechamento.
  if (data.px_kind === "intraday" && data.px_asof && n > 2 && data.fund[n - 1][0].slice(0, 10) === data.px_asof.slice(0, 10)) n -= 1;
  const idx = [0];
  for (let i = 1; i < n; i++) if (data.fund[i][1] !== data.fund[i - 1][1]) idx.push(i);
  const src: Record<string, Num[]> = { ...data.bench, ...data.sleeves, [FUND]: data.fund.map(r => r[1]) };
  const lv: Record<string, Num[]> = {}, ret: Record<string, Num[]> = {};
  Object.keys(src).forEach(k => {
    lv[k] = idx.map(i => { const v = src[k]?.[i]; return v == null || !isFinite(v) || v <= 0 ? null : v; });
    ret[k] = lv[k].map((v, j) => j === 0 || v == null || lv[k][j - 1] == null ? null : v / (lv[k][j - 1] as number) - 1);
  });
  return { dates: idx.map(i => data.fund[i][0].slice(0, 10)), lv, ret };
}
type Built = ReturnType<typeof build>;

/** Primeiro retorno dentro da janela (o nível de base é o ponto anterior). */
function startIdx(dates: string[], p: Period) {
  if (p === "Início") return 1;
  const last = dates[dates.length - 1];
  let s: string;
  if (p === "Ano") s = `${+last.slice(0, 4) - 1}-12-31`;
  else {
    const d = new Date(`${last}T12:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() - { "1M": 1, "3M": 3, "6M": 6, "12M": 12 }[p]);
    s = d.toISOString().slice(0, 10);
  }
  const j = dates.findIndex(x => x > s);
  return Math.max(1, j < 0 ? dates.length - 1 : j);
}

interface Stats {
  n: number; ret: Num; vol: number; down: Num; sortino: Num; var95: number; cvar: number;
  mdd: number; worst: number; best: number; pos: number; beta: Num; corr: Num;
}
function stats(B: Built, k: string, j0: number): Stats | null {
  const r = B.ret[k], L = B.lv[k], rf = B.ret[RF], J = B.dates.length - 1;
  if (!r) return null;
  const a: number[] = [], ex: number[] = [];
  for (let j = j0; j <= J; j++) if (r[j] != null) { a.push(r[j] as number); ex.push((r[j] as number) - (rf?.[j] ?? 0)); }
  if (a.length < 5) return null;
  const vol = (sd(a) as number) * Math.sqrt(AN);
  const exAnn = mean(ex) * AN;
  const down = Math.sqrt(ex.reduce((s, x) => s + Math.min(x, 0) ** 2, 0) / ex.length) * Math.sqrt(AN);
  const q = quant(a, 0.05), tail = a.filter(x => x <= q);
  // Retorno e máxima queda no período, sobre os níveis (base = ponto antes da janela).
  let base: Num = null, end: Num = null, pk = -Infinity, mdd = 0;
  for (let j = j0 - 1; j <= J; j++) {
    const v = L[j]; if (v == null) continue;
    if (base == null) base = v;
    end = v; pk = Math.max(pk, v); mdd = Math.min(mdd, v / pk - 1);
  }
  const { beta, corr } = k === SPX ? { beta: 1, corr: 1 } : co(...pairs(r, B.ret[SPX], j0, J));
  return {
    n: a.length, ret: base && end ? end / base - 1 : null, vol, down: down || null,
    sortino: down ? exAnn / down : null,
    var95: q, cvar: mean(tail), mdd, worst: Math.min(...a), best: Math.max(...a), pos: a.filter(x => x > 0).length / a.length, beta, corr,
  };
}

// ─── View ────────────────────────────────────────────────────────────────────
export default function RiskView({ data }: { data: RiskData }) {
  const B = useMemo(() => build(data), [data]);
  const [p, setP] = useState<Period>("12M");
  const j0 = useMemo(() => startIdx(B.dates, p), [B, p]);
  const S = useMemo(() => Object.fromEntries(SERIES.map(s => [s.k, stats(B, s.k, j0)])) as Record<string, Stats | null>, [B, j0]);
  const F = S[FUND];
  const L = B.lv[FUND];
  const ddNow = useMemo(() => { const v = L.filter((x): x is number => x != null); return v.length ? v[v.length - 1] / Math.max(...v) - 1 : null; }, [L]);
  const from = B.dates[j0 - 1];

  if (!F) return <div className={`${card} p-5 text-sm text-slate-500`}>Poucos dias de cota para medir risco.</div>;
  const spx = S[SPX];
  return (
    <div className="space-y-5 sm:space-y-6">
      <div className={`${card} p-4 sm:p-5`}>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h2 className={h2}>Risco do fundo</h2>
            <p className="text-[11px] text-slate-500 mt-0.5">{dBR(from)} a {dBR(B.dates[B.dates.length - 1])} · {F.n} retornos diários · vol. anualizada (√252)</p>
          </div>
          <div className={segWrap}>{PERIODS.map(x => <button key={x} className={seg(p === x)} onClick={() => setP(x)}>{x}</button>)}</div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-5 mb-5">
          <Tile label="Vol. anualizada" value={pctU(F.vol)} sub={<>S&amp;P 500 <b className="text-slate-600 dark:text-slate-300">{pctU(spx?.vol)}</b></>} />
          <Tile label="VaR 95% · 1 dia" value={pct(F.var95)} valueClass="text-rose-600 dark:text-rose-400" sub={`${usd(F.var95 * data.kpi.nav)} sobre o PL`} />
          <Tile label="Beta vs S&P" value={dec(F.beta)} sub={`correlação ${dec(F.corr)}`} />
          <Tile label="Drawdown atual" value={pct(ddNow, 1)} valueClass={ddNow && ddNow < -0.0005 ? "text-rose-600 dark:text-rose-400" : "text-slate-900 dark:text-white"} sub={`máx. no período ${pct(F.mdd, 1)}`} />
        </div>
        <FundStats s={F} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 sm:gap-6">
        <RollingVol B={B} />
        <Drawdown B={B} asof={B.dates[B.dates.length - 1]} />
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 sm:gap-6">
        <Distribution B={B} j0={j0} var95={F.var95} cvar={F.cvar} p={p} />
        <Extremes B={B} j0={j0} p={p} />
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 sm:gap-6">
        <Decomposition data={data} B={B} j0={j0} S={S} p={p} />
        <RollingBeta B={B} />
      </div>

      <p className="text-[11px] text-slate-500">
        Retornos entre os dias em que a cota mudou: dia sem preço novo fica fora e o retorno seguinte cobre o intervalo inteiro (para todas as séries).
        {data.asof > data.official_last && <> Depois de {dBR(data.official_last)} a cota é estimada pelos preços das posições, não a do administrador.</>}
        {" "}Sortino sobre o SOFR. S&amp;P 500 e Nasdaq sem dividendos. Livro de ações e Crédito são só a parte do fundo em cada classe.
      </p>
    </div>
  );
}

function Tile({ label, value, sub, valueClass = "text-slate-900 dark:text-white" }: { label: string; value: string; sub?: React.ReactNode; valueClass?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-1.5 whitespace-nowrap">{label}</p>
      <p className={`text-xl sm:text-2xl font-bold tracking-tight tabular-nums leading-none ${valueClass}`}>{value}</p>
      {sub && <p className="text-[11px] text-slate-400 mt-2 tabular-nums">{sub}</p>}
    </div>
  );
}

/** Medidas do fundo que não estão nos destaques de cima. */
function FundStats({ s }: { s: Stats }) {
  const items: [string, string, string, string?][] = [
    ["Retorno no período", pct(s.ret), tone(s.ret)],
    ["Vol. de baixa", pctU(s.down), "", "Desvio só dos dias abaixo do SOFR, anualizado"],
    ["Sortino", dec(s.sortino), "", "Retorno acima do SOFR / vol. de baixa"],
    ["Correlação vs S&P 500", dec(s.corr), ""],
    ["CVaR 95% · 1 dia", pct(s.cvar), "text-rose-600 dark:text-rose-400", "Perda média nos 5% piores dias"],
    ["Pior dia", pct(s.worst), "text-rose-600 dark:text-rose-400"],
    ["Melhor dia", pct(s.best), "text-emerald-600 dark:text-emerald-400"],
    ["Dias positivos", pctU(s.pos, 0), ""],
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 border-t border-slate-100 dark:border-slate-800">
      {items.map(([l, v, c, hint]) => (
        <div key={l} className="flex items-baseline justify-between gap-3 py-2 border-b border-slate-50 dark:border-slate-800/60 text-xs tabular-nums">
          <span className="text-slate-500 dark:text-slate-400" title={hint}>{l}{hint && <span className="text-slate-300 dark:text-slate-600"> ⓘ</span>}</span>
          <span className={`font-semibold ${c || "text-slate-900 dark:text-white"}`}>{v}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Rolling volatility ──────────────────────────────────────────────────────
function rollingSd(r: Num[], W: number) {
  return r.map((_, j) => {
    if (j < W) return null;
    const a: number[] = [];
    for (let i = j - W + 1; i <= j; i++) if (r[i] != null) a.push(r[i] as number);
    return a.length >= W * 0.8 ? (sd(a) as number) * Math.sqrt(AN) : null;
  });
}

function RollingVol({ B }: { B: Built }) {
  const [W, setW] = useState(63);
  const [on, setOn] = useState<Record<string, boolean>>({ [FUND]: true, [SPX]: true, "Livro de ações": false, "Crédito": false });
  const rows = useMemo(() => {
    const roll = Object.fromEntries(SERIES.map(s => [s.k, B.ret[s.k] ? rollingSd(B.ret[s.k], W) : []]));
    return B.dates.map((d, j) => { const o: Record<string, Num | string> = { d }; SERIES.forEach(s => { o[s.k] = roll[s.k][j] ?? null; }); return o; }).slice(W);
  }, [B, W]);
  const keys = SERIES.filter(s => s.k !== "Nasdaq Composite");
  return (
    <div className={`${card} p-4 sm:p-5`}>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <h2 className={h2}>Vol. móvel <span className="font-normal text-slate-500">(anualizada)</span></h2>
        <div className={segWrap}>{[[21, "1 mês"], [63, "3 meses"]].map(([w, l]) => <button key={w} className={seg(W === w)} onClick={() => setW(w as number)}>{l}</button>)}</div>
      </div>
      <Legend keys={keys} on={on} setOn={setOn} />
      <div className="h-64">
        {rows.length < 2 ? <Empty /> : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows} margin={{ top: 5, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#94a3b833" vertical={false} />
              <XAxis dataKey="d" tickFormatter={mon} minTickGap={40} tick={axis} />
              <YAxis tickFormatter={v => `${Math.round(v * 100)}%`} tick={axis} width={40} domain={[0, "auto"]} />
              <Tooltip formatter={(v, n) => [pctU(v as number), SERIES.find(s => s.k === n)?.label ?? String(n)]} labelFormatter={d => dBR(String(d))} contentStyle={tip} />
              {keys.filter(s => on[s.k]).map(s => <Line key={s.k} dataKey={s.k} stroke={s.color} strokeWidth={s.k === FUND ? 2.2 : 1.5} dot={false} isAnimationActive={false} connectNulls />)}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
      <p className="text-[11px] text-slate-500 mt-2">Desvio dos últimos {W} retornos diários × √252. Mostra se o risco do fundo está subindo e quanto ele fica abaixo do da bolsa.</p>
    </div>
  );
}

function Legend({ keys, on, setOn }: { keys: typeof SERIES; on: Record<string, boolean>; setOn: React.Dispatch<React.SetStateAction<Record<string, boolean>>> }) {
  return (
    <div className="flex flex-wrap gap-2 mb-3">
      {keys.map(s => (
        <button key={s.k} onClick={() => setOn(o => ({ ...o, [s.k]: !o[s.k] }))}
          className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border border-slate-200 dark:border-slate-700 ${on[s.k] ? "text-slate-700 dark:text-slate-200" : "opacity-40"}`}>
          <span className="w-3 h-[3px] rounded" style={{ background: s.color }} />{s.label}
        </button>
      ))}
    </div>
  );
}

const Empty = () => <div className="h-full flex items-center justify-center text-xs text-slate-400">Histórico curto demais.</div>;

// ─── Drawdown ────────────────────────────────────────────────────────────────
function underwater(L: Num[]) {
  let pk = -Infinity;
  return L.map(v => { if (v == null) return null; pk = Math.max(pk, v); return v / pk - 1; });
}
interface Episode { peak: string; trough: string; depth: number; rec: string | null }
function episodes(dates: string[], L: Num[]) {
  const out: Episode[] = [];
  let pk = -1, pkv = -Infinity, cur: Episode | null = null;
  L.forEach((v, j) => {
    if (v == null) return;
    if (v >= pkv) {
      if (cur) { cur.rec = dates[j]; out.push(cur); cur = null; }
      pk = j; pkv = v;
    } else {
      const dd = v / pkv - 1;
      if (!cur) cur = { peak: dates[pk], trough: dates[j], depth: dd, rec: null };
      else if (dd < cur.depth) { cur.depth = dd; cur.trough = dates[j]; }
    }
  });
  if (cur) out.push(cur);
  return out.filter(e => e.depth < -0.001).sort((a, b) => a.depth - b.depth).slice(0, 5);
}
const days = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);

function Drawdown({ B, asof }: { B: Built; asof: string }) {
  const rows = useMemo(() => {
    const f = underwater(B.lv[FUND]), s = underwater(B.lv[SPX] || []);
    return B.dates.map((d, j) => ({ d, [FUND]: f[j], [SPX]: s[j] ?? null }));
  }, [B]);
  const eps = useMemo(() => episodes(B.dates, B.lv[FUND]), [B]);
  return (
    <div className={`${card} p-4 sm:p-5`}>
      <h2 className={`${h2} mb-3`}>Drawdown <span className="font-normal text-slate-500">(queda desde o pico)</span></h2>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={rows} margin={{ top: 5, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#94a3b833" vertical={false} />
            <XAxis dataKey="d" tickFormatter={mon} minTickGap={40} tick={axis} />
            <YAxis tickFormatter={v => `${Math.round(v * 100)}%`} tick={axis} width={40} domain={["auto", 0]} />
            <Tooltip formatter={(v, n) => [pct(v as number, 1), n === FUND ? "IGF TR" : String(n)]} labelFormatter={d => dBR(String(d))} contentStyle={tip} />
            <Area dataKey={SPX} stroke="#eb6834" fill="none" strokeWidth={1.3} dot={false} isAnimationActive={false} connectNulls />
            <Area dataKey={FUND} stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.18} strokeWidth={1.8} dot={false} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="flex gap-4 text-xs text-slate-500 mt-2 mb-3">
        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-[3px] rounded bg-[#3b82f6]" />IGF TR</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-[3px] rounded bg-[#eb6834]" />S&amp;P 500</span>
      </div>
      <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 mb-1">Maiores quedas do fundo</p>
      <table className="w-full text-xs tabular-nums">
        <thead><tr className="text-slate-500">{["Pico", "Fundo", "Queda", "Recuperou", "Duração"].map((h, i) => <th key={h} className={`px-1.5 py-1.5 font-medium ${i ? "text-right" : "text-left"}`}>{h}</th>)}</tr></thead>
        <tbody>
          {eps.map(e => (
            <tr key={e.peak} className="border-t border-slate-50 dark:border-slate-800/60">
              <td className="px-1.5 py-1">{dBR(e.peak)}</td>
              <td className="px-1.5 py-1 text-right">{dBR(e.trough)}</td>
              <td className="px-1.5 py-1 text-right font-semibold text-rose-600 dark:text-rose-400">{pct(e.depth, 1)}</td>
              <td className="px-1.5 py-1 text-right">{e.rec ? dBR(e.rec) : <span className="text-amber-600 dark:text-amber-400">em aberto</span>}</td>
              <td className="px-1.5 py-1 text-right text-slate-500">{days(e.peak, e.rec || asof)} dias</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Distribution and extreme days ───────────────────────────────────────────
function windowRets(B: Built, k: string, j0: number) {
  const out: { j: number; r: number }[] = [];
  const r = B.ret[k];
  for (let j = j0; j < B.dates.length; j++) if (r?.[j] != null) out.push({ j, r: r[j] as number });
  return out;
}

function Distribution({ B, j0, var95, cvar, p }: { B: Built; j0: number; var95: number; cvar: number; p: Period }) {
  const { bins, varKey } = useMemo(() => {
    const a = windowRets(B, FUND, j0).map(x => x.r);
    const lo = Math.min(...a), hi = Math.max(...a);
    const step = [0.0005, 0.001, 0.0025, 0.005, 0.01, 0.02].find(s => (hi - lo) / s <= 30) ?? 0.05;
    const b0 = Math.floor(lo / step), b1 = Math.floor(hi / step);
    const key = (b: number) => (b * step * 100).toFixed(step < 0.001 ? 2 : step < 0.01 ? 1 : 0).replace(".", ",");
    const cnt = new Map<number, number>();
    a.forEach(x => { const b = Math.floor(x / step); cnt.set(b, (cnt.get(b) || 0) + 1); });
    const bins = [];
    for (let b = b0; b <= b1; b++) bins.push({ k: key(b), c: cnt.get(b) || 0, mid: (b + 0.5) * step, lo: b * step, hi: (b + 1) * step });
    return { bins, varKey: key(Math.floor(var95 / step)) };
  }, [B, j0, var95]);
  return (
    <div className={`${card} p-4 sm:p-5`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
        <h2 className={h2}>Retornos diários <span className="font-normal text-slate-500">({p})</span></h2>
        <p className="text-xs text-slate-500 tabular-nums">VaR 95% <b className="text-rose-600 dark:text-rose-400">{pct(var95)}</b> · CVaR <b className="text-rose-600 dark:text-rose-400">{pct(cvar)}</b></p>
      </div>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={bins} margin={{ top: 14, right: 8, left: 0, bottom: 0 }} barCategoryGap={1}>
            <CartesianGrid strokeDasharray="3 3" stroke="#94a3b833" vertical={false} />
            <XAxis dataKey="k" tick={axis} interval="preserveStartEnd" minTickGap={18} tickFormatter={v => `${v}%`} />
            <YAxis allowDecimals={false} tick={axis} width={32} />
            <Tooltip formatter={v => [`${v} dias`, "Dias"]} labelFormatter={(_, pl) => { const x = pl?.[0]?.payload as { lo: number; hi: number } | undefined; return x ? `${pct(x.lo)} a ${pct(x.hi)}` : ""; }} contentStyle={tip} />
            <ReferenceLine x={varKey} stroke={NEG} strokeDasharray="4 3" label={{ value: "VaR 95%", position: "top", fontSize: 10, fill: NEG }} />
            <Bar dataKey="c" isAnimationActive={false}>{bins.map(b => <Cell key={b.k} fill={b.mid < 0 ? NEG : POS} fillOpacity={0.75} />)}</Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="text-[11px] text-slate-500 mt-2">VaR histórico: em 5% dos dias o fundo perdeu mais que isso. CVaR é a perda média nesses dias.</p>
    </div>
  );
}

function Extremes({ B, j0, p }: { B: Built; j0: number; p: Period }) {
  const { worst, best } = useMemo(() => {
    const a = windowRets(B, FUND, j0).sort((x, y) => x.r - y.r);
    return { worst: a.slice(0, 5), best: a.slice(-5).reverse() };
  }, [B, j0]);
  const spx = B.ret[SPX], eq = B.ret["Livro de ações"], cr = B.ret["Crédito"];
  const table = (title: string, rows: { j: number; r: number }[]) => (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 mb-1">{title}</p>
      <table className="w-full text-xs tabular-nums">
        <thead><tr className="text-slate-500">{["Dia", "IGF TR", "Ações", "Crédito", "S&P 500"].map((h, i) => <th key={h} className={`px-1.5 py-1.5 font-medium ${i ? "text-right" : "text-left"}`}>{h}</th>)}</tr></thead>
        <tbody>
          {rows.map(x => (
            <tr key={x.j} className="border-t border-slate-50 dark:border-slate-800/60">
              <td className="px-1.5 py-1">{dBR(B.dates[x.j])}</td>
              <td className={`px-1.5 py-1 text-right font-semibold ${tone(x.r)}`}>{pct(x.r)}</td>
              <td className={`px-1.5 py-1 text-right ${tone(eq?.[x.j])}`}>{pct(eq?.[x.j])}</td>
              <td className={`px-1.5 py-1 text-right ${tone(cr?.[x.j])}`}>{pct(cr?.[x.j])}</td>
              <td className={`px-1.5 py-1 text-right ${tone(spx?.[x.j])}`}>{pct(spx?.[x.j])}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  return (
    <div className={`${card} p-4 sm:p-5 space-y-4`}>
      <h2 className={h2}>Piores e melhores dias <span className="font-normal text-slate-500">({p})</span></h2>
      {table("Piores", worst)}
      {table("Melhores", best)}
      <p className="text-[11px] text-slate-500">Ações e Crédito = retorno da parte do fundo em cada classe no mesmo dia.</p>
    </div>
  );
}

// ─── Risk decomposition ──────────────────────────────────────────────────────
function Decomposition({ data, B, j0, S, p }: { data: RiskData; B: Built; j0: number; S: Record<string, Stats | null>; p: Period }) {
  const d = useMemo(() => {
    const held = data.assets.filter(a => a.status === "Em carteira");
    const we = held.filter(a => EQ.includes(a.bucket)).reduce((t, a) => t + a.w, 0);
    const wc = held.filter(a => CR.includes(a.bucket)).reduce((t, a) => t + a.w, 0);
    const se = S["Livro de ações"]?.vol, sc = S["Crédito"]?.vol;
    const { corr } = co(...pairs(B.ret["Livro de ações"], B.ret["Crédito"], j0, B.dates.length - 1));
    if (se == null || sc == null || corr == null) return null;
    const ve = we * we * se * se, vc = wc * wc * sc * sc, cov = we * wc * corr * se * sc;
    const v = ve + vc + 2 * cov;
    if (!(v > 0)) return null;
    return { we, wc, wo: Math.max(0, 1 - we - wc), se, sc, corr, vol: Math.sqrt(v), ce: (ve + cov) / v, cc: (vc + cov) / v, alone: we * se + wc * sc };
  }, [data, B, j0, S]);
  if (!d) return <div className={`${card} p-5 text-sm text-slate-500`}>Sem histórico de Livro de ações e Crédito para separar o risco.</div>;
  const real = S[FUND]?.vol;
  return (
    <div className={`${card} p-4 sm:p-5`}>
      <h2 className={`${h2} mb-1`}>De onde vem o risco <span className="font-normal text-slate-500">({p})</span></h2>
      <p className="text-[11px] text-slate-500 mb-4">Pesos de hoje × vol. e correlação de cada classe no período.</p>
      <div className="flex h-3 rounded-full overflow-hidden bg-slate-100 dark:bg-slate-800 mb-2">
        <div className="bg-[#e87ba4]" style={{ width: `${Math.max(0, d.ce) * 100}%` }} />
        <div className="bg-[#14b8a6]" style={{ width: `${Math.max(0, d.cc) * 100}%` }} />
      </div>
      <div className="flex justify-between text-xs mb-4">
        <span className="inline-flex items-center gap-1.5 text-slate-500"><span className="w-2 h-2 rounded-full bg-[#e87ba4]" />Ações <b className="text-slate-900 dark:text-white tabular-nums">{pctU(d.ce, 0)}</b> do risco</span>
        <span className="inline-flex items-center gap-1.5 text-slate-500"><span className="w-2 h-2 rounded-full bg-[#14b8a6]" />Crédito <b className="text-slate-900 dark:text-white tabular-nums">{pctU(d.cc, 0)}</b> do risco</span>
      </div>
      <table className="w-full text-xs tabular-nums mb-4">
        <thead><tr className="text-slate-500">{["Classe", "Peso no PL", "Vol. da classe", "Contribuição à vol."].map((h, i) => <th key={h} className={`px-1.5 py-1.5 font-medium ${i ? "text-right" : "text-left"}`}>{h}</th>)}</tr></thead>
        <tbody>
          <tr className="border-t border-slate-50 dark:border-slate-800/60"><td className="px-1.5 py-1">Ações</td><td className="px-1.5 py-1 text-right">{pctU(d.we)}</td><td className="px-1.5 py-1 text-right">{pctU(d.se)}</td><td className="px-1.5 py-1 text-right">{pctU(d.ce * d.vol, 2)}</td></tr>
          <tr className="border-t border-slate-50 dark:border-slate-800/60"><td className="px-1.5 py-1">Crédito</td><td className="px-1.5 py-1 text-right">{pctU(d.wc)}</td><td className="px-1.5 py-1 text-right">{pctU(d.sc)}</td><td className="px-1.5 py-1 text-right">{pctU(d.cc * d.vol, 2)}</td></tr>
          <tr className="border-t border-slate-50 dark:border-slate-800/60 text-slate-500"><td className="px-1.5 py-1">Treasuries e caixa</td><td className="px-1.5 py-1 text-right">{pctU(d.wo)}</td><td className="px-1.5 py-1 text-right">~0</td><td className="px-1.5 py-1 text-right">~0</td></tr>
        </tbody>
      </table>
      <div className="grid grid-cols-3 gap-3 text-xs">
        <Mini label="Vol. pelos pesos de hoje" v={pctU(d.vol)} />
        <Mini label="Vol. realizada do fundo" v={pctU(real)} />
        <Mini label="Correlação ações × crédito" v={dec(d.corr)} />
      </div>
      <p className="text-[11px] text-slate-500 mt-3">
        Sem diversificação (correlação 1) a vol. seria {pctU(d.alone)}. A diferença para a vol. realizada vem de pesos que mudaram no período e do que fica fora das duas classes.
      </p>
    </div>
  );
}
const Mini = ({ label, v }: { label: string; v: string }) => (
  <div className="rounded-lg bg-slate-50 dark:bg-slate-800/50 p-2.5">
    <p className="text-[10px] text-slate-500 leading-tight">{label}</p>
    <p className="text-base font-bold tabular-nums text-slate-900 dark:text-white mt-1">{v}</p>
  </div>
);

// ─── Rolling beta / correlation ──────────────────────────────────────────────
function RollingBeta({ B }: { B: Built }) {
  const W = 63;
  const rows = useMemo(() => {
    const f = B.ret[FUND], s = B.ret[SPX];
    if (!s) return [];
    return B.dates.map((d, j) => {
      if (j < W) return null;
      const { beta, corr } = co(...pairs(f, s, j - W + 1, j));
      return { d, beta, corr };
    }).filter((x): x is { d: string; beta: Num; corr: Num } => x != null && x.beta != null);
  }, [B]);
  return (
    <div className={`${card} p-4 sm:p-5`}>
      <h2 className={`${h2} mb-3`}>Beta e correlação com o S&amp;P 500 <span className="font-normal text-slate-500">(3 meses móveis)</span></h2>
      <div className="h-64">
        {rows.length < 2 ? <Empty /> : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows} margin={{ top: 5, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#94a3b833" vertical={false} />
              <XAxis dataKey="d" tickFormatter={mon} minTickGap={40} tick={axis} />
              <YAxis tick={axis} width={36} domain={[(m: number) => Math.min(0, Math.floor(m * 10) / 10), (m: number) => Math.max(1, Math.ceil(m * 10) / 10)]} tickFormatter={v => dec(v as number, 1)} />
              <Tooltip formatter={(v, n) => [dec(v as number), n === "beta" ? "Beta" : "Correlação"]} labelFormatter={d => dBR(String(d))} contentStyle={tip} />
              <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="2 4" />
              <Line dataKey="corr" stroke="#94a3b8" strokeWidth={1.5} dot={false} isAnimationActive={false} />
              <Line dataKey="beta" stroke="#3b82f6" strokeWidth={2.2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
      <div className="flex gap-4 text-xs text-slate-500 mt-2">
        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-[3px] rounded bg-[#3b82f6]" />Beta</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-[3px] rounded bg-[#94a3b8]" />Correlação</span>
      </div>
      <p className="text-[11px] text-slate-500 mt-2">Beta 0,3 = quando o S&amp;P cai 1%, o fundo cai em média 0,3%. Calculado nos últimos {W} retornos diários.</p>
    </div>
  );
}

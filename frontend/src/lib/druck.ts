// Types and formatters for the Druck page (/druck).
// Daily payload: frontend/public/data/druck.json (backend/scripts/fetch_druck_data.py).
// Live payload: GET /api/druck/live/ (backend/api/druck_views.py).

export type DruckUnit = "rate" | "spread" | "yoy" | "pct_net" | "pct_gdp" | "usd_bn" | "usd_tn" | "px" | "ratio";
export type DruckMode = "pct" | "bp" | "pp" | "abs";
export type DruckFreq = "D" | "W" | "M" | "Q" | "A";

/** [days since 1970-01-01, value] */
export type DayPoint = [number, number];

export interface DruckRow {
  id: string;
  block: string;
  name: string;
  why: string;
  src: "fred" | "yf" | "ratio" | "calc";
  a: string | null;
  b: string | null;
  unit: DruckUnit;
  mode: DruckMode;
  dec: number;
  pre: string;
  pol: -1 | 0 | 1;
  freq: DruckFreq;
  last: number;
  date: string;
  stale: boolean;
  chg: Record<"1" | "3" | "6" | "12", number | null>;
  sigH: number;
  dir: -1 | 0 | 1;
  signal: -1 | 0 | 1 | null;
  inflex: boolean;
  pctl: number;
  histY: number;
  series: DayPoint[];
  ma: DayPoint[] | null;
}

export interface DruckBlock {
  id: string;
  name: string;
  desc: string;
  score: number;
  pos: number;
  neg: number;
  n: number;
}

export interface DruckPayload {
  generated_at: string;
  blocks: DruckBlock[];
  rows: DruckRow[];
  missing: string[];
}

export interface LiveSpec {
  grp: string;
  id: string;
  name: string;
  unit: "px" | "yield" | "spread";
  dec: number;
  pre: string;
  pol: -1 | 0 | 1;
}

export interface LiveQuote {
  last: number;
  prev: number | null;
  time: number;
  intraday: [number, number][];
}

export interface LivePayload {
  asof: number;
  spec: LiveSpec[];
  quotes: Record<string, LiveQuote>;
}

export const FREQ_LABEL: Record<DruckFreq, string> = {
  D: "diária", W: "semanal", M: "mensal", Q: "trimestral", A: "anual",
};

const MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export const nf = (v: number, d: number) =>
  v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });

export const dayToDate = (d: number) => new Date(d * 864e5);

export const fmtDay = (d: number) => {
  const t = dayToDate(d);
  return `${t.getUTCDate()} ${MES[t.getUTCMonth()]} ${t.getUTCFullYear()}`;
};

export const fmtIso = (s: string) => {
  const [y, m, d] = s.split("-");
  return `${+d} ${MES[+m - 1]} ${y}`;
};

export const fmtMonthTick = (d: number, yearsOnly: boolean) => {
  const t = dayToDate(d);
  return yearsOnly ? `${t.getUTCFullYear()}` : `${MES[t.getUTCMonth()]}/${String(t.getUTCFullYear()).slice(2)}`;
};

const PCT_UNITS: DruckUnit[] = ["rate", "yoy", "pct_net", "pct_gdp"];

export function fmtVal(r: Pick<DruckRow, "unit" | "dec" | "pre">, v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "—";
  if (PCT_UNITS.includes(r.unit)) return nf(v, r.dec) + "%";
  if (r.unit === "spread") return nf(v * 100, 0) + " bp";
  if (r.unit === "usd_tn") return "US$ " + nf(v, r.dec) + " tri";
  if (r.unit === "usd_bn") return "US$ " + nf(v, r.dec) + " bi";
  return r.pre + nf(v, r.dec);
}

export function fmtAxis(r: Pick<DruckRow, "unit">, v: number, step: number): string {
  const mult = r.unit === "spread" ? 100 : 1;
  const d = Math.max(0, Math.min(3, -Math.floor(Math.log10(Math.abs(step * mult) || 1) + 1e-9)));
  const s = nf(v * mult, d);
  return PCT_UNITS.includes(r.unit) ? s + "%" : s;
}

const sign = (c: number) => (c > 0 ? "+" : c < 0 ? "−" : "");

export function fmtChg(r: Pick<DruckRow, "mode">, c: number | null | undefined): string {
  if (c == null) return "—";
  const a = Math.abs(c);
  if (r.mode === "bp") return sign(c) + nf(a, 0) + " bp";
  if (r.mode === "pp") return sign(c) + nf(a, 1) + " pp";
  if (r.mode === "abs") return sign(c) + "US$ " + nf(a, 0) + " bi";
  return sign(c) + nf(a, 1) + "%";
}

/** Text color for a change, by direction × whether up is good for risk. */
export function chgTone(pol: number, c: number | null | undefined): string {
  if (c == null || !pol || Math.abs(c) < 1e-9) return "text-slate-500 dark:text-slate-400";
  return Math.sign(c) * pol > 0 ? "text-sky-700 dark:text-sky-400" : "text-rose-700 dark:text-rose-400";
}

export function liveVal(s: LiveSpec, v: number | null | undefined): string {
  if (v == null) return "—";
  if (s.unit === "yield") return nf(v, 2) + "%";
  if (s.unit === "spread") return nf(v * 100, 0) + " bp";
  return s.pre + nf(v, s.dec);
}

export function liveChg(s: LiveSpec, q: LiveQuote): { txt: string; c: number | null } {
  if (q.prev == null) return { txt: "—", c: null };
  const bp = s.unit === "yield" || s.unit === "spread";
  const c = bp ? (q.last - q.prev) * 100 : (q.last / q.prev - 1) * 100;
  const a = Math.abs(c);
  return { txt: (a < 1e-4 ? "" : sign(c)) + (bp ? nf(a, 1) + " bp" : nf(a, 2) + "%"), c };
}

/** Price of a table row from live quotes, if it is a market row. */
export function liveRowValue(r: DruckRow, quotes: Record<string, LiveQuote> | undefined): number | null {
  if (!quotes) return null;
  if (r.src === "yf" && quotes[r.id]) return quotes[r.id].last;
  if (r.src === "ratio" && r.a && r.b && quotes[r.a] && quotes[r.b]) return quotes[r.a].last / quotes[r.b].last;
  return null;
}

export type BlockTone = "good" | "bad" | "mixed" | "info";

export function blockTone(b: DruckBlock): BlockTone {
  if (!b.n) return "info";
  if (b.score > 0.25) return "good";
  if (b.score < -0.25) return "bad";
  return "mixed";
}

export function niceTicks(lo: number, hi: number, n: number): { ticks: number[]; step: number } {
  const span = hi - lo || Math.abs(hi) || 1;
  const raw = span / n;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((s) => s >= raw) ?? 10 * mag;
  const ticks: number[] = [];
  for (let v = Math.floor(lo / step) * step; v <= hi + step * 0.5; v += step) ticks.push(+v.toFixed(10));
  if (ticks[ticks.length - 1] < hi) ticks.push(ticks[ticks.length - 1] + step);
  return { ticks, step };
}

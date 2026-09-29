// Types and helpers for /data/sp500.json (built by backend/scripts/sp500).

export type Num = number | null;

export interface Sp500Company {
  ticker: string;
  name: string;
  sector: string;
  last_quarter: string;
  revenue_ttm: Num;
  revenue_growth: Num;
  op_margin: Num;
  net_margin: Num;
  fcf_ttm: Num;
  shareholder_return_ttm: Num;
  return_to_fcf: Num;
  share_change: Num;
  nd_ebitda: Num;
  roe: Num;
  roic: Num;
  member_since: string;
  series: { rev: Num[]; ebit: Num[]; ni: Num[] };
}

export interface Sp500Change {
  date: string;
  added: string;
  added_name: string;
  removed: string;
  removed_name: string;
  reason: string;
}

export type GroupKey = "core" | "fin" | "mag7" | "ai" | "ma";

export interface Sp500Payload {
  generated_at: string;
  as_of_quarter: string;
  quarters: string[];
  in_progress: { quarter: string; reported: number; members: number }[];
  coverage: { reported: number[]; members: number[] };
  aggregate: Record<string, Num[]>;
  macro: { quarters: string[]; gdp_nominal_yoy?: Num[]; usd_broad_yoy?: Num[] };
  sectors: Record<string, { revenue_yoy: Num[]; ebit_margin: Num[]; roic: Num[] }>;
  decomposition: {
    groups: { key: GroupKey; name: string }[];
    share: Record<GroupKey, Num[]>;
    growth: Record<GroupKey, Num[]>;
    contribution: Record<GroupKey, Num[]>;
    total: Num[];
    movers: ([string, GroupKey, number, number][] | null)[];
  };
  contributions: Record<"revenue" | "ebit", { top: [string, string, number][]; bottom: [string, string, number][]; total: number }>;
  companies: Sp500Company[];
  changes: Sp500Change[];
  stats: { companies_loaded: number; companies_failed: number; patched_from_filings: number };
  method: { ai_chain: string[]; mag7: string[]; outlier_growth: number; complete_coverage: number };
}

export const pct = (v: Num | undefined, d = 1) =>
  v === null || v === undefined ? "–" : `${(v * 100).toFixed(d)}%`;

export const pp = (v: Num | undefined, d = 1) =>
  v === null || v === undefined ? "–" : `${v >= 0 ? "+" : ""}${(v * 100).toFixed(d)} pp`;

export const mult = (v: Num | undefined) =>
  v === null || v === undefined ? "–" : `${v.toFixed(2)}x`;

export const bn = (v: Num | undefined, d = 0) =>
  v === null || v === undefined ? "–" : `$${v.toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: d })}bn`;

/** $ millions -> compact string */
export const usdM = (v: Num | undefined) => {
  if (v === null || v === undefined) return "–";
  const a = Math.abs(v);
  if (a >= 1e6) return `$${(v / 1e6).toFixed(2)}tn`;
  if (a >= 1e3) return `$${(v / 1e3).toFixed(1)}bn`;
  return `$${v.toFixed(0)}m`;
};

/** "2Q26" -> "Q2 2026" */
export const qLong = (q: string) => `Q${q[0]} 20${q.slice(2)}`;

// Series palette (validated for CVD separation; see the dataviz skill).
export const PALETTE = {
  light: { s1: "#2a78d6", s2: "#eb6834", s3: "#1baf7a", s4: "#4a3aa7", core: "#9aa4af", ink: "#0f1720", grid: "#e2e8f0", axis: "#64748b", pos: "#2a78d6", neg: "#e34948" },
  dark: { s1: "#3987e5", s2: "#d95926", s3: "#199e70", s4: "#9085e9", core: "#6b7580", ink: "#eef2f6", grid: "#1e293b", axis: "#94a3b8", pos: "#3987e5", neg: "#e66767" },
};
export type Palette = typeof PALETTE.light;

export const GROUP_COLOR = (p: Palette): Record<GroupKey, string> => ({
  core: p.core, fin: p.s3, mag7: p.s1, ai: p.s4, ma: p.s2,
});

"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  TrendingUp,
  TrendingDown,
  Briefcase,
  RefreshCcw,
  ArrowUpRight,
  ArrowDownRight,
  ChevronUp,
  ChevronDown,
  ArrowUpDown,
} from "lucide-react";
import { authFetch } from "@/lib/authFetch";
import { PieChart, Pie, Cell, Tooltip as RechartsTooltip, ResponsiveContainer, Legend } from "recharts";

const PIE_COLORS = [
  "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
  "#ec4899", "#14b8a6", "#f97316", "#06b6d4", "#84cc16", "#64748b"
];

// ─── Types ──────────────────────────────────────────────────────────
export interface PortfolioHolding {
  id: number;
  ticker: string | null;
  isin: string | null;
  quantity: number;
  average_cost: number;
  price: number | null;
  currency: string | null;
  market_value: number | null;
  total_cost: number;
  current_value: number;
  unrealized_pl: number;
  unrealized_pl_pct: number;
  asset_type: string | null;
  specific_type: string | null;
  chg_pct_1d: number | null;
  pnl_1d: number | null;
  pe_next_12_months: number | null;
  best_eps: number | null;
  eps_lt_growth: number | null;
  yield_to_worst: number | null;
  duration: number | null;
  rating: string | null;
  stock_details?: {
    ticker: string;
    company_name: string;
    current_price: number;
    previous_close: number | null;
    sector: string;
    forward_pe: number | null;
    consensus_target_pe: number;
    consensus_target_eps: number;
    consensus_yield: number;
  };
}

// ─── Helpers ────────────────────────────────────────────────────────
function fmt(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (a >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (a >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return n.toFixed(0);
}

function calcIRR(item: PortfolioHolding): number {
  if (!item.stock_details) return 0;
  const divYield = item.stock_details.consensus_yield || 0;
  const cur = item.price || item.stock_details.current_price || 0;
  const tgt =
    (item.stock_details.consensus_target_pe || 0) *
    (item.stock_details.consensus_target_eps || 0);
  if (cur > 0 && tgt > 0) {
    return (Math.pow(tgt / cur, 1 / 5) - 1) * 100 + divYield;
  }
  return 0;
}

// ─── S&P 500 benchmark weights ──────────────────────────────────────
const SP500: Record<string, number> = {
  Technology: 32.1,
  "Financial Services": 12.6,
  "Communication Services": 11.2,
  "Consumer Cyclical": 10.5,
  Healthcare: 9.4,
  Industrials: 8.8,
  "Consumer Defensive": 5.9,
  Energy: 3.3,
  Utilities: 2.4,
  "Basic Materials": 2.0,
  "Real Estate": 1.9,
};

// ─── ETF sector breakdown mappings ──────────────────────────────────
// Maps ETF tickers to their approximate sector allocations (must sum to ~100)
const ETF_SECTOR_WEIGHTS: Record<string, Record<string, number>> = {
  // S&P 500 trackers
  SPY:  { ...SP500 },
  VOO:  { ...SP500 },
  IVV:  { ...SP500 },
  SPLG: { ...SP500 },
  // Nasdaq 100
  QQQ:  { Technology: 50.5, "Communication Services": 16.5, "Consumer Cyclical": 14.5, "Consumer Defensive": 6.5, Healthcare: 5.5, Industrials: 4.0, Utilities: 1.5, "Basic Materials": 1.0 },
  QQQM: { Technology: 50.5, "Communication Services": 16.5, "Consumer Cyclical": 14.5, "Consumer Defensive": 6.5, Healthcare: 5.5, Industrials: 4.0, Utilities: 1.5, "Basic Materials": 1.0 },
  // Total US market
  VTI:  { Technology: 30.5, "Financial Services": 13.0, "Consumer Cyclical": 10.5, Healthcare: 12.0, Industrials: 10.0, "Communication Services": 9.0, "Consumer Defensive": 5.5, Energy: 3.8, Utilities: 2.7, "Real Estate": 2.0, "Basic Materials": 2.0 },
  ITOT: { Technology: 30.5, "Financial Services": 13.0, "Consumer Cyclical": 10.5, Healthcare: 12.0, Industrials: 10.0, "Communication Services": 9.0, "Consumer Defensive": 5.5, Energy: 3.8, Utilities: 2.7, "Real Estate": 2.0, "Basic Materials": 2.0 },
  SPTM: { Technology: 30.5, "Financial Services": 13.0, "Consumer Cyclical": 10.5, Healthcare: 12.0, Industrials: 10.0, "Communication Services": 9.0, "Consumer Defensive": 5.5, Energy: 3.8, Utilities: 2.7, "Real Estate": 2.0, "Basic Materials": 2.0 },
  // Dow Jones
  DIA:  { Technology: 20.0, "Financial Services": 22.0, Healthcare: 17.0, Industrials: 15.0, "Consumer Cyclical": 12.0, "Consumer Defensive": 5.0, "Communication Services": 4.0, Energy: 3.0, "Basic Materials": 2.0 },
  // Russell 2000
  IWM:  { "Financial Services": 16.0, Healthcare: 15.5, Industrials: 15.5, Technology: 13.5, "Consumer Cyclical": 11.0, Energy: 7.5, "Real Estate": 7.0, "Consumer Defensive": 4.0, "Basic Materials": 4.0, "Communication Services": 3.0, Utilities: 3.0 },
  // Russell 1000
  IWB:  { Technology: 31.0, "Financial Services": 12.5, Healthcare: 11.0, "Consumer Cyclical": 10.5, Industrials: 9.0, "Communication Services": 10.0, "Consumer Defensive": 5.5, Energy: 3.5, Utilities: 2.5, "Real Estate": 2.0, "Basic Materials": 2.0 },
  // S&P 500 Growth / Value
  SPYG: { Technology: 46.0, "Communication Services": 14.0, "Consumer Cyclical": 15.0, Healthcare: 10.0, Industrials: 6.0, "Financial Services": 4.0, "Consumer Defensive": 3.0, Energy: 1.0, "Basic Materials": 1.0 },
  SPYV: { "Financial Services": 22.0, Healthcare: 14.0, Industrials: 11.0, "Consumer Defensive": 10.0, Energy: 8.0, Technology: 9.0, Utilities: 7.0, "Consumer Cyclical": 6.0, "Real Estate": 5.0, "Communication Services": 4.0, "Basic Materials": 4.0 },
  IVW:  { Technology: 46.0, "Communication Services": 14.0, "Consumer Cyclical": 15.0, Healthcare: 10.0, Industrials: 6.0, "Financial Services": 4.0, "Consumer Defensive": 3.0, Energy: 1.0, "Basic Materials": 1.0 },
  IVE:  { "Financial Services": 22.0, Healthcare: 14.0, Industrials: 11.0, "Consumer Defensive": 10.0, Energy: 8.0, Technology: 9.0, Utilities: 7.0, "Consumer Cyclical": 6.0, "Real Estate": 5.0, "Communication Services": 4.0, "Basic Materials": 4.0 },
  // SPDR Sector ETFs
  XLK:  { Technology: 100.0 },
  XLF:  { "Financial Services": 100.0 },
  XLV:  { Healthcare: 100.0 },
  XLY:  { "Consumer Cyclical": 100.0 },
  XLP:  { "Consumer Defensive": 100.0 },
  XLE:  { Energy: 100.0 },
  XLI:  { Industrials: 100.0 },
  XLB:  { "Basic Materials": 100.0 },
  XLRE: { "Real Estate": 100.0 },
  XLC:  { "Communication Services": 100.0 },
  XLU:  { Utilities: 100.0 },
  // Vanguard sector ETFs
  VGT:  { Technology: 100.0 },
  VFH:  { "Financial Services": 100.0 },
  VHT:  { Healthcare: 100.0 },
  VCR:  { "Consumer Cyclical": 100.0 },
  VDC:  { "Consumer Defensive": 100.0 },
  VDE:  { Energy: 100.0 },
  VIS:  { Industrials: 100.0 },
  VAW:  { "Basic Materials": 100.0 },
  VNQ:  { "Real Estate": 100.0 },
  VOX:  { "Communication Services": 100.0 },
  VPU:  { Utilities: 100.0 },
  // iShares sector ETFs
  IYW:  { Technology: 100.0 },
  IYF:  { "Financial Services": 100.0 },
  IYH:  { Healthcare: 100.0 },
  IYC:  { "Consumer Cyclical": 100.0 },
  IYK:  { "Consumer Defensive": 100.0 },
  IYE:  { Energy: 100.0 },
  IYJ:  { Industrials: 100.0 },
  IYM:  { "Basic Materials": 100.0 },
  IYR:  { "Real Estate": 100.0 },
  IYZ:  { "Communication Services": 100.0 },
  IDU:  { Utilities: 100.0 },
  // MSCI EAFE / International (approximate)
  EFA:  { "Financial Services": 18.0, Industrials: 15.0, Healthcare: 13.0, Technology: 10.0, "Consumer Cyclical": 12.0, "Consumer Defensive": 10.0, "Basic Materials": 7.0, Energy: 5.0, Utilities: 4.0, "Communication Services": 4.0, "Real Estate": 2.0 },
  IEFA: { "Financial Services": 18.0, Industrials: 15.0, Healthcare: 13.0, Technology: 10.0, "Consumer Cyclical": 12.0, "Consumer Defensive": 10.0, "Basic Materials": 7.0, Energy: 5.0, Utilities: 4.0, "Communication Services": 4.0, "Real Estate": 2.0 },
  VEA:  { "Financial Services": 18.0, Industrials: 15.0, Healthcare: 13.0, Technology: 10.0, "Consumer Cyclical": 12.0, "Consumer Defensive": 10.0, "Basic Materials": 7.0, Energy: 5.0, Utilities: 4.0, "Communication Services": 4.0, "Real Estate": 2.0 },
  // Emerging Markets
  EEM:  { Technology: 22.0, "Financial Services": 21.0, "Consumer Cyclical": 14.0, "Communication Services": 10.0, Energy: 6.0, "Basic Materials": 7.0, Industrials: 6.0, "Consumer Defensive": 6.0, Healthcare: 4.0, Utilities: 3.0, "Real Estate": 1.0 },
  VWO:  { Technology: 22.0, "Financial Services": 21.0, "Consumer Cyclical": 14.0, "Communication Services": 10.0, Energy: 6.0, "Basic Materials": 7.0, Industrials: 6.0, "Consumer Defensive": 6.0, Healthcare: 4.0, Utilities: 3.0, "Real Estate": 1.0 },
  IEMG: { Technology: 22.0, "Financial Services": 21.0, "Consumer Cyclical": 14.0, "Communication Services": 10.0, Energy: 6.0, "Basic Materials": 7.0, Industrials: 6.0, "Consumer Defensive": 6.0, Healthcare: 4.0, Utilities: 3.0, "Real Estate": 1.0 },
  // All-World / ACWI
  VT:   { Technology: 26.0, "Financial Services": 15.0, Healthcare: 10.5, "Consumer Cyclical": 11.0, Industrials: 10.0, "Communication Services": 8.0, "Consumer Defensive": 6.0, Energy: 4.5, "Basic Materials": 4.0, Utilities: 3.0, "Real Estate": 2.0 },
  ACWI: { Technology: 26.0, "Financial Services": 15.0, Healthcare: 10.5, "Consumer Cyclical": 11.0, Industrials: 10.0, "Communication Services": 8.0, "Consumer Defensive": 6.0, Energy: 4.5, "Basic Materials": 4.0, Utilities: 3.0, "Real Estate": 2.0 },
  // S&P 500 Equal Weight
  RSP:  { ...SP500 },
  // Mid-Cap
  MDY:  { Industrials: 18.0, "Financial Services": 15.0, Technology: 13.0, "Consumer Cyclical": 13.0, Healthcare: 10.0, "Real Estate": 7.0, Energy: 6.0, "Basic Materials": 5.0, "Consumer Defensive": 5.0, Utilities: 4.0, "Communication Services": 4.0 },
  IJH:  { Industrials: 18.0, "Financial Services": 15.0, Technology: 13.0, "Consumer Cyclical": 13.0, Healthcare: 10.0, "Real Estate": 7.0, Energy: 6.0, "Basic Materials": 5.0, "Consumer Defensive": 5.0, Utilities: 4.0, "Communication Services": 4.0 },
  VO:   { Industrials: 18.0, "Financial Services": 15.0, Technology: 13.0, "Consumer Cyclical": 13.0, Healthcare: 10.0, "Real Estate": 7.0, Energy: 6.0, "Basic Materials": 5.0, "Consumer Defensive": 5.0, Utilities: 4.0, "Communication Services": 4.0 },
  // Large Cap Growth
  VUG:  { Technology: 46.0, "Communication Services": 14.0, "Consumer Cyclical": 15.0, Healthcare: 10.0, Industrials: 6.0, "Financial Services": 4.0, "Consumer Defensive": 3.0, Energy: 1.0, "Basic Materials": 1.0 },
  IWF:  { Technology: 46.0, "Communication Services": 14.0, "Consumer Cyclical": 15.0, Healthcare: 10.0, Industrials: 6.0, "Financial Services": 4.0, "Consumer Defensive": 3.0, Energy: 1.0, "Basic Materials": 1.0 },
  MGK:  { Technology: 50.0, "Communication Services": 15.0, "Consumer Cyclical": 14.0, Healthcare: 8.0, Industrials: 5.0, "Financial Services": 4.0, "Consumer Defensive": 2.0, Energy: 1.0, "Basic Materials": 1.0 },
  // Large Cap Value
  VTV:  { "Financial Services": 22.0, Healthcare: 14.0, Industrials: 11.0, "Consumer Defensive": 10.0, Energy: 8.0, Technology: 9.0, Utilities: 7.0, "Consumer Cyclical": 6.0, "Real Estate": 5.0, "Communication Services": 4.0, "Basic Materials": 4.0 },
  IWD:  { "Financial Services": 22.0, Healthcare: 14.0, Industrials: 11.0, "Consumer Defensive": 10.0, Energy: 8.0, Technology: 9.0, Utilities: 7.0, "Consumer Cyclical": 6.0, "Real Estate": 5.0, "Communication Services": 4.0, "Basic Materials": 4.0 },
  SCHV: { "Financial Services": 22.0, Healthcare: 14.0, Industrials: 11.0, "Consumer Defensive": 10.0, Energy: 8.0, Technology: 9.0, Utilities: 7.0, "Consumer Cyclical": 6.0, "Real Estate": 5.0, "Communication Services": 4.0, "Basic Materials": 4.0 },
};

// ─── Scatter color map for FI sub-types ─────────────────────────────
const FI_COLORS: Record<string, string> = {
  corp: "#14b8a6",      // teal
  index: "#8b5cf6",     // violet
  etf: "#8b5cf6",       // violet
  em: "#f97316",        // orange
  sovereign: "#f97316", // orange
  treasury: "#f43f5e",  // rose
};

function fiColor(item: PortfolioHolding): string {
  const s = ((item.specific_type || "") + " " + (item.asset_type || "")).toLowerCase();
  for (const [key, color] of Object.entries(FI_COLORS)) {
    if (s.includes(key)) return color;
  }
  return "#64748b"; // slate fallback
}

// ─── Main Component ─────────────────────────────────────────────────
export default function DashboardPage() {
  const router = useRouter();
  const [holdings, setHoldings] = useState<PortfolioHolding[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"equities" | "fi">("equities");
  const [sortCfg, setSortCfg] = useState<{ key: string; dir: "asc" | "desc" } | null>({
    key: "current_value",
    dir: "desc",
  });
  const [hoveredDot, setHoveredDot] = useState<PortfolioHolding | null>(null);
  const [exposureTab, setExposureTab] = useState<"diff" | "pies" | "table">("diff");

  useEffect(() => {
    (async () => {
      try {
        const res = await authFetch(
          `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/portfolio/`
        );
        setHoldings(await res.json());
      } catch (e) {
        console.error("Fetch failed", e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // ─── Derived data ──────────────────────────────────────────────────
  const totalValue = holdings.reduce((s, h) => s + h.current_value, 0);
  const totalDailyPL = holdings.reduce((s, h) => s + (h.pnl_1d || 0), 0);
  const prevDayValue = holdings.reduce((s, h) => {
    const prev = h.stock_details?.previous_close || h.stock_details?.current_price;
    return prev ? s + prev * h.quantity : s;
  }, 0);
  const totalDailyPLPct = prevDayValue > 0 ? (totalDailyPL / prevDayValue) * 100 : 0;

  const equities = useMemo(
    () => holdings.filter((h) => h.asset_type === "Equity" || h.stock_details),
    [holdings]
  );
  const fixedIncome = useMemo(
    () =>
      holdings.filter(
        (h) =>
          h.asset_type === "Fixed Income" ||
          h.asset_type === "Treasury" ||
          h.asset_type === "EM Sovereign"
      ),
    [holdings]
  );

  const eqValue = equities.reduce((s, h) => s + h.current_value, 0);
  const fiValue = fixedIncome.reduce((s, h) => s + h.current_value, 0);
  const eqPct = totalValue > 0 ? ((eqValue / totalValue) * 100).toFixed(1) : "0";
  const fiPct = totalValue > 0 ? ((fiValue / totalValue) * 100).toFixed(1) : "0";

  const eqDailyPL = equities.reduce((s, h) => s + (h.pnl_1d || 0), 0);
  const eqPrevValue = equities.reduce((s, h) => {
    const prev = h.stock_details?.previous_close || h.stock_details?.current_price;
    return prev ? s + prev * h.quantity : s;
  }, 0);
  const eqDailyPLPct = eqPrevValue > 0 ? (eqDailyPL / eqPrevValue) * 100 : 0;

  const eqWithPnl = useMemo(
    () => equities.filter((h) => h.pnl_1d != null).sort((a, b) => (b.pnl_1d ?? 0) - (a.pnl_1d ?? 0)),
    [equities]
  );
  const top3 = eqWithPnl.slice(0, 3);
  const bottom3 = eqWithPnl.slice(-3).reverse();

  // ─── Sort logic ────────────────────────────────────────────────────
  const toggleSort = (key: string) => {
    setSortCfg((prev) =>
      prev?.key === key && prev.dir === "desc"
        ? { key, dir: "asc" }
        : { key, dir: "desc" }
    );
  };

  const sorted = (arr: PortfolioHolding[]) => {
    if (!sortCfg) return arr;
    return [...arr].sort((a, b) => {
      let av: number | string = 0,
        bv: number | string = 0;
      switch (sortCfg.key) {
        case "ticker":
          av = a.ticker || a.isin || "";
          bv = b.ticker || b.isin || "";
          break;
        case "qty":
          av = a.quantity;
          bv = b.quantity;
          break;
        case "price":
          av = a.price || 0;
          bv = b.price || 0;
          break;
        case "current_value":
          av = a.current_value;
          bv = b.current_value;
          break;
        case "chg_1d":
          av = a.chg_pct_1d || 0;
          bv = b.chg_pct_1d || 0;
          break;
        case "pnl_1d":
          av = a.pnl_1d || 0;
          bv = b.pnl_1d || 0;
          break;
        case "pe":
          av = a.pe_next_12_months || 0;
          bv = b.pe_next_12_months || 0;
          break;
        case "tgt_pe":
          av = a.stock_details?.consensus_target_pe || 0;
          bv = b.stock_details?.consensus_target_pe || 0;
          break;
        case "tgt_eps":
          av = a.stock_details?.consensus_target_eps || 0;
          bv = b.stock_details?.consensus_target_eps || 0;
          break;
        case "irr":
          av = calcIRR(a);
          bv = calcIRR(b);
          break;
        case "best_eps":
          av = a.best_eps || 0;
          bv = b.best_eps || 0;
          break;
        case "eps_growth":
          av = a.eps_lt_growth || 0;
          bv = b.eps_lt_growth || 0;
          break;
        case "ytw":
          av = a.yield_to_worst || 0;
          bv = b.yield_to_worst || 0;
          break;
        case "duration":
          av = a.duration || 0;
          bv = b.duration || 0;
          break;
        case "rating":
          av = a.rating || '';
          bv = b.rating || '';
          break;
        case "total_pnl":
          av = a.unrealized_pl_pct;
          bv = b.unrealized_pl_pct;
          break;
      }
      if (av < bv) return sortCfg.dir === "asc" ? -1 : 1;
      if (av > bv) return sortCfg.dir === "asc" ? 1 : -1;
      return 0;
    });
  };

  const SortIcon = ({ k }: { k: string }) => {
    if (!sortCfg || sortCfg.key !== k)
      return <ArrowUpDown className="w-3 h-3 ml-1 opacity-0 group-hover:opacity-100 transition-opacity" />;
    return sortCfg.dir === "asc" ? (
      <ChevronUp className="w-3 h-3 ml-1 text-blue-500" />
    ) : (
      <ChevronDown className="w-3 h-3 ml-1 text-blue-500" />
    );
  };

  // ─── Sector exposure data ──────────────────────────────────────────
  const sectorData = useMemo(() => {
    const vals: Record<string, number> = {};
    equities.forEach((h) => {
      const rawTicker = (h.ticker || "").toUpperCase();
      // Bloomberg exports often format equities as "SPY US Equity". We just want the base ticker.
      const ticker = rawTicker.split(/[\s.\/]+/)[0].trim();
      const val = h.current_value;

      // Check if this ticker has a known ETF sector breakdown
      const etfWeights = ETF_SECTOR_WEIGHTS[ticker];
      if (etfWeights) {
        Object.entries(etfWeights).forEach(([sec, w]) => {
          vals[sec] = (vals[sec] || 0) + val * (w / 100);
        });
      } else {
        const sec = h.stock_details?.sector || "Unknown";
        vals[sec] = (vals[sec] || 0) + val;
      }
    });

    const allSecs = new Set([...Object.keys(vals), ...Object.keys(SP500)]);
    return Array.from(allSecs)
      .map((s) => {
        const pw = eqValue > 0 ? ((vals[s] || 0) / eqValue) * 100 : 0;
        const bw = SP500[s] || 0;
        return { sector: s, pw, bw, diff: pw - bw };
      })
      .filter((d) => d.pw > 0 || d.bw > 1)
      .sort((a, b) => b.diff - a.diff);
  }, [equities, eqValue]);
  const maxDiff = Math.max(...sectorData.map((d) => Math.abs(d.diff)), 1);

  // ─── FI scatter data ──────────────────────────────────────────────
  const fiWithData = useMemo(
    () => fixedIncome.filter((h) => h.yield_to_worst && h.duration),
    [fixedIncome]
  );
  const maxDur = Math.max(...fiWithData.map((h) => h.duration || 0), 1);
  const maxYtw = Math.max(...fiWithData.map((h) => (h.yield_to_worst || 0) * 100), 1);
  const maxVal = Math.max(...fiWithData.map((h) => h.current_value), 1);

  // ─── Loading / empty ──────────────────────────────────────────────
  if (loading) {
    return (
      <div className="max-w-6xl mx-auto py-20 text-center text-slate-500">
        <RefreshCcw className="w-8 h-8 animate-spin mx-auto mb-3 text-blue-500" />
        <p className="text-sm font-medium">Loading dashboard…</p>
      </div>
    );
  }

  if (holdings.length === 0) {
    return (
      <div className="max-w-6xl mx-auto py-20 text-center">
        <Briefcase className="w-12 h-12 text-slate-300 mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">No holdings yet</h2>
        <p className="text-sm text-slate-500 mb-6">Upload a portfolio to get started.</p>
        <Link
          href="/portfolio"
          className="inline-flex items-center gap-2 text-white font-semibold py-2.5 px-6 rounded-lg bg-slate-900 dark:bg-blue-600 hover:opacity-90 transition-all"
        >
          <Briefcase className="w-4 h-4" /> Go to Portfolio
        </Link>
      </div>
    );
  }

  // ─── Render ────────────────────────────────────────────────────────
  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* ─── Header ─────────────────────────────────────────────── */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Portfolio Dashboard
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">Real-time overview</p>
        </div>
        <p className="text-xs text-slate-400 font-medium">Last updated: just now</p>
      </div>

      {/* ─── Hero Strip ─────────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] shadow-sm p-6">
        <div className="flex flex-wrap items-center gap-x-10 gap-y-4">
          {/* Total Value */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 mb-1">
              Total Value
            </p>
            <p className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
              ${fmt(totalValue)}
            </p>
          </div>

          {/* 1D P&L */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 mb-1">
              1D P&L
            </p>
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-sm font-bold ${totalDailyPL >= 0
                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
                  : "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400"
                  }`}
              >
                {totalDailyPL >= 0 ? (
                  <TrendingUp className="w-3.5 h-3.5" />
                ) : (
                  <TrendingDown className="w-3.5 h-3.5" />
                )}
                {totalDailyPL >= 0 ? "+" : ""}${fmt(totalDailyPL)}
                <span className="font-medium opacity-70 ml-0.5">
                  ({totalDailyPLPct >= 0 ? "+" : ""}{totalDailyPLPct.toFixed(2)}%)
                </span>
              </span>
            </div>
          </div>

          {/* Divider */}
          <div className="hidden sm:block h-10 w-px bg-slate-200 dark:bg-slate-700" />

          {/* Equity weight */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 mb-1">
              Equities
            </p>
            <p className="text-lg font-bold text-blue-600 dark:text-blue-400">{eqPct}%</p>
          </div>

          {/* FI weight */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 mb-1">
              Fixed Income
            </p>
            <p className="text-lg font-bold text-teal-600 dark:text-teal-400">{fiPct}%</p>
          </div>

          {/* Positions */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 mb-1">
              Positions
            </p>
            <p className="text-lg font-bold text-slate-900 dark:text-white">{holdings.length}</p>
          </div>
        </div>
      </div>

      {/* ─── Tab Switcher ───────────────────────────────────────── */}
      <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl w-fit">
        {(["equities", "fi"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`px-5 py-2 text-sm font-semibold rounded-lg transition-all ${activeTab === t
              ? "bg-white dark:bg-[#111827] text-slate-900 dark:text-white shadow-sm"
              : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              }`}
          >
            {t === "equities" ? `Equities (${equities.length})` : `Fixed Income (${fixedIncome.length})`}
          </button>
        ))}
      </div>

      {/* ─── EQUITIES TAB ─────────────────────────────────────── */}
      {activeTab === "equities" && (
        <div className="space-y-6">

          {/* ── Equity PnL + Top/Bottom 3 ─────────────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

            {/* Equity PnL do Dia */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] shadow-sm p-5 flex flex-col justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 mb-3">
                PnL do Dia — Equities
              </p>
              <div>
                <p className={`text-2xl font-bold tabular-nums ${eqDailyPL >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                  {eqDailyPL >= 0 ? "+" : ""}${fmt(eqDailyPL)}
                </p>
                <p className={`text-sm font-semibold mt-1 ${eqDailyPLPct >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                  {eqDailyPLPct >= 0 ? "+" : ""}{eqDailyPLPct.toFixed(2)}%
                </p>
              </div>
            </div>

            {/* Top 3 */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] shadow-sm p-5">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 mb-3">
                Top 3 do Dia
              </p>
              <div className="space-y-2.5">
                {top3.length === 0 && <p className="text-xs text-slate-400">Sem dados</p>}
                {top3.map((h) => (
                  <div key={h.id} className="flex items-center justify-between">
                    <div>
                      <span className="text-sm font-bold text-slate-800 dark:text-white">{h.ticker ?? h.isin}</span>
                      {h.chg_pct_1d != null && (
                        <span className="ml-2 text-xs font-semibold text-emerald-500">
                          +{h.chg_pct_1d.toFixed(2)}%
                        </span>
                      )}
                    </div>
                    <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
                      +${fmt(h.pnl_1d!)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Bottom 3 */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] shadow-sm p-5">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 mb-3">
                Bottom 3 do Dia
              </p>
              <div className="space-y-2.5">
                {bottom3.length === 0 && <p className="text-xs text-slate-400">Sem dados</p>}
                {bottom3.map((h) => (
                  <div key={h.id} className="flex items-center justify-between">
                    <div>
                      <span className="text-sm font-bold text-slate-800 dark:text-white">{h.ticker ?? h.isin}</span>
                      {h.chg_pct_1d != null && (
                        <span className="ml-2 text-xs font-semibold text-rose-500">
                          {h.chg_pct_1d.toFixed(2)}%
                        </span>
                      )}
                    </div>
                    <span className="text-sm font-semibold text-rose-600 dark:text-rose-400 tabular-nums">
                      ${fmt(h.pnl_1d!)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Equities table */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    {[
                      ["ticker", "Ticker"],
                      ["qty", "Qty"],
                      ["price", "Price"],
                      ["current_value", "Mkt Value"],
                      ["chg_1d", "1D %"],
                      ["pnl_1d", "1D PnL"],
                      ["total_pnl", "Total PnL %"],
                      ["pe", "NTM P/E"],
                      ["eps_growth", "EPS Growth"],
                      ["tgt_pe", "Tgt P/E"],
                      ["tgt_eps", "Tgt EPS"],
                      ["irr", "5Y IRR"],
                    ].map(([k, label]) => (
                      <th
                        key={k}
                        onClick={() => toggleSort(k)}
                        className={`px-4 py-3 cursor-pointer group ${k !== "ticker" ? "text-right" : ""
                          } ${["tgt_pe", "tgt_eps", "irr"].includes(k) ? "bg-violet-50/30 dark:bg-violet-900/10" : ""}`}
                      >
                        <span className="inline-flex items-center">
                          {label}
                          <SortIcon k={k} />
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {sorted(equities).map((item) => {
                    const irr = calcIRR(item);
                    return (
                      <tr
                        key={item.id}
                        className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer"
                        onClick={() =>
                          item.stock_details &&
                          router.push(`/stock/${item.stock_details.ticker}`)
                        }
                      >
                        <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">
                          <div>{item.ticker || item.isin}</div>
                          <div className="text-xs text-slate-500 font-normal truncate max-w-[140px]">
                            {item.stock_details?.company_name}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-400 font-medium">
                          {item.quantity.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-slate-900 dark:text-white">
                          ${item.price?.toFixed(2) || "—"}
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-slate-900 dark:text-white">
                          ${item.current_value.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </td>
                        <td
                          className={`px-4 py-3 text-right font-medium ${(item.chg_pct_1d || 0) >= 0 ? "text-emerald-600" : "text-rose-600"
                            }`}
                        >
                          {(item.chg_pct_1d || 0) > 0 ? "+" : ""}
                          {(item.chg_pct_1d || 0).toFixed(2)}%
                        </td>
                        <td
                          className={`px-4 py-3 text-right font-medium ${(item.pnl_1d || 0) >= 0 ? "text-emerald-600" : "text-rose-600"
                            }`}
                        >
                          {(item.pnl_1d || 0) > 0 ? "+" : ""}
                          {Math.round(item.pnl_1d || 0).toLocaleString()}
                        </td>
                        <td
                          className={`px-4 py-3 text-right font-bold ${item.unrealized_pl_pct >= 0 ? "text-emerald-600" : "text-rose-600"
                            }`}
                        >
                          {item.average_cost > 0
                            ? `${item.unrealized_pl_pct > 0 ? "+" : ""}${item.unrealized_pl_pct.toFixed(1)}%`
                            : "—"}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-900 dark:text-white font-medium">
                          {item.pe_next_12_months ? `${item.pe_next_12_months.toFixed(1)}x` : "—"}
                        </td>
                        <td className={`px-4 py-3 text-right font-medium ${(item.eps_lt_growth || 0) >= 15 ? "text-emerald-600" : "text-slate-700 dark:text-slate-300"
                          }`}>
                          {item.eps_lt_growth ? `${item.eps_lt_growth.toFixed(1)}%` : "—"}
                        </td>
                        <td className="px-4 py-3 text-right text-violet-700 dark:text-violet-400 bg-violet-50/10">
                          {item.stock_details?.consensus_target_pe
                            ? `${item.stock_details.consensus_target_pe.toFixed(1)}x`
                            : "—"}
                        </td>
                        <td className="px-4 py-3 text-right text-violet-700 dark:text-violet-400 bg-violet-50/10">
                          {item.stock_details?.consensus_target_eps
                            ? `$${item.stock_details.consensus_target_eps.toFixed(2)}`
                            : "—"}
                        </td>
                        <td
                          className={`px-4 py-3 text-right font-bold bg-violet-50/10 ${irr >= 15
                            ? "text-emerald-600"
                            : "text-slate-900 dark:text-white"
                            }`}
                        >
                          {irr > 0 ? `${irr.toFixed(1)}%` : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Sector Exposure vs S&P 500 */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-6 bg-white dark:bg-[#111827] shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Sector Exposure vs. S&P 500
              </h2>
              <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
                {(["diff", "pies", "table"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setExposureTab(t)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${exposureTab === t
                      ? "bg-white dark:bg-[#111827] text-slate-900 dark:text-white shadow-sm"
                      : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                      }`}
                  >
                    {t === "diff" ? "Difference" : t === "pies" ? "Pie Charts" : "Data Table"}
                  </button>
                ))}
              </div>
            </div>

            {exposureTab === "diff" && (
              <>
                <div className="flex items-center justify-end mb-4">
                  <div className="flex items-center gap-4 text-[11px] font-bold text-slate-400">
                    <span>← Underweight</span>
                    <span>Overweight →</span>
                  </div>
                </div>
                <div className="space-y-2">
                  {sectorData.map((d) => {
                    const barW = (Math.abs(d.diff) / maxDiff) * 50;
                    const over = d.diff >= 0;
                    return (
                      <div key={d.sector} className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-slate-500 w-40 text-right truncate shrink-0">
                          {d.sector}
                        </span>
                        <div className="flex-1 flex items-center h-6 relative bg-slate-50 dark:bg-slate-800/20 rounded-sm">
                          <div className="absolute left-1/2 top-0 bottom-0 w-px bg-slate-200 dark:bg-slate-700 z-10" />
                          {!over && (
                            <div
                              className="absolute right-1/2 h-5 rounded-l-sm bg-rose-500 transition-all"
                              style={{ width: `${barW}%` }}
                            />
                          )}
                          {over && (
                            <div
                              className="absolute left-1/2 h-5 rounded-r-sm bg-emerald-500 transition-all"
                              style={{ width: `${barW}%` }}
                            />
                          )}
                        </div>
                        <span
                          className={`text-xs font-bold w-16 text-right shrink-0 ${d.diff > 0.5
                            ? "text-emerald-600 dark:text-emerald-400"
                            : d.diff < -0.5
                              ? "text-rose-600 dark:text-rose-400"
                              : "text-slate-500"
                            }`}
                        >
                          {d.diff > 0 ? "+" : ""}
                          {d.diff.toFixed(1)}%
                        </span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {exposureTab === "pies" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
                <div className="flex flex-col items-center">
                  <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Your Portfolio</h3>
                  <div className="w-full h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={sectorData.filter(d => d.pw > 0).map(d => ({ name: d.sector, value: d.pw }))}
                          cx="50%" cy="50%" innerRadius={60} outerRadius={100} dataKey="value" stroke="none"
                        >
                          {sectorData.filter(d => d.pw > 0).map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                        <RechartsTooltip formatter={(val: any) => `${Number(val).toFixed(1)}%`} />
                        <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div className="flex flex-col items-center">
                  <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">S&P 500</h3>
                  <div className="w-full h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={sectorData.filter(d => d.bw > 0).map(d => ({ name: d.sector, value: d.bw }))}
                          cx="50%" cy="50%" innerRadius={60} outerRadius={100} dataKey="value" stroke="none"
                        >
                          {sectorData.filter(d => d.bw > 0).map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                        <RechartsTooltip formatter={(val: any) => `${Number(val).toFixed(1)}%`} />
                        <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            )}

            {exposureTab === "table" && (
              <div className="rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                    <tr className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      <th className="px-4 py-3">Sector</th>
                      <th className="px-4 py-3 text-right">Portfolio weight</th>
                      <th className="px-4 py-3 text-right">S&P 500 weight</th>
                      <th className="px-4 py-3 text-right">Active weight</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {sectorData.map((d) => (
                      <tr key={d.sector} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                        <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">{d.sector}</td>
                        <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-300">{d.pw.toFixed(2)}%</td>
                        <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-300">{d.bw.toFixed(2)}%</td>
                        <td className={`px-4 py-3 text-right font-bold ${d.diff > 0 ? "text-emerald-600" : d.diff < 0 ? "text-rose-600" : "text-slate-500"
                          }`}>
                          {d.diff > 0 ? "+" : ""}{d.diff.toFixed(2)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── FIXED INCOME TAB ─────────────────────────────────── */}
      {activeTab === "fi" && (() => {
        const wAvgYtw = fiValue > 0
          ? fixedIncome.reduce((s, h) => s + (h.yield_to_worst || 0) * h.current_value, 0) / fiValue * 100
          : 0;
        const wAvgDur = fiValue > 0
          ? fixedIncome.reduce((s, h) => s + (h.duration || 0) * h.current_value, 0) / fiValue
          : 0;
        const fiDailyPL = fixedIncome.reduce((s, h) => s + (h.pnl_1d || 0), 0);
        return (
          <div className="space-y-6">
            {/* FI Key Stats */}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] shadow-sm p-6">
              <div className="flex flex-wrap items-center gap-x-10 gap-y-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 mb-1">FI Market Value</p>
                  <p className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">${fmt(fiValue)}</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 mb-1">1D P&L</p>
                  <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-sm font-bold ${fiDailyPL >= 0
                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
                    : "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400"}`}>
                    {fiDailyPL >= 0 ? "+" : ""}${fmt(fiDailyPL)}
                  </span>
                </div>
                <div className="hidden sm:block h-10 w-px bg-slate-200 dark:bg-slate-700" />
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 mb-1">Wtd Avg YTW</p>
                  <p className="text-xl font-bold text-amber-600 dark:text-amber-400">{wAvgYtw.toFixed(2)}%</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 mb-1">Wtd Avg Duration</p>
                  <p className="text-xl font-bold text-amber-600 dark:text-amber-400">{wAvgDur.toFixed(2)}y</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 mb-1">Positions</p>
                  <p className="text-xl font-bold text-slate-900 dark:text-white">{fixedIncome.length}</p>
                </div>
              </div>
            </div>

            {/* Yield × Duration Scatter */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-6 bg-white dark:bg-[#111827] shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  Yield to Worst × Duration
                </h2>
                {/* Legend */}
                <div className="flex items-center gap-4 text-xs font-medium text-slate-500">
                  {[
                    ["Corporate", "#14b8a6"],
                    ["Index / ETF", "#8b5cf6"],
                    ["EM Sovereign", "#f97316"],
                    ["Treasury", "#f43f5e"],
                    ["Other", "#64748b"],
                  ].map(([l, c]) => (
                    <span key={l} className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ background: c }} />
                      {l}
                    </span>
                  ))}
                </div>
              </div>
              <p className="text-xs text-slate-400 mb-4">
                Bubble size = market value. Hover for details.
              </p>

              {fiWithData.length === 0 ? (
                <p className="text-center text-slate-400 py-10">No FI positions with yield & duration data.</p>
              ) : (
                <div className="relative">
                  <svg
                    viewBox="0 0 600 350"
                    className="w-full"
                    style={{ maxHeight: 400 }}
                  >
                    {/* Grid lines */}
                    {[0, 0.25, 0.5, 0.75, 1].map((f) => (
                      <g key={`g-${f}`}>
                        {/* Horizontal */}
                        <line
                          x1={60}
                          y1={20 + f * 280}
                          x2={580}
                          y2={20 + f * 280}
                          stroke="currentColor"
                          className="text-slate-200 dark:text-slate-700"
                          strokeWidth={0.5}
                        />
                        {/* Y label */}
                        <text
                          x={55}
                          y={20 + f * 280 + 4}
                          textAnchor="end"
                          className="fill-slate-400 text-[10px]"
                        >
                          {(maxYtw * (1 - f)).toFixed(1)}%
                        </text>
                        {/* Vertical */}
                        <line
                          x1={60 + f * 520}
                          y1={20}
                          x2={60 + f * 520}
                          y2={300}
                          stroke="currentColor"
                          className="text-slate-200 dark:text-slate-700"
                          strokeWidth={0.5}
                        />
                        {/* X label */}
                        <text
                          x={60 + f * 520}
                          y={318}
                          textAnchor="middle"
                          className="fill-slate-400 text-[10px]"
                        >
                          {(maxDur * f).toFixed(1)}y
                        </text>
                      </g>
                    ))}

                    {/* Axis labels */}
                    <text x={320} y={340} textAnchor="middle" className="fill-slate-500 text-[11px] font-semibold">
                      Duration (years)
                    </text>
                    <text
                      x={12}
                      y={160}
                      textAnchor="middle"
                      className="fill-slate-500 text-[11px] font-semibold"
                      transform="rotate(-90, 12, 160)"
                    >
                      YTW (%)
                    </text>

                    {/* Data dots */}
                    {fiWithData.map((h) => {
                      const cx = 60 + ((h.duration || 0) / maxDur) * 520;
                      const cy = 300 - (((h.yield_to_worst || 0) * 100) / maxYtw) * 280;
                      const r = Math.max(6, Math.min(30, Math.sqrt(h.current_value / maxVal) * 30));
                      const color = fiColor(h);
                      return (
                        <circle
                          key={h.id}
                          cx={cx}
                          cy={cy}
                          r={r}
                          fill={color}
                          fillOpacity={hoveredDot?.id === h.id ? 0.9 : 0.55}
                          stroke={color}
                          strokeWidth={hoveredDot?.id === h.id ? 2 : 1}
                          className="transition-all duration-150 cursor-pointer"
                          onMouseEnter={() => setHoveredDot(h)}
                          onMouseLeave={() => setHoveredDot(null)}
                        />
                      );
                    })}
                  </svg>

                  {/* Tooltip */}
                  {hoveredDot && (
                    <div className="absolute top-4 right-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg px-4 py-3 text-sm pointer-events-none z-20">
                      <p className="font-bold text-slate-900 dark:text-white mb-1">
                        {hoveredDot.ticker || hoveredDot.isin || "Unknown"}
                      </p>
                      <p className="text-slate-500 text-xs mb-2">{hoveredDot.specific_type}</p>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                        <span className="text-slate-400">YTW</span>
                        <span className="font-semibold text-slate-900 dark:text-white">
                          {((hoveredDot.yield_to_worst || 0) * 100).toFixed(2)}%
                        </span>
                        <span className="text-slate-400">Duration</span>
                        <span className="font-semibold text-slate-900 dark:text-white">
                          {hoveredDot.duration?.toFixed(2)}y
                        </span>
                        <span className="text-slate-400">Mkt Value</span>
                        <span className="font-semibold text-slate-900 dark:text-white">
                          ${fmt(hoveredDot.current_value)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* FI Summary Table */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      {[
                        ["ticker", "Identifier"],
                        ["current_value", "Mkt Value"],
                        ["chg_1d", "1D %"],
                        ["pnl_1d", "1D PnL"],
                        ["total_pnl", "Total PnL %"],
                        ["rating", "Rating"],
                        ["ytw", "YTW"],
                        ["duration", "Duration"],
                      ].map(([k, label]) => (
                        <th
                          key={k}
                          onClick={() => toggleSort(k)}
                          className={`px-4 py-3 cursor-pointer group ${k !== "ticker" ? "text-right" : ""} ${["ytw", "duration", "rating"].includes(k) ? "bg-amber-50/30 dark:bg-amber-900/10" : ""
                            }`}
                        >
                          <span className="inline-flex items-center">
                            {label}
                            <SortIcon k={k} />
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {sorted(fixedIncome).map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                        <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white max-w-[220px] truncate">
                          {item.ticker ? item.ticker.replace("Corp", "").replace("@", " ") : item.isin}
                          <div className="text-xs text-slate-500 font-normal">{item.specific_type}</div>
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-slate-900 dark:text-white">
                          ${item.current_value.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </td>
                        <td
                          className={`px-4 py-3 text-right font-medium ${(item.chg_pct_1d || 0) >= 0 ? "text-emerald-600" : "text-rose-600"
                            }`}
                        >
                          {(item.chg_pct_1d || 0) > 0 ? "+" : ""}
                          {(item.chg_pct_1d || 0).toFixed(2)}%
                        </td>
                        <td
                          className={`px-4 py-3 text-right font-medium ${(item.pnl_1d || 0) >= 0 ? "text-emerald-600" : "text-rose-600"
                            }`}
                        >
                          {(item.pnl_1d || 0) > 0 ? "+" : ""}
                          {Math.round(item.pnl_1d || 0).toLocaleString()}
                        </td>
                        <td
                          className={`px-4 py-3 text-right font-bold ${item.unrealized_pl_pct >= 0 ? "text-emerald-600" : "text-rose-600"
                            }`}
                        >
                          {item.average_cost > 0
                            ? `${item.unrealized_pl_pct > 0 ? "+" : ""}${item.unrealized_pl_pct.toFixed(1)}%`
                            : "—"}
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-amber-700 dark:text-amber-400 bg-amber-50/10">
                          {item.rating || "—"}
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-amber-700 dark:text-amber-400 bg-amber-50/10">
                          {item.yield_to_worst ? `${(item.yield_to_worst * 100).toFixed(2)}%` : "—"}
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-amber-700 dark:text-amber-400 bg-amber-50/10">
                          {item.duration ? `${item.duration.toFixed(2)}y` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

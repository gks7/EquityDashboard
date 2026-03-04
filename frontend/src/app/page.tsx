"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  BarChart3,
  Briefcase,
  RefreshCcw,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";

interface PortfolioHolding {
  id: number;
  quantity: number;
  average_cost: number;
  total_cost: number;
  current_value: number;
  unrealized_pl: number;
  unrealized_pl_pct: number;
  stock_details?: {
    ticker: string;
    company_name: string;
    current_price: number;
    previous_close: number | null;
    sector: string;
  };
}

export default function DashboardPage() {
  const router = useRouter();
  const [holdings, setHoldings] = useState<PortfolioHolding[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPortfolio = async () => {
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/portfolio/`);
        const data = await res.json();
        setHoldings(data);
      } catch (error) {
        console.error("Failed to fetch portfolio:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchPortfolio();
  }, []);

  // Aggregate stats
  const totalValue = holdings.reduce((sum, h) => sum + h.current_value, 0);
  const totalCost = holdings.reduce((sum, h) => sum + h.total_cost, 0);
  const totalPL = totalValue - totalCost;
  const totalPLPct = totalCost > 0 ? (totalPL / totalCost) * 100 : 0;

  // Daily P&L calculations
  const getDailyChange = (h: PortfolioHolding) => {
    const prevClose = h.stock_details?.previous_close;
    const curPrice = h.stock_details?.current_price;
    if (!prevClose || !curPrice) return { dailyPL: 0, dailyPLPct: 0 };
    const dailyPLPct = ((curPrice - prevClose) / prevClose) * 100;
    const dailyPL = (curPrice - prevClose) * h.quantity;
    return { dailyPL, dailyPLPct };
  };

  const totalDailyPL = holdings.reduce((sum, h) => sum + getDailyChange(h).dailyPL, 0);
  const prevDayValue = holdings.reduce((sum, h) => {
    const prev = h.stock_details?.previous_close || h.stock_details?.current_price;
    if (!prev) return sum;
    return sum + (prev * h.quantity);
  }, 0);
  const totalDailyPLPct = prevDayValue > 0 ? (totalDailyPL / prevDayValue) * 100 : 0;

  // Sorted by daily change % for top/bottom (only equites that have details)
  const sortedByDaily = [...holdings]
    .filter(h => h.stock_details !== null)
    .sort((a, b) => getDailyChange(b).dailyPLPct - getDailyChange(a).dailyPLPct);
  const top3 = sortedByDaily.slice(0, 3);
  const bottom3 = sortedByDaily.slice(-3).reverse();

  // Sorted by total P&L for the holdings table
  const sortedByTotal = [...holdings].sort((a, b) => b.unrealized_pl_pct - a.unrealized_pl_pct);

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto py-20 text-center text-slate-500">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl mb-4" style={{ background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)' }}>
          <RefreshCcw className="w-6 h-6 animate-spin text-white" />
        </div>
        <p className="text-sm font-medium text-slate-400">Loading dashboard...</p>
      </div>
    );
  }

  const emptyState = holdings.length === 0;

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Portfolio Dashboard
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Real-time overview of your current holdings.
          </p>
        </div>
        <p className="text-xs text-slate-500 font-medium">Last updated: just now</p>
      </div>

      {emptyState ? (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-12 text-center bg-white dark:bg-[#111827] shadow-sm">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-5 bg-blue-50 dark:bg-blue-500/10">
            <Briefcase className="w-8 h-8 text-blue-600 dark:text-blue-400" />
          </div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">No holdings yet</h2>
          <p className="text-sm text-slate-500 mb-6">Add stocks to your portfolio to see your dashboard.</p>
          <Link
            href="/portfolio"
            className="inline-flex items-center gap-2 text-white font-semibold py-2.5 px-6 rounded-lg shadow-sm transition-all hover:opacity-90 bg-slate-900 dark:bg-blue-600"
          >
            <Briefcase className="w-4 h-4" />
            Go to Portfolio
          </Link>
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            <SummaryCard
              label="Total Value"
              value={`$${formatNumber(totalValue)}`}
              icon={<DollarSign className="w-5 h-5" />}
              color="blue"
            />
            <SummaryCard
              label="Total Cost"
              value={`$${formatNumber(totalCost)}`}
              icon={<Briefcase className="w-5 h-5" />}
              color="slate"
            />
            <SummaryCard
              label="Daily P&L"
              value={`${totalDailyPL >= 0 ? "+" : ""}$${formatNumber(totalDailyPL)}`}
              subtitle={`${totalDailyPLPct >= 0 ? "+" : ""}${totalDailyPLPct.toFixed(2)}%`}
              icon={totalDailyPL >= 0 ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
              color={totalDailyPL >= 0 ? "emerald" : "rose"}
            />
            <SummaryCard
              label="Holdings"
              value={String(holdings.length)}
              icon={<BarChart3 className="w-5 h-5" />}
              color="violet"
            />
          </div>

          {/* Top 3 / Bottom 3 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Top 3 */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-6 bg-white dark:bg-[#111827] shadow-sm transition-all">
              <h2 className="text-base font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                <ArrowUpRight className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                Top Performers
              </h2>
              <div className="space-y-3">
                {top3.map((h, i) => {
                  const daily = getDailyChange(h);
                  return (
                    <PerformerRow
                      key={h.id}
                      rank={i + 1}
                      ticker={h.stock_details?.ticker || ''}
                      name={h.stock_details?.company_name || ''}
                      plPct={daily.dailyPLPct}
                      pl={daily.dailyPL}
                      isPositive={daily.dailyPLPct >= 0}
                      onClick={() => router.push(`/stock/${h.stock_details?.ticker || ''}`)}
                    />
                  );
                })}
              </div>
            </div>

            {/* Bottom 3 */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-6 bg-white dark:bg-[#111827] shadow-sm transition-all">
              <h2 className="text-base font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                <ArrowDownRight className="w-5 h-5 text-rose-600 dark:text-rose-400" />
                Bottom Performers
              </h2>
              <div className="space-y-3">
                {bottom3.map((h, i) => {
                  const daily = getDailyChange(h);
                  return (
                    <PerformerRow
                      key={h.id}
                      rank={holdings.filter(h => h.stock_details).length - i}
                      ticker={h.stock_details?.ticker || ''}
                      name={h.stock_details?.company_name || ''}
                      plPct={daily.dailyPLPct}
                      pl={daily.dailyPL}
                      isPositive={daily.dailyPLPct >= 0}
                      onClick={() => router.push(`/stock/${h.stock_details?.ticker || ''}`)}
                    />
                  );
                })}
              </div>
            </div>
          </div>

          {/* Sector Exposure Chart */}
          <SectorExposureChart holdings={holdings} totalValue={totalValue} />

          {/* Full Holdings Table */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-white dark:bg-[#111827] shadow-sm transition-all">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">All Holdings</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-slate-500 font-medium bg-slate-50/50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="px-6 py-3">Company</th>
                    <th className="px-6 py-3 text-right">Qty</th>
                    <th className="px-6 py-3 text-right">Avg Cost</th>
                    <th className="px-6 py-3 text-right">Price</th>
                    <th className="px-6 py-3 text-right">Value</th>
                    <th className="px-6 py-3 text-right">P&L</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {sortedByTotal.map((h) => (
                    <tr
                      key={h.id}
                      onClick={() => h.stock_details?.ticker ? router.push(`/stock/${h.stock_details.ticker}`) : undefined}
                      className={`transition-colors ${h.stock_details?.ticker ? 'hover:bg-slate-50 dark:hover:bg-white/[0.02] cursor-pointer' : ''}`}
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-blue-600 dark:text-blue-400 text-xs uppercase shrink-0 bg-blue-50 dark:bg-blue-500/10">
                            {(h.stock_details?.ticker || "FI").slice(0, 2)}
                          </div>
                          <div>
                            <div className="font-semibold text-slate-900 dark:text-white">
                              {h.stock_details?.ticker || "Fixed Income Asset"}
                            </div>
                            <div className="text-xs text-slate-500 truncate max-w-[140px]">
                              {h.stock_details?.company_name || "Bond Collection"}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right text-slate-600 dark:text-slate-400 font-medium">
                        {h.quantity.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-right text-slate-600 dark:text-slate-400">
                        ${h.average_cost.toFixed(2)}
                      </td>
                      <td className="px-6 py-4 text-right font-medium text-slate-900 dark:text-white">
                        ${h.stock_details?.current_price?.toFixed(2) || "—"}
                      </td>
                      <td className="px-6 py-4 text-right font-medium text-slate-900 dark:text-white">
                        ${formatNumber(h.current_value)}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className={`flex flex-col items-end ${h.unrealized_pl >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                          <span className="font-semibold">
                            {h.unrealized_pl >= 0 ? "+" : ""}${formatNumber(h.unrealized_pl)}
                          </span>
                          <span className="text-xs">
                            {h.unrealized_pl_pct >= 0 ? "+" : ""}{h.unrealized_pl_pct.toFixed(2)}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// --- Helper Components ---

function SummaryCard({
  label,
  value,
  subtitle,
  icon,
  color,
}: {
  label: string;
  value: string;
  subtitle?: string;
  icon: React.ReactNode;
  color: "blue" | "slate" | "emerald" | "rose" | "violet";
}) {
  const iconColorMap = {
    blue: "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10",
    slate: "text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800",
    emerald: "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10",
    rose: "text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/10",
    violet: "text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-500/10",
  };

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-5 bg-white dark:bg-[#111827] shadow-sm transition-all">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          {label}
        </span>
        <div className={`p-2 rounded-lg ${iconColorMap[color]}`}>{icon}</div>
      </div>
      <div className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{value}</div>
      {subtitle && (
        <span className={`text-sm font-semibold mt-1 block ${color === "emerald" ? "text-emerald-600 dark:text-emerald-400" : color === "rose" ? "text-rose-600 dark:text-rose-400" : "text-slate-500"}`}>
          {subtitle}
        </span>
      )}
    </div>
  );
}

function PerformerRow({
  rank,
  ticker,
  name,
  plPct,
  pl,
  isPositive,
  onClick,
}: {
  rank: number;
  ticker: string;
  name: string;
  plPct: number;
  pl: number;
  isPositive: boolean;
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className="flex items-center justify-between p-3 rounded-lg border border-slate-100 dark:border-slate-800/60 bg-slate-50 dark:bg-slate-800/30 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer group"
    >
      <div className="flex items-center gap-3">
        <div className="w-6 h-6 rounded flex items-center justify-center text-xs font-bold text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-900 shadow-sm border border-slate-200 dark:border-slate-700 group-hover:border-slate-300 dark:group-hover:border-slate-600 transition-colors">
          {rank}
        </div>
        <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-blue-600 dark:text-blue-400 text-xs uppercase bg-blue-50 dark:bg-blue-500/10">
          {ticker[0]}
        </div>
        <div>
          <div className="font-semibold text-sm text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">{ticker}</div>
          <div className="text-xs text-slate-500 truncate max-w-[120px]">{name}</div>
        </div>
      </div>
      <div className={`text-right ${isPositive ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
        <div className="font-bold text-sm">
          {plPct >= 0 ? "+" : ""}{plPct.toFixed(2)}%
        </div>
        <div className="text-xs font-medium opacity-80 mt-0.5">
          {pl >= 0 ? "+" : ""}${formatNumber(Math.abs(pl))}
        </div>
      </div>
    </div>
  );
}

function SectorExposureChart({
  holdings,
  totalValue,
}: {
  holdings: PortfolioHolding[];
  totalValue: number;
}) {
  // S&P 500 GICS sector weights (Feb 2026)
  const sp500Weights: Record<string, number> = {
    "Technology": 32.1,
    "Financial Services": 12.6,
    "Communication Services": 11.2,
    "Consumer Cyclical": 10.5,
    "Healthcare": 9.4,
    "Industrials": 8.8,
    "Consumer Defensive": 5.9,
    "Energy": 3.3,
    "Utilities": 2.4,
    "Basic Materials": 2.0,
    "Real Estate": 1.9,
  };

  // Calculate portfolio sector weights
  const sectorValues: Record<string, number> = {};
  holdings.forEach((h) => {
    const sector = h.stock_details?.sector || "Fixed Income";
    sectorValues[sector] = (sectorValues[sector] || 0) + h.current_value;
  });

  // Combine all sectors
  const allSectors = new Set([
    ...Object.keys(sectorValues),
    ...Object.keys(sp500Weights),
  ]);

  const sectorData = Array.from(allSectors)
    .map((sector) => {
      const portfolioWeight =
        totalValue > 0 ? ((sectorValues[sector] || 0) / totalValue) * 100 : 0;
      const benchmarkWeight = sp500Weights[sector] || 0;
      const diff = portfolioWeight - benchmarkWeight;
      return { sector, portfolioWeight, benchmarkWeight, diff };
    })
    .filter((d) => d.portfolioWeight > 0 || d.benchmarkWeight > 1)
    .sort((a, b) => b.diff - a.diff);

  const maxAbsDiff = Math.max(...sectorData.map((d) => Math.abs(d.diff)), 1);

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-6 bg-white dark:bg-[#111827] shadow-sm transition-all">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-base font-bold text-slate-900 dark:text-white">
          Sector Exposure vs. S&P 500
        </h2>
        <div className="flex items-center gap-4 text-[11px] font-bold text-slate-500">
          <span>← Underweight</span>
          <span>Overweight →</span>
        </div>
      </div>

      <div className="space-y-2.5">
        {sectorData.map((d) => {
          const barWidth = (Math.abs(d.diff) / maxAbsDiff) * 50;
          const isOver = d.diff >= 0;

          return (
            <div key={d.sector} className="flex items-center gap-2 group">
              {/* Sector Label */}
              <span className="text-xs font-semibold text-slate-500 w-40 text-right truncate shrink-0">
                {d.sector}
              </span>

              {/* Diverging Bar */}
              <div className="flex-1 flex items-center h-6 relative bg-slate-50 dark:bg-slate-800/20 rounded-sm">
                {/* Center line */}
                <div className="absolute left-1/2 top-0 bottom-0 w-px bg-slate-200 dark:bg-slate-700 z-10" />

                {/* Underweight (left) */}
                {!isOver && (
                  <div
                    className="absolute right-1/2 h-5 rounded-l-sm bg-rose-500 transition-all duration-500"
                    style={{ width: `${barWidth}%` }}
                  />
                )}

                {/* Overweight (right) */}
                {isOver && (
                  <div
                    className="absolute left-1/2 h-5 rounded-r-sm bg-emerald-500 transition-all duration-500"
                    style={{ width: `${barWidth}%` }}
                  />
                )}
              </div>

              {/* Delta Value */}
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
    </div>
  );
}


function formatNumber(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (abs >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (abs >= 1e3) return (n / 1e3).toFixed(2) + "K";
  return n.toFixed(2);
}

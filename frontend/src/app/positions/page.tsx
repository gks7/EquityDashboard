"use client";

import { useEffect, useState, useMemo } from "react";
import { authFetch } from "@/lib/authFetch";
import {
  Calendar, ChevronDown, ChevronUp, DollarSign, TrendingUp, TrendingDown,
  Layers, Filter, RefreshCw, ArrowUpDown,
} from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/* ---------- Types ---------- */
interface Position {
  id: number;
  date: string;
  fund: string;
  portfolio: string;
  asset_group: string;
  broker: string;
  asset_market: string;
  asset_ticker: string;
  asset: number | null;
  is_leveraged: boolean;
  units_open: number | null;
  units_close: number | null;
  units_transaction: number | null;
  currency: string;
  avg_cost: number | null;
  price_open: number | null;
  price_close: number | null;
  contract_size: number;
  amount_open: number | null;
  amount_close: number | null;
  amount_transaction: number | null;
  pnl_open_position: number | null;
  pnl_transaction: number | null;
  pnl_transaction_fee: number | null;
  pnl_dividend: number | null;
  pnl_lending: number | null;
  pnl_total: number | null;
}

/* ---------- Helpers ---------- */
const fmt = (n: number | null | undefined, decimals = 0) => {
  if (n == null) return "—";
  return n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
};

const fmtPct = (n: number | null | undefined) => {
  if (n == null) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
};

const pnlColor = (n: number | null | undefined) => {
  if (n == null || n === 0) return "text-slate-500";
  return n > 0 ? "text-emerald-500" : "text-red-500";
};

type SortKey = "asset_ticker" | "asset_group" | "units_close" | "amount_close" | "pnl_total" | "pnl_open_position" | "price_close" | "avg_cost" | "currency";
type SortDir = "asc" | "desc";

/* ---------- Component ---------- */
export default function PositionsPage() {
  const [dates, setDates] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [groupFilter, setGroupFilter] = useState<string>("ALL");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("amount_close");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // Fetch available dates
  useEffect(() => {
    (async () => {
      try {
        const res = await authFetch(`${API}/api/bbg/positions/dates/`);
        if (res.ok) {
          const data: string[] = await res.json();
          setDates(data);
          if (data.length > 0 && !selectedDate) setSelectedDate(data[0]); // latest
        }
      } catch (e) { console.error(e); }
    })();
  }, []);

  // Fetch positions for selected date
  useEffect(() => {
    if (!selectedDate) return;
    (async () => {
      setLoading(true);
      try {
        const res = await authFetch(`${API}/api/bbg/positions/?date=${selectedDate}`);
        if (res.ok) setPositions(await res.json());
      } catch (e) { console.error(e); }
      setLoading(false);
    })();
  }, [selectedDate]);

  // Derived data
  const assetGroups = useMemo(() => {
    const groups = new Set(positions.map(p => p.asset_group));
    return ["ALL", ...Array.from(groups).sort()];
  }, [positions]);

  const filtered = useMemo(() => {
    let list = positions;
    if (groupFilter !== "ALL") list = list.filter(p => p.asset_group === groupFilter);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(p =>
        p.asset_ticker.toLowerCase().includes(q) ||
        p.broker.toLowerCase().includes(q) ||
        p.portfolio.toLowerCase().includes(q)
      );
    }
    // Sort
    list = [...list].sort((a, b) => {
      const av = a[sortKey] ?? 0;
      const bv = b[sortKey] ?? 0;
      if (typeof av === "string" && typeof bv === "string") {
        return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      return sortDir === "asc" ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
    return list;
  }, [positions, groupFilter, search, sortKey, sortDir]);

  // Group summary
  const groupSummary = useMemo(() => {
    const groups: Record<string, { count: number; amount: number; pnl: number }> = {};
    for (const p of positions) {
      if (!groups[p.asset_group]) groups[p.asset_group] = { count: 0, amount: 0, pnl: 0 };
      groups[p.asset_group].count++;
      groups[p.asset_group].amount += p.amount_close ?? 0;
      groups[p.asset_group].pnl += p.pnl_total ?? 0;
    }
    return groups;
  }, [positions]);

  // Totals
  const totals = useMemo(() => {
    const t = { amount: 0, pnl: 0, pnlOpen: 0, pnlTx: 0, pnlFee: 0, pnlDiv: 0 };
    for (const p of filtered) {
      t.amount += p.amount_close ?? 0;
      t.pnl += p.pnl_total ?? 0;
      t.pnlOpen += p.pnl_open_position ?? 0;
      t.pnlTx += p.pnl_transaction ?? 0;
      t.pnlFee += p.pnl_transaction_fee ?? 0;
      t.pnlDiv += p.pnl_dividend ?? 0;
    }
    return t;
  }, [filtered]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ArrowUpDown className="w-3 h-3 opacity-30" />;
    return sortDir === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />;
  };

  const toggleGroup = (g: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      next.has(g) ? next.delete(g) : next.add(g);
      return next;
    });
  };

  return (
    <div className="max-w-[1400px] mx-auto px-6 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Portfolio Positions</h1>
          <p className="text-sm text-slate-500 mt-1">
            {positions.length} positions on {selectedDate || "—"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Date picker */}
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <select
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              className="pl-9 pr-4 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white appearance-none cursor-pointer"
            >
              {dates.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4">
          <div className="flex items-center gap-2 mb-1">
            <DollarSign className="w-4 h-4 text-blue-500" />
            <span className="text-xs font-medium text-slate-500">Total NAV</span>
          </div>
          <p className="text-xl font-bold text-slate-900 dark:text-white">${fmt(totals.amount)}</p>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4">
          <div className="flex items-center gap-2 mb-1">
            {totals.pnl >= 0 ? <TrendingUp className="w-4 h-4 text-emerald-500" /> : <TrendingDown className="w-4 h-4 text-red-500" />}
            <span className="text-xs font-medium text-slate-500">Total P&L</span>
          </div>
          <p className={`text-xl font-bold ${pnlColor(totals.pnl)}`}>${fmt(totals.pnl)}</p>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-4 h-4 text-violet-500" />
            <span className="text-xs font-medium text-slate-500">P&L Open</span>
          </div>
          <p className={`text-xl font-bold ${pnlColor(totals.pnlOpen)}`}>${fmt(totals.pnlOpen)}</p>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4">
          <div className="flex items-center gap-2 mb-1">
            <ArrowUpDown className="w-4 h-4 text-amber-500" />
            <span className="text-xs font-medium text-slate-500">P&L Trades</span>
          </div>
          <p className={`text-xl font-bold ${pnlColor(totals.pnlTx)}`}>${fmt(totals.pnlTx)}</p>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4">
          <div className="flex items-center gap-2 mb-1">
            <Layers className="w-4 h-4 text-cyan-500" />
            <span className="text-xs font-medium text-slate-500">Positions</span>
          </div>
          <p className="text-xl font-bold text-slate-900 dark:text-white">{filtered.length}</p>
        </div>
      </div>

      {/* Group Breakdown */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Allocation by Asset Group</h2>
        <div className="space-y-2">
          {Object.entries(groupSummary).sort((a, b) => b[1].amount - a[1].amount).map(([group, data]) => {
            const pct = totals.amount !== 0 ? (data.amount / totals.amount) * 100 : 0;
            return (
              <button
                key={group}
                onClick={() => setGroupFilter(groupFilter === group ? "ALL" : group)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all ${
                  groupFilter === group
                    ? "bg-blue-50 dark:bg-blue-500/10 ring-1 ring-blue-200 dark:ring-blue-800"
                    : "hover:bg-slate-50 dark:hover:bg-slate-800/40"
                }`}
              >
                <span className="w-28 text-left font-medium text-slate-900 dark:text-slate-200">{group}</span>
                <div className="flex-1 bg-slate-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-blue-500 dark:bg-blue-400 transition-all"
                    style={{ width: `${Math.max(pct, 0.5)}%` }}
                  />
                </div>
                <span className="w-16 text-right text-slate-500 text-xs">{pct.toFixed(1)}%</span>
                <span className="w-28 text-right font-medium text-slate-700 dark:text-slate-300">${fmt(data.amount)}</span>
                <span className={`w-24 text-right text-xs font-medium ${pnlColor(data.pnl)}`}>${fmt(data.pnl)}</span>
                <span className="w-8 text-right text-slate-400 text-xs">{data.count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search ticker, broker, portfolio..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-400"
          />
        </div>
        <select
          value={groupFilter}
          onChange={e => setGroupFilter(e.target.value)}
          className="px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
        >
          {assetGroups.map(g => <option key={g} value={g}>{g === "ALL" ? "All Groups" : g}</option>)}
        </select>
        {groupFilter !== "ALL" && (
          <button onClick={() => setGroupFilter("ALL")} className="text-xs text-blue-500 hover:underline">Clear filter</button>
        )}
      </div>

      {/* Positions Table */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <RefreshCw className="w-5 h-5 animate-spin text-blue-500" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
                  {([
                    ["asset_ticker", "Asset", "text-left"],
                    ["asset_group", "Group", "text-left"],
                    ["currency", "Ccy", "text-center"],
                    ["units_close", "Units", "text-right"],
                    ["avg_cost", "Avg Cost", "text-right"],
                    ["price_close", "Price", "text-right"],
                    ["amount_close", "Market Value", "text-right"],
                    ["pnl_open_position", "P&L Open", "text-right"],
                    ["pnl_total", "P&L Total", "text-right"],
                  ] as [SortKey, string, string][]).map(([key, label, align]) => (
                    <th
                      key={key}
                      onClick={() => toggleSort(key)}
                      className={`py-3 px-3 font-medium text-slate-500 ${align} cursor-pointer hover:text-slate-700 dark:hover:text-slate-300 select-none whitespace-nowrap`}
                    >
                      <span className="inline-flex items-center gap-1">
                        {label}
                        <SortIcon col={key} />
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => {
                  const returnPct = (p.price_close && p.avg_cost && p.avg_cost !== 0)
                    ? ((p.price_close - p.avg_cost) / p.avg_cost) * 100
                    : null;
                  return (
                    <tr key={p.id} className="border-b border-slate-100 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                      <td className="py-2.5 px-3 font-medium text-slate-900 dark:text-white whitespace-nowrap">
                        {p.asset_ticker}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          p.asset_group === "Stock" ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300" :
                          p.asset_group === "Fixed Income" ? "bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300" :
                          p.asset_group === "Cash" ? "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400" :
                          p.asset_group === "Index" ? "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300" :
                          "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300"
                        }`}>
                          {p.asset_group}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-center text-slate-500">{p.currency}</td>
                      <td className="py-2.5 px-3 text-right text-slate-700 dark:text-slate-300 tabular-nums">
                        {fmt(p.units_close)}
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-500 tabular-nums">
                        {fmt(p.avg_cost, 2)}
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums">
                        <span className="text-slate-700 dark:text-slate-300">{fmt(p.price_close, 2)}</span>
                        {returnPct != null && (
                          <span className={`ml-1 text-xs ${pnlColor(returnPct)}`}>
                            {fmtPct(returnPct)}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right font-medium text-slate-900 dark:text-white tabular-nums">
                        ${fmt(p.amount_close)}
                      </td>
                      <td className={`py-2.5 px-3 text-right font-medium tabular-nums ${pnlColor(p.pnl_open_position)}`}>
                        ${fmt(p.pnl_open_position)}
                      </td>
                      <td className={`py-2.5 px-3 text-right font-medium tabular-nums ${pnlColor(p.pnl_total)}`}>
                        ${fmt(p.pnl_total)}
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && !loading && (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-slate-500">
                      No positions found.
                    </td>
                  </tr>
                )}
              </tbody>
              {filtered.length > 0 && (
                <tfoot>
                  <tr className="bg-slate-50 dark:bg-slate-800/50 border-t-2 border-slate-300 dark:border-slate-600 font-semibold">
                    <td className="py-3 px-3 text-slate-900 dark:text-white">TOTAL</td>
                    <td className="py-3 px-3"></td>
                    <td className="py-3 px-3"></td>
                    <td className="py-3 px-3"></td>
                    <td className="py-3 px-3"></td>
                    <td className="py-3 px-3"></td>
                    <td className="py-3 px-3 text-right text-slate-900 dark:text-white tabular-nums">
                      ${fmt(totals.amount)}
                    </td>
                    <td className={`py-3 px-3 text-right tabular-nums ${pnlColor(totals.pnlOpen)}`}>
                      ${fmt(totals.pnlOpen)}
                    </td>
                    <td className={`py-3 px-3 text-right tabular-nums ${pnlColor(totals.pnl)}`}>
                      ${fmt(totals.pnl)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

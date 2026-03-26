"use client";

import { useEffect, useState, useCallback, FormEvent } from "react";
import { authFetch } from "@/lib/authFetch";
import Link from "next/link";
import {
  Plus, Trash2, ArrowUpRight, ArrowDownRight, Search,
  AlertTriangle, ChevronDown, ChevronUp, CheckCircle2,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface Asset {
  id: number;
  code_bbg: string;
  name: string;
  asset_group: string;
}

interface Trade {
  id: number;
  fund: string;
  asset: number | null;
  asset_code: string;
  asset_name: string;
  asset_ticker_raw: string;
  side: "buy" | "sell";
  quantity: number;
  price: number;
  clean_price: number | null;
  currency: string;
  trade_date: string;
  scheduled_date: string | null;
  settlement_date: string | null;
  portfolio: string;
  broker: string;
  trader: string;
  fee_per_unit: number | null;
  fee_total: number | null;
  amount: number | null;
  cash_amount: number | null;
  trade_status: string;
  cmd: string;
  notes: string;
  entered_by_name: string | null;
  notional: number;
  weekday: string;
  display_ticker: string;
  created_at: string;
  updated_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300",
  confirmed: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300",
  checked: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300",
  cancelled: "bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400",
};

type SortKey = "trade_date" | "fund" | "portfolio" | "display_ticker" | "quantity" | "price" | "notional" | "trade_status";

export default function TradesPage() {
  const { user } = useAuth();
  const isAdmin = user?.is_staff === true;
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [pendingRequests, setPendingRequests] = useState(0);

  // Filters
  const [fundFilter, setFundFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Sort
  const [sortKey, setSortKey] = useState<SortKey>("trade_date");
  const [sortAsc, setSortAsc] = useState(false);

  // Form state
  const [fund, setFund] = useState("IGFWM TOTAL RETURN");
  const [assetId, setAssetId] = useState<number | null>(null);
  const [assetSearch, setAssetSearch] = useState("");
  const [assetResults, setAssetResults] = useState<Asset[]>([]);
  const [assetNotRegistered, setAssetNotRegistered] = useState(false);
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [cleanPrice, setCleanPrice] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [tradeDate, setTradeDate] = useState(new Date().toISOString().slice(0, 10));
  const [scheduledDate, setScheduledDate] = useState("");
  const [settlementDate, setSettlementDate] = useState("");
  const [portfolio, setPortfolio] = useState("");
  const [portfolioOptions, setPortfolioOptions] = useState<string[]>([]);
  const [broker, setBroker] = useState("");
  const [trader, setTrader] = useState("");
  const [feePerUnit, setFeePerUnit] = useState("");
  const [feeTotalManual, setFeeTotalManual] = useState("");
  const [tradeStatus, setTradeStatus] = useState("pending");
  const [cmd, setCmd] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Computed form values
  const qtyNum = parseFloat(quantity) || 0;
  const priceNum = parseFloat(price) || 0;
  const feePerUnitNum = parseFloat(feePerUnit) || 0;
  const computedAmount = qtyNum * priceNum;
  const computedFeeTotal = feeTotalManual ? parseFloat(feeTotalManual) : feePerUnitNum * qtyNum;
  const computedCashAmount = side === "buy"
    ? -(computedAmount + computedFeeTotal)
    : computedAmount - computedFeeTotal;

  const buildUrl = useCallback(() => {
    const params = new URLSearchParams();
    if (fundFilter) params.set("fund", fundFilter);
    if (statusFilter) params.set("trade_status", statusFilter);
    if (dateFrom) params.set("date_from", dateFrom);
    if (dateTo) params.set("date_to", dateTo);
    const qs = params.toString();
    return `${API}/api/bbg/trades/${qs ? "?" + qs : ""}`;
  }, [fundFilter, statusFilter, dateFrom, dateTo]);

  const fetchTrades = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch(buildUrl());
      if (res.ok) setTrades(await res.json());
    } catch (e) {
      console.error("Failed to fetch trades:", e);
    }
    setLoading(false);
  }, [buildUrl]);

  const fetchPortfolios = async () => {
    try {
      const res = await authFetch(`${API}/api/bbg/trades/portfolios/`);
      if (res.ok) setPortfolioOptions(await res.json());
    } catch {}
  };

  const fetchPendingRequests = async () => {
    try {
      const res = await authFetch(`${API}/api/bbg/asset-requests/?status=pending`);
      if (res.ok) {
        const data = await res.json();
        setPendingRequests(Array.isArray(data) ? data.length : 0);
      }
    } catch {}
  };

  useEffect(() => { fetchTrades(); }, [fetchTrades]);
  useEffect(() => { fetchPortfolios(); fetchPendingRequests(); }, []);

  // Asset search autocomplete
  const searchAssets = async (q: string) => {
    setAssetSearch(q);
    setAssetId(null);
    setAssetNotRegistered(false);
    if (q.length < 2) {
      setAssetResults([]);
      return;
    }
    try {
      const res = await authFetch(`${API}/api/bbg/assets/search/?q=${encodeURIComponent(q)}`);
      if (res.ok) {
        const results = await res.json();
        setAssetResults(results);
        // If user typed something and no results, flag as unregistered
        if (results.length === 0 && q.length >= 3) {
          setAssetNotRegistered(true);
        }
      }
    } catch (e) {
      console.error("Asset search failed:", e);
    }
  };

  const selectAsset = (asset: Asset) => {
    setAssetId(asset.id);
    setAssetSearch(asset.code_bbg + (asset.name ? ` — ${asset.name}` : ""));
    setAssetResults([]);
    setAssetNotRegistered(false);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if ((!assetId && !assetNotRegistered) || !fund || !quantity || !price) return;

    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        fund,
        side,
        quantity: qtyNum,
        price: priceNum,
        currency,
        trade_date: tradeDate,
        settlement_date: settlementDate || null,
        scheduled_date: scheduledDate || null,
        portfolio,
        broker,
        trader,
        clean_price: cleanPrice ? parseFloat(cleanPrice) : null,
        fee_per_unit: feePerUnitNum || null,
        fee_total: computedFeeTotal || null,
        amount: computedAmount || null,
        cash_amount: computedCashAmount || null,
        trade_status: tradeStatus,
        cmd,
        notes,
      };

      if (assetId) {
        body.asset = assetId;
      } else {
        body.asset_ticker_raw = assetSearch.trim();
      }

      const res = await authFetch(`${API}/api/bbg/trades/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        resetForm();
        setShowForm(false);
        fetchTrades();
        fetchPendingRequests();
        fetchPortfolios();
      }
    } catch (e) {
      console.error("Failed to create trade:", e);
    }
    setSubmitting(false);
  };

  const resetForm = () => {
    setAssetId(null);
    setAssetSearch("");
    setAssetNotRegistered(false);
    setQuantity("");
    setPrice("");
    setCleanPrice("");
    setNotes("");
    setBroker("");
    setTrader("");
    setSettlementDate("");
    setScheduledDate("");
    setFeePerUnit("");
    setFeeTotalManual("");
    setTradeStatus("pending");
    setCmd("");
  };

  const deleteTrade = async (id: number) => {
    if (!confirm("Delete this trade?")) return;
    try {
      await authFetch(`${API}/api/bbg/trades/${id}/`, { method: "DELETE" });
      fetchTrades();
    } catch (e) {
      console.error("Failed to delete trade:", e);
    }
  };

  const confirmTrade = async (id: number) => {
    try {
      const res = await authFetch(`${API}/api/bbg/trades/${id}/confirm/`, { method: "POST" });
      if (res.ok) fetchTrades();
    } catch (e) {
      console.error("Failed to confirm trade:", e);
    }
  };

  // Sort logic
  const sorted = [...trades].sort((a, b) => {
    let va: string | number = "";
    let vb: string | number = "";
    switch (sortKey) {
      case "trade_date": va = a.trade_date; vb = b.trade_date; break;
      case "fund": va = a.fund; vb = b.fund; break;
      case "portfolio": va = a.portfolio; vb = b.portfolio; break;
      case "display_ticker": va = a.display_ticker; vb = b.display_ticker; break;
      case "quantity": va = a.quantity; vb = b.quantity; break;
      case "price": va = a.price; vb = b.price; break;
      case "notional": va = a.notional; vb = b.notional; break;
      case "trade_status": va = a.trade_status; vb = b.trade_status; break;
    }
    if (va < vb) return sortAsc ? -1 : 1;
    if (va > vb) return sortAsc ? 1 : -1;
    return 0;
  });

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(true); }
  };

  const SortHeader = ({ label, sortKeyName, align }: { label: string; sortKeyName: SortKey; align?: string }) => (
    <th
      className={`py-2 px-2 text-slate-500 font-medium cursor-pointer hover:text-slate-700 dark:hover:text-slate-300 whitespace-nowrap ${align === "right" ? "text-right" : "text-left"}`}
      onClick={() => toggleSort(sortKeyName)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {sortKey === sortKeyName && (sortAsc ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
      </span>
    </th>
  );

  // Unique funds for filter
  const funds = [...new Set(trades.map(t => t.fund))].sort();
  const totalNotional = trades.reduce((sum, t) => sum + (t.side === "buy" ? t.notional : -t.notional), 0);

  const inputCls = "w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none";
  const labelCls = "block text-xs font-medium text-slate-500 mb-1";

  const fmt = (v: number | null | undefined, dec = 2) =>
    v != null ? v.toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec }) : "—";

  return (
    <div className="max-w-[1600px] mx-auto px-6 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Manager View</h1>
          <p className="text-sm text-slate-500 mt-1">Trade entry and blotter</p>
        </div>
        <div className="flex items-center gap-3">
          {pendingRequests > 0 && (
            <Link
              href="/asset-register"
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition"
            >
              <AlertTriangle className="w-4 h-4" />
              {pendingRequests} asset{pendingRequests > 1 ? "s" : ""} pending registration
            </Link>
          )}
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition"
          >
            <Plus className="w-4 h-4" />
            New Trade
          </button>
        </div>
      </div>

      {/* Trade Entry Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">New Trade</h2>

          {/* Unregistered asset warning */}
          {assetNotRegistered && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
              <p className="text-sm text-amber-700 dark:text-amber-300">
                Asset not registered — a registration request will be created for backoffice review.
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Fund */}
            <div>
              <label className={labelCls}>Fund *</label>
              <input type="text" value={fund} onChange={e => setFund(e.target.value)} required placeholder="e.g. IGF TR" className={inputCls} />
            </div>

            {/* Asset (autocomplete) */}
            <div className="relative">
              <label className={labelCls}>Asset *</label>
              <div className="relative">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={assetSearch}
                  onChange={e => searchAssets(e.target.value)}
                  placeholder="Search or type ticker..."
                  className={`${inputCls} pl-9`}
                />
              </div>
              {assetResults.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {assetResults.map(a => (
                    <button key={a.id} type="button" onClick={() => selectAsset(a)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700 transition">
                      <span className="font-medium text-slate-900 dark:text-white">{a.code_bbg}</span>
                      {a.name && <span className="text-slate-500 ml-2">{a.name}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Side */}
            <div>
              <label className={labelCls}>Side *</label>
              <div className="flex gap-2">
                {(["buy", "sell"] as const).map(s => (
                  <button key={s} type="button" onClick={() => setSide(s)}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium transition border ${
                      side === s
                        ? s === "buy"
                          ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700"
                          : "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-300 dark:border-red-700"
                        : "bg-slate-100 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700"
                    }`}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Portfolio */}
            <div>
              <label className={labelCls}>Portfolio</label>
              <input type="text" value={portfolio} onChange={e => setPortfolio(e.target.value)}
                list="portfolio-options" placeholder="e.g. DISCRETIONARY" className={inputCls} />
              <datalist id="portfolio-options">
                {portfolioOptions.map(p => <option key={p} value={p} />)}
              </datalist>
            </div>

            {/* Quantity */}
            <div>
              <label className={labelCls}>Quantity *</label>
              <input type="number" step="any" value={quantity} onChange={e => setQuantity(e.target.value)} required className={inputCls} />
            </div>

            {/* Price */}
            <div>
              <label className={labelCls}>Price *</label>
              <input type="number" step="any" value={price} onChange={e => setPrice(e.target.value)} required className={inputCls} />
            </div>

            {/* Clean Price */}
            <div>
              <label className={labelCls}>Clean Price</label>
              <input type="number" step="any" value={cleanPrice} onChange={e => setCleanPrice(e.target.value)} placeholder="Bonds only" className={inputCls} />
            </div>

            {/* Currency */}
            <div>
              <label className={labelCls}>Currency</label>
              <select value={currency} onChange={e => setCurrency(e.target.value)} className={inputCls}>
                {["USD", "BRL", "EUR", "GBP", "JPY", "CHF"].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            {/* Trade Date */}
            <div>
              <label className={labelCls}>Trade Date *</label>
              <input type="date" value={tradeDate} onChange={e => setTradeDate(e.target.value)} required className={inputCls} />
            </div>

            {/* Scheduled Date */}
            <div>
              <label className={labelCls}>Scheduled Date</label>
              <input type="date" value={scheduledDate} onChange={e => setScheduledDate(e.target.value)} className={inputCls} />
            </div>

            {/* Settlement Date */}
            <div>
              <label className={labelCls}>Settlement Date</label>
              <input type="date" value={settlementDate} onChange={e => setSettlementDate(e.target.value)} className={inputCls} />
            </div>

            {/* Broker */}
            <div>
              <label className={labelCls}>Broker</label>
              <input type="text" value={broker} onChange={e => setBroker(e.target.value)} className={inputCls} />
            </div>

            {/* Trader */}
            <div>
              <label className={labelCls}>Trader</label>
              <input type="text" value={trader} onChange={e => setTrader(e.target.value)} className={inputCls} />
            </div>

            {/* Fee/Unit */}
            <div>
              <label className={labelCls}>Fee/Unit</label>
              <input type="number" step="any" value={feePerUnit} onChange={e => setFeePerUnit(e.target.value)} className={inputCls} />
            </div>

            {/* Fee Total */}
            <div>
              <label className={labelCls}>Fee Total</label>
              <input type="number" step="any" value={feeTotalManual} onChange={e => setFeeTotalManual(e.target.value)}
                placeholder={computedFeeTotal ? fmt(computedFeeTotal) : "Auto"} className={inputCls} />
            </div>

            {/* Trade Status */}
            <div>
              <label className={labelCls}>Status</label>
              <select value={tradeStatus} onChange={e => setTradeStatus(e.target.value)} className={inputCls}>
                <option value="pending">Pending</option>
                <option value="confirmed">Confirmed</option>
                <option value="checked">Checked</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>

            {/* CMD */}
            <div>
              <label className={labelCls}>CMD</label>
              <input type="text" value={cmd} onChange={e => setCmd(e.target.value)} className={inputCls} />
            </div>
          </div>

          {/* Computed values row */}
          {qtyNum > 0 && priceNum > 0 && (
            <div className="flex gap-6 px-4 py-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 text-sm">
              <span className="text-slate-500">Amount: <span className="font-medium text-slate-900 dark:text-white">{fmt(computedAmount)}</span></span>
              {computedFeeTotal > 0 && <span className="text-slate-500">Fee: <span className="font-medium text-slate-900 dark:text-white">{fmt(computedFeeTotal)}</span></span>}
              <span className="text-slate-500">Cash Amount: <span className={`font-medium ${computedCashAmount >= 0 ? "text-emerald-600" : "text-red-600"}`}>{fmt(computedCashAmount)}</span></span>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className={labelCls}>Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Optional notes..."
              className={`${inputCls} resize-none`} />
          </div>

          <div className="flex gap-3">
            <button type="submit" disabled={submitting || (!assetId && !assetNotRegistered)}
              className="px-6 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition">
              {submitting ? "Saving..." : "Save Trade"}
            </button>
            <button type="button" onClick={() => setShowForm(false)}
              className="px-6 py-2 text-sm font-medium rounded-lg border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition">
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        {/* Status pills */}
        <div className="flex gap-2">
          {[
            { label: "All", value: "" },
            { label: "Pending", value: "pending" },
            { label: "Confirmed", value: "confirmed" },
            { label: "Checked", value: "checked" },
            { label: "Cancelled", value: "cancelled" },
          ].map(s => (
            <button key={s.value} onClick={() => setStatusFilter(s.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                statusFilter === s.value
                  ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                  : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}>
              {s.label}
            </button>
          ))}
        </div>

        {/* Fund filter */}
        {funds.length > 1 && (
          <div className="flex gap-2">
            <span className="text-xs text-slate-400 self-center">Fund:</span>
            <button onClick={() => setFundFilter("")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                !fundFilter ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300" : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}>All</button>
            {funds.map(f => (
              <button key={f} onClick={() => setFundFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                  fundFilter === f ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300" : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                }`}>{f}</button>
            ))}
          </div>
        )}

        {/* Date range */}
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-xs text-slate-400">From:</span>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white outline-none" />
          <span className="text-xs text-slate-400">To:</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white outline-none" />
          {(dateFrom || dateTo) && (
            <button onClick={() => { setDateFrom(""); setDateTo(""); }}
              className="text-xs text-slate-400 hover:text-slate-600 transition">Clear</button>
          )}
        </div>
      </div>

      {/* Trade Blotter */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Trade Blotter</h2>
          <p className="text-sm text-slate-500">
            {sorted.length} trades | Net notional:{" "}
            <span className={totalNotional >= 0 ? "text-emerald-500" : "text-red-500"}>
              {fmt(totalNotional)}
            </span>
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800">
                <th className="py-2 px-2 text-left text-slate-500 font-medium">ID</th>
                <th className="py-2 px-2 text-left text-slate-500 font-medium">WD</th>
                <SortHeader label="Date" sortKeyName="trade_date" />
                <th className="py-2 px-2 text-left text-slate-500 font-medium">Sched</th>
                <th className="py-2 px-2 text-left text-slate-500 font-medium">Settle</th>
                <SortHeader label="Fund" sortKeyName="fund" />
                <SortHeader label="Portfolio" sortKeyName="portfolio" />
                <th className="py-2 px-2 text-left text-slate-500 font-medium">Broker</th>
                <SortHeader label="Asset" sortKeyName="display_ticker" />
                <th className="py-2 px-2 text-left text-slate-500 font-medium">Side</th>
                <SortHeader label="Units" sortKeyName="quantity" align="right" />
                <th className="py-2 px-2 text-right text-slate-500 font-medium">ClnPx</th>
                <SortHeader label="Price" sortKeyName="price" align="right" />
                <th className="py-2 px-2 text-right text-slate-500 font-medium">Fee/U</th>
                <th className="py-2 px-2 text-right text-slate-500 font-medium">Fee</th>
                <SortHeader label="Amount" sortKeyName="notional" align="right" />
                <th className="py-2 px-2 text-right text-slate-500 font-medium">Cash</th>
                <th className="py-2 px-2 text-left text-slate-500 font-medium">Trader</th>
                <th className="py-2 px-2 text-left text-slate-500 font-medium">Notes</th>
                <SortHeader label="Status" sortKeyName="trade_status" />
                <th className="py-2 px-2 text-left text-slate-500 font-medium">CMD</th>
                <th className="py-2 px-2"></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(t => (
                <tr key={t.id} className="border-b border-slate-100 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/30">
                  <td className="py-1.5 px-2 text-slate-400">{t.id}</td>
                  <td className="py-1.5 px-2 text-slate-400">{t.weekday}</td>
                  <td className="py-1.5 px-2 text-slate-500">{t.trade_date}</td>
                  <td className="py-1.5 px-2 text-slate-400">{t.scheduled_date || "—"}</td>
                  <td className="py-1.5 px-2 text-slate-400">{t.settlement_date || "—"}</td>
                  <td className="py-1.5 px-2 text-slate-900 dark:text-slate-200">{t.fund}</td>
                  <td className="py-1.5 px-2 text-slate-500">{t.portfolio || "—"}</td>
                  <td className="py-1.5 px-2 text-slate-500">{t.broker || "—"}</td>
                  <td className="py-1.5 px-2">
                    <span className={`font-medium ${t.asset ? "text-slate-900 dark:text-white" : "text-amber-600 dark:text-amber-400"}`}>
                      {t.display_ticker}
                    </span>
                    {!t.asset && t.asset_ticker_raw && (
                      <span className="ml-1 text-[10px] text-amber-500" title="Asset not registered">*</span>
                    )}
                  </td>
                  <td className="py-1.5 px-2">
                    <span className={`inline-flex items-center gap-0.5 ${t.side === "buy" ? "text-emerald-500" : "text-red-500"}`}>
                      {t.side === "buy" ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                      {t.side.toUpperCase()}
                    </span>
                  </td>
                  <td className="py-1.5 px-2 text-right text-slate-900 dark:text-slate-200">{t.quantity.toLocaleString()}</td>
                  <td className="py-1.5 px-2 text-right text-slate-400">{t.clean_price != null ? fmt(t.clean_price, 4) : "—"}</td>
                  <td className="py-1.5 px-2 text-right text-slate-900 dark:text-slate-200">{fmt(t.price, 4)}</td>
                  <td className="py-1.5 px-2 text-right text-slate-400">{t.fee_per_unit ? fmt(t.fee_per_unit, 4) : "—"}</td>
                  <td className="py-1.5 px-2 text-right text-slate-400">{t.fee_total ? fmt(t.fee_total) : "—"}</td>
                  <td className="py-1.5 px-2 text-right font-medium text-slate-900 dark:text-white">{fmt(t.notional)}</td>
                  <td className={`py-1.5 px-2 text-right font-medium ${(t.cash_amount ?? 0) >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                    {t.cash_amount != null ? fmt(t.cash_amount) : "—"}
                  </td>
                  <td className="py-1.5 px-2 text-slate-500">{t.trader || "—"}</td>
                  <td className="py-1.5 px-2 text-slate-400 max-w-[120px] truncate" title={t.notes}>{t.notes || "—"}</td>
                  <td className="py-1.5 px-2">
                    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium ${STATUS_COLORS[t.trade_status] || ""}`}>
                      {t.trade_status}
                    </span>
                  </td>
                  <td className="py-1.5 px-2 text-slate-400">{t.cmd || "—"}</td>
                  <td className="py-1.5 px-2">
                    <div className="flex items-center gap-1">
                      {isAdmin && t.trade_status === "pending" && (
                        <button onClick={() => confirmTrade(t.id)}
                          title="Confirm trade"
                          className="p-1 rounded text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button onClick={() => deleteTrade(t.id)}
                        className="p-1 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr><td colSpan={22} className="py-8 text-center text-slate-500">
                  {loading ? "Loading..." : "No trades yet. Click 'New Trade' to add one."}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

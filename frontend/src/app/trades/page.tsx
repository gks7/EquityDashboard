"use client";

import { useEffect, useState, FormEvent } from "react";
import { authFetch } from "@/lib/authFetch";
import { Plus, Trash2, ArrowUpRight, ArrowDownRight, Search } from "lucide-react";

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
  asset: number;
  asset_code: string;
  asset_name: string;
  side: "buy" | "sell";
  quantity: number;
  price: number;
  currency: string;
  trade_date: string;
  settlement_date: string | null;
  broker: string;
  notes: string;
  entered_by_name: string | null;
  notional: number;
  created_at: string;
}

export default function TradesPage() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [fundFilter, setFundFilter] = useState("");

  // Form state
  const [fund, setFund] = useState("");
  const [assetId, setAssetId] = useState<number | null>(null);
  const [assetSearch, setAssetSearch] = useState("");
  const [assetResults, setAssetResults] = useState<Asset[]>([]);
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [tradeDate, setTradeDate] = useState(new Date().toISOString().slice(0, 10));
  const [settlementDate, setSettlementDate] = useState("");
  const [broker, setBroker] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fetchTrades = async () => {
    setLoading(true);
    try {
      const url = fundFilter
        ? `${API}/api/bbg/trades/?fund=${encodeURIComponent(fundFilter)}`
        : `${API}/api/bbg/trades/`;
      const res = await authFetch(url);
      if (res.ok) setTrades(await res.json());
    } catch (e) {
      console.error("Failed to fetch trades:", e);
    }
    setLoading(false);
  };

  useEffect(() => { fetchTrades(); }, [fundFilter]);

  // Asset search autocomplete
  const searchAssets = async (q: string) => {
    setAssetSearch(q);
    if (q.length < 2) {
      setAssetResults([]);
      return;
    }
    try {
      const res = await authFetch(`${API}/api/bbg/assets/search/?q=${encodeURIComponent(q)}`);
      if (res.ok) setAssetResults(await res.json());
    } catch (e) {
      console.error("Asset search failed:", e);
    }
  };

  const selectAsset = (asset: Asset) => {
    setAssetId(asset.id);
    setAssetSearch(asset.code_bbg + (asset.name ? ` — ${asset.name}` : ""));
    setAssetResults([]);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!assetId || !fund || !quantity || !price) return;

    setSubmitting(true);
    try {
      const res = await authFetch(`${API}/api/bbg/trades/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fund,
          asset: assetId,
          side,
          quantity: parseFloat(quantity),
          price: parseFloat(price),
          currency,
          trade_date: tradeDate,
          settlement_date: settlementDate || null,
          broker,
          notes,
        }),
      });
      if (res.ok) {
        // Reset form
        setShowForm(false);
        setAssetId(null);
        setAssetSearch("");
        setQuantity("");
        setPrice("");
        setNotes("");
        setBroker("");
        setSettlementDate("");
        fetchTrades();
      }
    } catch (e) {
      console.error("Failed to create trade:", e);
    }
    setSubmitting(false);
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

  // Unique funds for filter
  const funds = [...new Set(trades.map(t => t.fund))].sort();

  // Totals
  const totalNotional = trades.reduce((sum, t) => sum + (t.side === "buy" ? t.notional : -t.notional), 0);

  return (
    <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Trades</h1>
          <p className="text-sm text-slate-500 mt-1">Manual trade entry and blotter</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition"
        >
          <Plus className="w-4 h-4" />
          New Trade
        </button>
      </div>

      {/* Trade Entry Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">New Trade</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Fund */}
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Fund</label>
              <input
                type="text"
                value={fund}
                onChange={e => setFund(e.target.value)}
                required
                placeholder="e.g. IGF TR"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>

            {/* Asset (autocomplete) */}
            <div className="relative">
              <label className="block text-xs font-medium text-slate-500 mb-1">Asset</label>
              <div className="relative">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={assetSearch}
                  onChange={e => searchAssets(e.target.value)}
                  required
                  placeholder="Search ticker..."
                  className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              {assetResults.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {assetResults.map(a => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => selectAsset(a)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700 transition"
                    >
                      <span className="font-medium text-slate-900 dark:text-white">{a.code_bbg}</span>
                      {a.name && <span className="text-slate-500 ml-2">{a.name}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Side */}
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Side</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setSide("buy")}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${
                    side === "buy"
                      ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700"
                      : "bg-slate-100 dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700"
                  }`}
                >
                  Buy
                </button>
                <button
                  type="button"
                  onClick={() => setSide("sell")}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${
                    side === "sell"
                      ? "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border border-red-300 dark:border-red-700"
                      : "bg-slate-100 dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700"
                  }`}
                >
                  Sell
                </button>
              </div>
            </div>

            {/* Quantity */}
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Quantity</label>
              <input
                type="number"
                step="any"
                value={quantity}
                onChange={e => setQuantity(e.target.value)}
                required
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>

            {/* Price */}
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Price</label>
              <input
                type="number"
                step="any"
                value={price}
                onChange={e => setPrice(e.target.value)}
                required
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>

            {/* Currency */}
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Currency</label>
              <select
                value={currency}
                onChange={e => setCurrency(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="USD">USD</option>
                <option value="BRL">BRL</option>
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
              </select>
            </div>

            {/* Trade Date */}
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Trade Date</label>
              <input
                type="date"
                value={tradeDate}
                onChange={e => setTradeDate(e.target.value)}
                required
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>

            {/* Settlement Date */}
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Settlement Date</label>
              <input
                type="date"
                value={settlementDate}
                onChange={e => setSettlementDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>

            {/* Broker */}
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Broker</label>
              <input
                type="text"
                value={broker}
                onChange={e => setBroker(e.target.value)}
                placeholder="Optional"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              placeholder="Optional notes..."
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none resize-none"
            />
          </div>

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={submitting || !assetId}
              className="px-6 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition"
            >
              {submitting ? "Saving..." : "Save Trade"}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-6 py-2 text-sm font-medium rounded-lg border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Fund Filter */}
      {funds.length > 1 && (
        <div className="flex gap-2">
          <button
            onClick={() => setFundFilter("")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              !fundFilter ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300" : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            All
          </button>
          {funds.map(f => (
            <button
              key={f}
              onClick={() => setFundFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                fundFilter === f ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300" : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      )}

      {/* Trade Blotter */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Trade Blotter</h2>
          <p className="text-sm text-slate-500">
            {trades.length} trades | Net notional:{" "}
            <span className={totalNotional >= 0 ? "text-emerald-500" : "text-red-500"}>
              {totalNotional.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800">
                <th className="text-left py-2 px-3 text-slate-500 font-medium">Date</th>
                <th className="text-left py-2 px-3 text-slate-500 font-medium">Fund</th>
                <th className="text-left py-2 px-3 text-slate-500 font-medium">Side</th>
                <th className="text-left py-2 px-3 text-slate-500 font-medium">Asset</th>
                <th className="text-right py-2 px-3 text-slate-500 font-medium">Qty</th>
                <th className="text-right py-2 px-3 text-slate-500 font-medium">Price</th>
                <th className="text-right py-2 px-3 text-slate-500 font-medium">Notional</th>
                <th className="text-left py-2 px-3 text-slate-500 font-medium">Ccy</th>
                <th className="text-left py-2 px-3 text-slate-500 font-medium">Broker</th>
                <th className="text-left py-2 px-3 text-slate-500 font-medium">By</th>
                <th className="py-2 px-3"></th>
              </tr>
            </thead>
            <tbody>
              {trades.map(t => (
                <tr key={t.id} className="border-b border-slate-100 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/30">
                  <td className="py-2 px-3 text-slate-500">{t.trade_date}</td>
                  <td className="py-2 px-3 text-slate-900 dark:text-slate-200">{t.fund}</td>
                  <td className="py-2 px-3">
                    <span className={`inline-flex items-center gap-1 ${
                      t.side === "buy" ? "text-emerald-500" : "text-red-500"
                    }`}>
                      {t.side === "buy" ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                      {t.side.toUpperCase()}
                    </span>
                  </td>
                  <td className="py-2 px-3">
                    <span className="font-medium text-slate-900 dark:text-white">{t.asset_code}</span>
                    {t.asset_name && <span className="text-slate-500 ml-1 text-xs">{t.asset_name}</span>}
                  </td>
                  <td className="py-2 px-3 text-right text-slate-900 dark:text-slate-200">
                    {t.quantity.toLocaleString()}
                  </td>
                  <td className="py-2 px-3 text-right text-slate-900 dark:text-slate-200">
                    {t.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                  </td>
                  <td className="py-2 px-3 text-right font-medium text-slate-900 dark:text-white">
                    {t.notional.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="py-2 px-3 text-slate-500">{t.currency}</td>
                  <td className="py-2 px-3 text-slate-500">{t.broker || "—"}</td>
                  <td className="py-2 px-3 text-slate-500">{t.entered_by_name || "—"}</td>
                  <td className="py-2 px-3">
                    <button
                      onClick={() => deleteTrade(t.id)}
                      className="p-1 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
              {trades.length === 0 && (
                <tr><td colSpan={11} className="py-8 text-center text-slate-500">
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

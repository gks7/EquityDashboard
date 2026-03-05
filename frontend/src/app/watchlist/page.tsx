"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, TrendingUp, TrendingDown, RefreshCcw, Trash2, Edit2, Check, X } from "lucide-react";
import { authFetch } from "@/lib/authFetch";

interface Stock {
  ticker: string;
  company_name: string;
  current_price: number;
  sector: string;
  consensus_target_pe: number;
  consensus_target_eps: number;
  consensus_yield: number;
  theses: Array<{
    conviction: number;
  }>;
}

export default function WatchlistPage() {
  const router = useRouter();
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [newTicker, setNewTicker] = useState("");
  const [editingTicker, setEditingTicker] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const fetchStocks = async () => {
    try {
      const res = await authFetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/stocks/`);
      const data = await res.json();
      setStocks(data);
    } catch (error) {
      console.error("Failed to fetch watchlist:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStocks();
  }, []);

  const handleAddTicker = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTicker.trim()) return;

    setSubmitting(true);
    try {
      const res = await authFetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/stocks/add_ticker/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker: newTicker.toUpperCase() })
      });

      if (res.ok) {
        fetchStocks();
        setNewTicker("");
      } else {
        const error = await res.json();
        alert(error.error || "Failed to add ticker");
      }
    } catch (error) {
      console.error("Error adding ticker:", error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteTicker = async (e: React.MouseEvent, ticker: string) => {
    e.stopPropagation();
    if (!confirm(`Are you sure you want to remove ${ticker} from your watchlist?`)) return;

    try {
      const res = await authFetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/stocks/${ticker}/`, {
        method: 'DELETE'
      });

      if (res.ok) {
        setStocks(stocks.filter(s => s.ticker !== ticker));
      } else {
        alert("Failed to delete ticker");
      }
    } catch (error) {
      console.error("Error deleting ticker:", error);
    }
  };

  const handleUpdateName = async (e: React.MouseEvent | React.KeyboardEvent, ticker: string) => {
    e.stopPropagation();
    if (!editName.trim()) return;

    try {
      const res = await authFetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/stocks/${ticker}/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_name: editName })
      });

      if (res.ok) {
        const updated = await res.json();
        setStocks(stocks.map(s => s.ticker === ticker ? updated : s));
        setEditingTicker(null);
      }
    } catch (error) {
      console.error("Error updating name:", error);
    }
  };

  const startEditing = (e: React.MouseEvent, stock: Stock) => {
    e.stopPropagation();
    setEditingTicker(stock.ticker);
    setEditName(stock.company_name);
  };

  const cancelEditing = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingTicker(null);
  };

  const calculateIRR = (stock: Stock) => {
    const yieldPct = stock.consensus_yield || 0;
    const currentPrice = stock.current_price || 0;
    const targetPrice = (stock.consensus_target_pe || 0) * (stock.consensus_target_eps || 0);

    if (currentPrice > 0 && targetPrice > 0) {
      const priceIRR = (Math.pow(targetPrice / currentPrice, 1 / 5) - 1) * 100;
      return priceIRR + yieldPct;
    }
    return 0;
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Watchlist</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Track active coverage and internal estimates.</p>
        </div>

        <form onSubmit={handleAddTicker} className="flex items-center gap-2">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
              <span className="text-slate-400 text-sm">$</span>
            </div>
            <input
              type="text"
              value={newTicker}
              onChange={(e) => setNewTicker(e.target.value.toUpperCase())}
              className="pl-8 pr-4 py-2 w-48 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:text-white outline-none transition-all"
              placeholder="Add Ticker..."
              disabled={loading}
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white rounded-md p-2 shadow-sm transition-colors disabled:opacity-50"
          >
            {loading ? <RefreshCcw className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
          </button>
        </form>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 font-medium">
              <tr>
                <th className="px-6 py-4">Company</th>
                <th className="px-6 py-4 text-right">Price</th>
                <th className="px-6 py-4 text-center">Conviction</th>
                <th className="px-6 py-4 text-right">5Y Expected / Yr</th>
                <th className="px-6 py-4">Sector</th>
                <th className="px-6 py-4"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {stocks.map((stock: Stock) => {
                const irr = calculateIRR(stock);
                const conviction = stock.theses && stock.theses.length > 0 ? stock.theses[0].conviction : 0;

                return (
                  <tr
                    key={stock.ticker}
                    onClick={() => router.push(`/stock/${stock.ticker}`)}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group cursor-pointer"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center font-bold text-blue-700 dark:text-blue-400 shrink-0 uppercase">
                          {stock.ticker[0]}
                        </div>
                        <div>
                          <div className="font-semibold text-slate-900 dark:text-white text-base">
                            {stock.ticker}
                          </div>
                          <div className="flex items-center gap-2 group/name">
                            {editingTicker === stock.ticker ? (
                              <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                <input
                                  type="text"
                                  value={editName}
                                  onChange={(e) => setEditName(e.target.value)}
                                  onKeyDown={(e) => e.key === 'Enter' && handleUpdateName(e, stock.ticker)}
                                  className="text-xs py-0.5 px-1 bg-white dark:bg-slate-800 border border-blue-500 rounded outline-none w-32"
                                  autoFocus
                                />
                                <button onClick={(e) => handleUpdateName(e, stock.ticker)} className="text-emerald-500 hover:text-emerald-600">
                                  <Check className="w-3 h-3" />
                                </button>
                                <button onClick={cancelEditing} className="text-slate-400 hover:text-slate-600">
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            ) : (
                              <>
                                <div className="text-slate-500 dark:text-slate-400 text-xs truncate max-w-[150px]">
                                  {stock.company_name}
                                </div>
                                <button
                                  onClick={(e) => startEditing(e, stock)}
                                  className="opacity-0 group-hover/name:opacity-100 p-1 text-slate-400 hover:text-blue-500 transition-opacity"
                                >
                                  <Edit2 className="w-3 h-3" />
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right font-medium text-slate-900 dark:text-white">
                      ${stock.current_price?.toFixed(2) || "0.00"}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-center gap-1">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <div
                            key={star}
                            className={`w-2 h-2 rounded-full ${star <= conviction ? 'bg-amber-400' : 'bg-slate-200 dark:bg-slate-700'}`}
                          />
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className={`inline-flex items-center gap-1 font-semibold ${irr >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                        {irr >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                        {irr >= 0 ? '+' : ''}{irr.toFixed(1)}%
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-500 dark:text-slate-400 py-1">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300">
                        {stock.sector || "Unknown"}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/stock/${stock.ticker}`}
                          className="opacity-0 group-hover:opacity-100 inline-flex items-center justify-center px-3 py-1.5 text-xs font-medium rounded text-blue-700 bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/40 dark:text-blue-300 dark:hover:bg-blue-900/60 transition-all"
                          onClick={(e) => e.stopPropagation()}
                        >
                          View Thesis
                        </Link>
                        <button
                          onClick={(e) => handleDeleteTicker(e, stock.ticker)}
                          className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition-all rounded hover:bg-rose-50 dark:hover:bg-rose-900/20"
                          title="Delete ticker"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!loading && stocks.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500 dark:text-slate-400">
                    No stocks in watchlist. Add a ticker to get started.
                  </td>
                </tr>
              )}
              {loading && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500 dark:text-slate-400">
                    <RefreshCcw className="w-6 h-6 animate-spin mx-auto mb-2" />
                    Loading watchlist...
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

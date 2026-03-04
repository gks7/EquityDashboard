"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { Plus, RefreshCcw, Trash2, ChevronUp, ChevronDown, ArrowUpDown } from "lucide-react";

// Types to match backend serializers
interface StockDetails {
    ticker: string;
    company_name: string;
    current_price: number;
    forward_pe: number;
    consensus_target_pe: number;
    consensus_target_eps: number;
    consensus_yield: number;
}

interface PortfolioItem {
    id: number;
    quantity: number;
    average_cost: number;
    total_cost: number;
    current_value: number;
    unrealized_pl: number;
    unrealized_pl_pct: number;
    stock_details: StockDetails;
}

export default function PortfolioPage() {
    const [items, setItems] = useState<PortfolioItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [newTicker, setNewTicker] = useState("");
    const [newQuantity, setNewQuantity] = useState("");
    const [newAvgCost, setNewAvgCost] = useState("");
    const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>({ key: 'irr', direction: 'desc' });

    const fetchItems = async () => {
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/portfolio/`);
            const data = await res.json();
            setItems(data);
        } catch (error) {
            console.error("Failed to fetch portfolio:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchItems();
    }, []);

    const handleAddItem = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newTicker.trim() || !newQuantity || !newAvgCost) return;

        setSubmitting(true);
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/portfolio/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ticker: newTicker,
                    quantity: parseFloat(newQuantity),
                    average_cost: parseFloat(newAvgCost)
                })
            });

            if (res.ok) {
                fetchItems(); // Refresh full list to get calculated fields or updated stocks
                setNewTicker("");
                setNewQuantity("");
                setNewAvgCost("");
            } else {
                const error = await res.json();
                alert(error.error || "Failed to add ticker");
            }
        } catch (error) {
            console.error("Error adding item:", error);
        } finally {
            setSubmitting(false);
        }
    };

    const handleUpdateItem = async (id: number, field: 'quantity' | 'average_cost', value: string) => {
        const numValue = parseFloat(value);
        if (isNaN(numValue) || numValue < 0) return;

        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/portfolio/${id}/`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ [field]: numValue })
            });

            if (res.ok) {
                const updated = await res.json();
                setItems(items.map(item => item.id === id ? updated : item));
            }
        } catch (error) {
            console.error("Error updating item:", error);
        }
    };

    const handleDeleteItem = async (id: number) => {
        if (!confirm("Are you sure you want to remove this stock from your portfolio?")) return;

        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/portfolio/${id}/`, {
                method: 'DELETE'
            });

            if (res.ok) {
                setItems(items.filter(item => item.id !== id));
            }
        } catch (error) {
            console.error("Error deleting item:", error);
        }
    };

    const calculateCurrentValue = (item: PortfolioItem) => item.current_value;
    const calculatePL = (item: PortfolioItem) => item.unrealized_pl;
    const calculatePLPct = (item: PortfolioItem) => item.unrealized_pl_pct;

    const calculateIRR = (item: PortfolioItem) => {
        const yieldPct = item.stock_details.consensus_yield || 0;
        const currentPrice = item.stock_details.current_price || 0;
        const targetPrice = (item.stock_details.consensus_target_pe || 0) * (item.stock_details.consensus_target_eps || 0);

        if (currentPrice > 0 && targetPrice > 0) {
            const priceIRR = (Math.pow(targetPrice / currentPrice, 1 / 5) - 1) * 100;
            return priceIRR + yieldPct;
        }
        return 0;
    };

    const sortedItems = useMemo(() => {
        const sortableItems = [...items];
        if (sortConfig !== null) {
            sortableItems.sort((a, b) => {
                let aValue: string | number;
                let bValue: string | number;

                switch (sortConfig.key) {
                    case 'ticker':
                        aValue = a.stock_details.ticker;
                        bValue = b.stock_details.ticker;
                        break;
                    case 'company':
                        aValue = a.stock_details.company_name;
                        bValue = b.stock_details.company_name;
                        break;
                    case 'qty':
                        aValue = a.quantity;
                        bValue = b.quantity;
                        break;
                    case 'avg_cost':
                        aValue = a.average_cost;
                        bValue = b.average_cost;
                        break;
                    case 'price':
                        aValue = a.stock_details.current_price;
                        bValue = b.stock_details.current_price;
                        break;
                    case 'forward_pe':
                        aValue = a.stock_details.forward_pe;
                        bValue = b.stock_details.forward_pe;
                        break;
                    case 'total_value':
                        aValue = calculateCurrentValue(a);
                        bValue = calculateCurrentValue(b);
                        break;
                    case 'pl_pct':
                        aValue = calculatePLPct(a);
                        bValue = calculatePLPct(b);
                        break;
                    case 'target_pe':
                        aValue = a.stock_details.consensus_target_pe;
                        bValue = b.stock_details.consensus_target_pe;
                        break;
                    case 'target_eps':
                        aValue = a.stock_details.consensus_target_eps;
                        bValue = b.stock_details.consensus_target_eps;
                        break;
                    case 'yield':
                        aValue = a.stock_details.consensus_yield;
                        bValue = b.stock_details.consensus_yield;
                        break;
                    case 'irr':
                        aValue = calculateIRR(a);
                        bValue = calculateIRR(b);
                        break;
                    default:
                        aValue = 0;
                        bValue = 0;
                }

                if (aValue < bValue) {
                    return sortConfig.direction === 'asc' ? -1 : 1;
                }
                if (aValue > bValue) {
                    return sortConfig.direction === 'asc' ? 1 : -1;
                }
                return 0;
            });
        }
        return sortableItems;
    }, [items, sortConfig]);

    const requestSort = (key: string) => {
        let direction: 'asc' | 'desc' = 'desc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'desc') {
            direction = 'asc';
        }
        setSortConfig({ key, direction });
    };

    const SortIndicator = ({ columnKey }: { columnKey: string }) => {
        if (!sortConfig || sortConfig.key !== columnKey) {
            return <ArrowUpDown className="w-3 h-3 ml-1 opacity-0 group-hover:opacity-100 transition-opacity" />;
        }
        return sortConfig.direction === 'asc'
            ? <ChevronUp className="w-3 h-3 ml-1 text-blue-600" />
            : <ChevronDown className="w-3 h-3 ml-1 text-blue-600" />;
    };

    // Local state for inline editing
    const [editingCell, setEditingCell] = useState<{ id: number, field: string } | null>(null);
    const [editValue, setEditValue] = useState("");

    const startEditing = (id: number, field: string, currentValue: number) => {
        setEditingCell({ id, field });
        setEditValue(currentValue.toString());
    };

    const saveEdit = () => {
        if (editingCell) {
            handleUpdateItem(editingCell.id, editingCell.field as 'quantity' | 'average_cost', editValue);
        }
        setEditingCell(null);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            saveEdit();
        } else if (e.key === 'Escape') {
            setEditingCell(null);
        }
    };

    return (
        <div className="max-w-7xl mx-auto">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Current Portfolio</h1>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Manage holdings and compare market data with analyst projections.</p>
                </div>

                <form onSubmit={handleAddItem} className="flex items-center gap-2 flex-wrap md:flex-nowrap">
                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                            <span className="text-slate-400 text-sm">$</span>
                        </div>
                        <input
                            type="text"
                            value={newTicker}
                            onChange={(e) => setNewTicker(e.target.value.toUpperCase())}
                            className="pl-8 pr-4 py-2 w-28 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:text-white outline-none transition-all"
                            placeholder="Ticker"
                            disabled={submitting}
                            required
                        />
                    </div>
                    <input
                        type="number"
                        step="0.01"
                        value={newQuantity}
                        onChange={(e) => setNewQuantity(e.target.value)}
                        className="px-4 py-2 w-24 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:text-white outline-none transition-all"
                        placeholder="Qty"
                        disabled={submitting}
                        required
                    />
                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                            <span className="text-slate-400 text-sm">$</span>
                        </div>
                        <input
                            type="number"
                            step="0.01"
                            value={newAvgCost}
                            onChange={(e) => setNewAvgCost(e.target.value)}
                            className="pl-8 pr-4 py-2 w-32 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:text-white outline-none transition-all"
                            placeholder="Avg Cost"
                            disabled={submitting}
                            required
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={submitting}
                        className="flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white rounded-md p-2 shadow-sm transition-colors disabled:opacity-50"
                    >
                        {submitting ? <RefreshCcw className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
                    </button>
                </form>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead>
                            {/* Grouped Headers to separate Market vs Analyst data */}
                            <tr className="bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-semibold text-xs uppercase tracking-wider">
                                <th colSpan={3} className="px-6 py-3 text-left">Holding Details</th>
                                <th colSpan={4} className="px-6 py-3 text-center border-l border-slate-200 dark:border-slate-700 bg-blue-50/50 dark:bg-blue-900/10 text-blue-800 dark:text-blue-300">Market Data</th>
                                <th colSpan={4} className="px-6 py-3 text-center border-l border-slate-200 dark:border-slate-700 bg-violet-50/50 dark:bg-violet-900/10 text-violet-800 dark:text-violet-300">Target Estimates (5Y)</th>
                                <th className="px-6 py-3 text-right border-l border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800"></th>
                            </tr>
                            <tr className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 font-medium">
                                {/* Holding */}
                                <th className="px-6 py-4 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors group" onClick={() => requestSort('ticker')}>
                                    <div className="flex items-center">Company <SortIndicator columnKey="ticker" /></div>
                                </th>
                                <th className="px-6 py-4 text-right cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors group" onClick={() => requestSort('qty')}>
                                    <div className="flex items-center justify-end">Qty <SortIndicator columnKey="qty" /></div>
                                </th>
                                <th className="px-6 py-4 text-right cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors group" onClick={() => requestSort('avg_cost')}>
                                    <div className="flex items-center justify-end">Avg Cost <SortIndicator columnKey="avg_cost" /></div>
                                </th>

                                {/* Market */}
                                <th className="px-6 py-4 text-right border-l border-slate-200 dark:border-slate-700 bg-blue-50/30 dark:bg-blue-900/5 cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900/20 transition-colors group" onClick={() => requestSort('price')}>
                                    <div className="flex items-center justify-end">Price <SortIndicator columnKey="price" /></div>
                                </th>
                                <th className="px-6 py-4 text-right bg-blue-50/30 dark:bg-blue-900/5 cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900/20 transition-colors group" onClick={() => requestSort('forward_pe')}>
                                    <div className="flex items-center justify-end">Fwd P/E <SortIndicator columnKey="forward_pe" /></div>
                                </th>
                                <th className="px-6 py-4 text-right bg-blue-50/30 dark:bg-blue-900/5 cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900/20 transition-colors group" onClick={() => requestSort('total_value')}>
                                    <div className="flex items-center justify-end">Total Value <SortIndicator columnKey="total_value" /></div>
                                </th>
                                <th className="px-6 py-4 text-right bg-blue-50/30 dark:bg-blue-900/5 cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900/20 transition-colors group" onClick={() => requestSort('pl_pct')}>
                                    <div className="flex items-center justify-end">P/L (%) <SortIndicator columnKey="pl_pct" /></div>
                                </th>

                                {/* Analyst */}
                                <th className="px-6 py-4 text-right border-l border-slate-200 dark:border-slate-700 bg-violet-50/30 dark:bg-violet-900/5 cursor-pointer hover:bg-violet-100 dark:hover:bg-violet-900/20 transition-colors group" onClick={() => requestSort('target_pe')}>
                                    <div className="flex items-center justify-end">Tgt P/E <SortIndicator columnKey="target_pe" /></div>
                                </th>
                                <th className="px-6 py-4 text-right bg-violet-50/30 dark:bg-violet-900/5 cursor-pointer hover:bg-violet-100 dark:hover:bg-violet-900/20 transition-colors group" onClick={() => requestSort('target_eps')}>
                                    <div className="flex items-center justify-end">Tgt EPS <SortIndicator columnKey="target_eps" /></div>
                                </th>
                                <th className="px-6 py-4 text-right bg-violet-50/30 dark:bg-violet-900/5 cursor-pointer hover:bg-violet-100 dark:hover:bg-violet-900/20 transition-colors group" onClick={() => requestSort('yield')}>
                                    <div className="flex items-center justify-end">Yield <SortIndicator columnKey="yield" /></div>
                                </th>
                                <th className="px-6 py-4 text-right bg-violet-50/30 dark:bg-violet-900/5 font-bold cursor-pointer hover:bg-violet-100 dark:hover:bg-violet-900/20 transition-colors group" onClick={() => requestSort('irr')}>
                                    <div className="flex items-center justify-end text-slate-900 dark:text-white">5Y IRR <SortIndicator columnKey="irr" /></div>
                                </th>
                                <th className="px-6 py-4 text-right border-l border-slate-200 dark:border-slate-700 bg-slate-50/10 dark:bg-slate-800/5">Actions</th>
                            </tr>
                        </thead>

                        <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                            {sortedItems.map((item) => {
                                const pl = calculatePL(item);
                                const plPct = calculatePLPct(item);

                                return (
                                    <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group">
                                        {/* Holding Details */}
                                        <td className="px-6 py-4">
                                            <Link href={`/stock/${item.stock_details.ticker}`} className="flex items-center gap-3 hover:opacity-80 transition-opacity">
                                                <div className="w-8 h-8 rounded bg-slate-100 dark:bg-slate-800 flex items-center justify-center font-bold text-slate-700 dark:text-slate-300 shrink-0 text-xs text-center border border-slate-200 dark:border-slate-700">
                                                    {item.stock_details.ticker}
                                                </div>
                                                <div className="text-slate-900 dark:text-white font-semibold text-sm truncate max-w-[120px] group-hover:text-blue-600 dark:group-hover:text-blue-400">
                                                    {item.stock_details.company_name}
                                                </div>
                                            </Link>
                                        </td>
                                        <td
                                            className="px-6 py-4 text-right font-medium text-slate-700 dark:text-slate-300 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                                            onClick={() => startEditing(item.id, 'quantity', item.quantity)}
                                        >
                                            {editingCell?.id === item.id && editingCell?.field === 'quantity' ? (
                                                <input
                                                    type="number"
                                                    value={editValue}
                                                    onChange={(e) => setEditValue(e.target.value)}
                                                    onBlur={saveEdit}
                                                    onKeyDown={handleKeyDown}
                                                    autoFocus
                                                    className="w-20 px-2 py-1 text-right text-sm bg-white dark:bg-slate-900 border border-blue-500 rounded outline-none w-full"
                                                />
                                            ) : (
                                                item.quantity
                                            )}
                                        </td>
                                        <td
                                            className="px-6 py-4 text-right text-slate-600 dark:text-slate-400 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                                            onClick={() => startEditing(item.id, 'average_cost', item.average_cost)}
                                        >
                                            {editingCell?.id === item.id && editingCell?.field === 'average_cost' ? (
                                                <div className="flex items-center justify-end w-full">
                                                    <span className="mr-1">$</span>
                                                    <input
                                                        type="number"
                                                        step="0.01"
                                                        value={editValue}
                                                        onChange={(e) => setEditValue(e.target.value)}
                                                        onBlur={saveEdit}
                                                        onKeyDown={handleKeyDown}
                                                        autoFocus
                                                        className="w-24 px-2 py-1 text-right text-sm bg-white dark:bg-slate-900 border border-blue-500 rounded outline-none"
                                                    />
                                                </div>
                                            ) : (
                                                `$${item.average_cost.toFixed(2)}`
                                            )}
                                        </td>

                                        {/* Market Data */}
                                        <td className="px-6 py-4 text-right font-medium text-slate-900 dark:text-white border-l border-slate-200 dark:border-slate-700 bg-blue-50/10 dark:bg-blue-900/5">
                                            ${item.stock_details.current_price?.toFixed(2) || '0.00'}
                                        </td>
                                        <td className="px-6 py-4 text-right font-medium text-blue-700 dark:text-blue-400 bg-blue-50/10 dark:bg-blue-900/5">
                                            {item.stock_details.forward_pe > 0 ? `${item.stock_details.forward_pe.toFixed(1)}x` : '-'}
                                        </td>
                                        <td className="px-6 py-4 text-right font-medium text-slate-900 dark:text-white bg-blue-50/10 dark:bg-blue-900/5">
                                            ${calculateCurrentValue(item).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </td>
                                        <td className="px-6 py-4 text-right bg-blue-50/10 dark:bg-blue-900/5">
                                            <div className={`inline-flex items-center gap-1 font-semibold ${pl >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                                {pl >= 0 ? '+' : ''}{plPct.toFixed(2)}%
                                            </div>
                                        </td>

                                        {/* Analyst Data */}
                                        <td className="px-6 py-4 text-right font-medium text-violet-700 dark:text-violet-400 border-l border-slate-200 dark:border-slate-700 bg-violet-50/10 dark:bg-violet-900/5">
                                            {item.stock_details.consensus_target_pe > 0 ? `${item.stock_details.consensus_target_pe.toFixed(1)}x` : '-'}
                                        </td>
                                        <td className="px-6 py-4 text-right font-medium text-slate-700 dark:text-slate-300 bg-violet-50/10 dark:bg-violet-900/5">
                                            {item.stock_details.consensus_target_eps > 0 ? `$${item.stock_details.consensus_target_eps.toFixed(2)}` : '-'}
                                        </td>
                                        <td className="px-6 py-4 text-right font-medium text-slate-700 dark:text-slate-300 bg-violet-50/10 dark:bg-violet-900/5">
                                            {item.stock_details.consensus_yield > 0 ? `${item.stock_details.consensus_yield.toFixed(1)}%` : '-'}
                                        </td>
                                        <td className={`px-6 py-4 text-right font-bold border-l border-slate-200 dark:border-slate-700 ${calculateIRR(item) >= 15 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-900 dark:text-white'}`}>
                                            {calculateIRR(item).toFixed(2)}%
                                        </td>
                                        <td className="px-6 py-4 text-right border-l border-slate-200 dark:border-slate-700 bg-slate-50/10 dark:bg-slate-800/5">
                                            <button
                                                onClick={() => handleDeleteItem(item.id)}
                                                className="text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors p-1 rounded-md hover:bg-rose-50 dark:hover:bg-rose-900/20"
                                                title="Remove from portfolio"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                            {loading && (
                                <tr>
                                    <td colSpan={12} className="px-6 py-12 text-center text-slate-500 dark:text-slate-400">
                                        <RefreshCcw className="w-6 h-6 animate-spin mx-auto mb-2" />
                                        Loading portfolio context...
                                    </td>
                                </tr>
                            )}
                            {!loading && items.length === 0 && (
                                <tr>
                                    <td colSpan={12} className="px-6 py-12 text-center text-slate-500 dark:text-slate-400">
                                        Your portfolio is empty. Add a position to get started.
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

"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { Plus, RefreshCcw, Trash2, ChevronUp, ChevronDown, ArrowUpDown, UploadCloud } from "lucide-react";

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
    ticker: string | null;
    isin: string | null;
    asset_type: string | null;
    specific_type: string | null;
    quantity: number;
    average_cost: number;
    price: number | null;
    currency: string | null;
    market_value: number | null;
    chg_pct_1d: number | null;
    pnl_1d: number | null;
    pe_next_12_months: number | null;
    yield_to_worst: number | null;
    duration: number | null;
    total_cost: number;
    current_value: number;
    unrealized_pl: number;
    unrealized_pl_pct: number;
    stock_details: StockDetails | null;
}

interface Snapshot {
    id: number;
    date: string;
    created_at: string;
}

export default function PortfolioPage() {
    const [items, setItems] = useState<PortfolioItem[]>([]);
    const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
    const [selectedSnapshotId, setSelectedSnapshotId] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);

    // Sort config
    const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>({ key: 'current_value', direction: 'desc' });

    // Edit state
    const [editingCell, setEditingCell] = useState<{ id: number, field: string } | null>(null);
    const [editValue, setEditValue] = useState("");

    const fileInputRef = useRef<HTMLInputElement>(null);

    const fetchSnapshots = async () => {
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/snapshots/`);
            if (res.ok) {
                const data = await res.json();
                setSnapshots(data);
                if (data.length > 0 && selectedSnapshotId === null) {
                    setSelectedSnapshotId(data[0].id);
                }
            }
        } catch (error) {
            console.error("Failed to fetch snapshots:", error);
        }
    };

    const fetchItems = async (snapshotId?: number | null) => {
        setLoading(true);
        try {
            let url = `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/portfolio/`;
            if (snapshotId) {
                url += `?snapshot_id=${snapshotId}`;
            }
            const res = await fetch(url);
            if (res.ok) {
                const data = await res.json();
                setItems(data);
            }
        } catch (error) {
            console.error("Failed to fetch portfolio:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSnapshots();
    }, []);

    useEffect(() => {
        if (selectedSnapshotId !== null || snapshots.length === 0) {
            fetchItems(selectedSnapshotId);
        }
    }, [selectedSnapshotId]);

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploading(true);
        const formData = new FormData();
        formData.append("file", file);

        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/snapshots/upload_excel/`, {
                method: 'POST',
                body: formData, // fetch will automatically set the correct Content-Type for FormData
            });

            if (res.ok) {
                const data = await res.json();
                await fetchSnapshots();
                setSelectedSnapshotId(data.snapshot_id); // switch to the new one
            } else {
                const error = await res.json();
                alert(error.error || "Failed to upload file");
            }
        } catch (error) {
            console.error("Error uploading file:", error);
            alert("File upload error");
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };

    const handleUpdateItem = async (id: number, field: 'average_cost', value: string) => {
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
        if (!confirm("Are you sure you want to remove this item?")) return;

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

    // Calculate generic IRR for Equities
    const calculateEquityIRR = (item: PortfolioItem) => {
        if (!item.stock_details) return 0;
        const yieldPct = item.stock_details.consensus_yield || 0;
        const currentPrice = item.price || item.stock_details.current_price || 0;
        const targetPrice = (item.stock_details.consensus_target_pe || 0) * (item.stock_details.consensus_target_eps || 0);

        if (currentPrice > 0 && targetPrice > 0) {
            const priceIRR = (Math.pow(targetPrice / currentPrice, 1 / 5) - 1) * 100;
            return priceIRR + yieldPct;
        }
        return 0;
    };

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

    // Split arrays
    const equities = useMemo(() => items.filter(i => i.asset_type === 'Equity' || i.stock_details), [items]);
    const fixedIncome = useMemo(() => items.filter(i => i.asset_type === 'Fixed Income' || i.asset_type === 'Treasury' || i.asset_type === 'EM Sovereign'), [items]);

    // Sort logic generic wrapper
    const sortItems = (arr: PortfolioItem[]) => {
        if (!sortConfig) return arr;
        return [...arr].sort((a, b) => {
            let aValue: any = 0; let bValue: any = 0;
            switch (sortConfig.key) {
                case 'identifier': aValue = a.ticker || a.isin || ''; bValue = b.ticker || b.isin || ''; break;
                case 'qty': aValue = a.quantity; bValue = b.quantity; break;
                case 'avg_cost': aValue = a.average_cost; bValue = b.average_cost; break;
                case 'price': aValue = a.price || 0; bValue = b.price || 0; break;
                case 'current_value': aValue = a.current_value; bValue = b.current_value; break;
                case 'pnl_1d': aValue = a.pnl_1d || 0; bValue = b.pnl_1d || 0; break;
                case 'chg_pct_1d': aValue = a.chg_pct_1d || 0; bValue = b.chg_pct_1d || 0; break;
                case 'duration': aValue = a.duration || 0; bValue = b.duration || 0; break;
                case 'ytw': aValue = a.yield_to_worst || 0; bValue = b.yield_to_worst || 0; break;
                case 'total_pnl_pct': aValue = a.unrealized_pl_pct || 0; bValue = b.unrealized_pl_pct || 0; break;
                case 'target_pe': aValue = a.stock_details?.consensus_target_pe || 0; bValue = b.stock_details?.consensus_target_pe || 0; break;
                case 'pe_next_12_months': aValue = a.pe_next_12_months || 0; bValue = b.pe_next_12_months || 0; break;
                case 'target_eps': aValue = a.stock_details?.consensus_target_eps || 0; bValue = b.stock_details?.consensus_target_eps || 0; break;
                case 'irr': aValue = calculateEquityIRR(a); bValue = calculateEquityIRR(b); break;
            }
            if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
    };

    const startEditing = (id: number, field: string, currentValue: number) => {
        setEditingCell({ id, field });
        setEditValue(currentValue.toString());
    };

    const saveEdit = () => {
        if (editingCell) {
            handleUpdateItem(editingCell.id, editingCell.field as 'average_cost', editValue);
        }
        setEditingCell(null);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') saveEdit();
        else if (e.key === 'Escape') setEditingCell(null);
    };

    return (
        <div className="max-w-7xl mx-auto pb-12">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Portfolio Snapshots</h1>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Upload Bloomberg excel files to track your Equities and Fixed Income.</p>
                </div>

                <div className="flex items-center gap-4 flex-wrap md:flex-nowrap bg-white dark:bg-slate-900 p-2 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm">
                    {/* Snapshot Selector */}
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-slate-500 pl-2">As of:</span>
                        <select
                            className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-sm rounded focus:ring-blue-500 focus:border-blue-500 block w-full p-2"
                            value={selectedSnapshotId || ""}
                            onChange={(e) => setSelectedSnapshotId(Number(e.target.value))}
                            disabled={snapshots.length === 0}
                        >
                            {snapshots.length === 0 && <option value="">No snapshots</option>}
                            {snapshots.map(snap => (
                                <option key={snap.id} value={snap.id}>{snap.date} (ID: {snap.id})</option>
                            ))}
                        </select>
                    </div>

                    <div className="h-6 w-px bg-slate-200 dark:bg-slate-700 mx-2 hidden md:block"></div>

                    {/* Upload Button */}
                    <label className="cursor-pointer flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md px-4 py-2 text-sm shadow-sm transition-colors whitespace-nowrap">
                        {uploading ? <RefreshCcw className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
                        {uploading ? 'Processing...' : 'Upload Excel'}
                        <input
                            type="file"
                            accept=".xlsx, .xls"
                            className="hidden"
                            ref={fileInputRef}
                            onChange={handleFileUpload}
                            disabled={uploading}
                        />
                    </label>
                </div>
            </div>

            {loading ? (
                <div className="py-20 text-center text-slate-500 dark:text-slate-400 flex flex-col items-center">
                    <RefreshCcw className="w-8 h-8 animate-spin mb-4 text-blue-500" />
                    <p>Loading portfolio items...</p>
                </div>
            ) : items.length === 0 ? (
                <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-12 text-center shadow-sm">
                    <UploadCloud className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-slate-900 dark:text-white">No Portfolio Data</h3>
                    <p className="text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">Upload a Bloomberg portfolio export to start analyzing your allocations and returns.</p>
                </div>
            ) : (
                <div className="space-y-10">
                    {/* EQUITIES TABLE */}
                    {equities.length > 0 && (
                        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20 flex justify-between items-center">
                                <h2 className="text-lg font-bold text-slate-900 dark:text-white">Equities</h2>
                                <span className="text-sm font-medium text-slate-500">{equities.length} Positions</span>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-left">
                                    <thead>
                                        <tr className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-semibold text-xs tracking-wider">
                                            <th className="px-4 py-3 cursor-pointer group" onClick={() => requestSort('identifier')}>Ticker <SortIndicator columnKey="identifier" /></th>
                                            <th className="px-4 py-3 text-right cursor-pointer group" onClick={() => requestSort('qty')}>Qty <SortIndicator columnKey="qty" /></th>
                                            <th className="px-4 py-3 text-right cursor-pointer group" onClick={() => requestSort('avg_cost')}>Avg Cost <SortIndicator columnKey="avg_cost" /></th>
                                            <th className="px-4 py-3 text-right cursor-pointer group" onClick={() => requestSort('price')}>Price <SortIndicator columnKey="price" /></th>
                                            <th className="px-4 py-3 text-right cursor-pointer group font-bold" onClick={() => requestSort('current_value')}>Market Value <SortIndicator columnKey="current_value" /></th>
                                            <th className="px-4 py-3 text-right cursor-pointer group" onClick={() => requestSort('chg_pct_1d')}>1D % <SortIndicator columnKey="chg_pct_1d" /></th>
                                            <th className="px-4 py-3 text-right cursor-pointer group" onClick={() => requestSort('pnl_1d')}>1D PnL <SortIndicator columnKey="pnl_1d" /></th>
                                            <th className="px-4 py-3 text-right cursor-pointer group" onClick={() => requestSort('total_pnl_pct')}>Total PnL % <SortIndicator columnKey="total_pnl_pct" /></th>
                                            <th className="px-4 py-3 text-right cursor-pointer group" onClick={() => requestSort('pe_next_12_months')}>NTM P/E <SortIndicator columnKey="pe_next_12_months" /></th>
                                            <th className="px-4 py-3 text-right cursor-pointer group bg-violet-50/30 dark:bg-violet-900/10" onClick={() => requestSort('target_pe')}>Tgt P/E <SortIndicator columnKey="target_pe" /></th>
                                            <th className="px-4 py-3 text-right cursor-pointer group bg-violet-50/30 dark:bg-violet-900/10" onClick={() => requestSort('target_eps')}>Tgt EPS <SortIndicator columnKey="target_eps" /></th>
                                            <th className="px-4 py-3 text-right cursor-pointer group bg-violet-50/30 dark:bg-violet-900/10" onClick={() => requestSort('irr')}>5Y IRR <SortIndicator columnKey="irr" /></th>
                                            <th className="px-4 py-3"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                        {sortItems(equities).map(item => (
                                            <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                                <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">
                                                    {item.stock_details ? (
                                                        <Link href={`/stock/${item.stock_details.ticker}`} className="hover:text-blue-600 flex items-center gap-2">
                                                            {item.ticker}
                                                        </Link>
                                                    ) : item.ticker || item.isin}
                                                </td>
                                                <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-400 font-medium">{item.quantity.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                                                <td className="px-4 py-3 text-right cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded" onClick={() => startEditing(item.id, 'average_cost', item.average_cost)}>
                                                    {editingCell?.id === item.id ? (
                                                        <input
                                                            type="number" step="0.01" value={editValue}
                                                            onChange={e => setEditValue(e.target.value)} onBlur={saveEdit} onKeyDown={handleKeyDown} autoFocus
                                                            className="w-20 px-1 py-0.5 text-right text-sm border-blue-500 rounded outline-none text-black"
                                                        />
                                                    ) : (
                                                        <span className="border-b border-dashed border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300">{item.average_cost > 0 ? `$${item.average_cost.toFixed(2)}` : 'Edit'}</span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 text-right font-medium text-slate-900 dark:text-white">${item.price?.toFixed(2) || '0.00'}</td>
                                                <td className="px-4 py-3 text-right font-bold text-slate-900 dark:text-white">${item.current_value.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                                                <td className={`px-4 py-3 text-right font-medium ${(item.chg_pct_1d || 0) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                                    {(item.chg_pct_1d || 0) > 0 ? '+' : ''}{(item.chg_pct_1d || 0).toFixed(2)}%
                                                </td>
                                                <td className={`px-4 py-3 text-right font-medium ${(item.pnl_1d || 0) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                                    {(item.pnl_1d || 0) > 0 ? '+' : ''}{Math.round(item.pnl_1d || 0).toLocaleString()}
                                                </td>
                                                <td className={`px-4 py-3 text-right font-bold ${item.unrealized_pl_pct >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                                    {item.average_cost > 0 ? `${item.unrealized_pl_pct > 0 ? '+' : ''}${item.unrealized_pl_pct.toFixed(1)}%` : '-'}
                                                </td>
                                                <td className="px-4 py-3 text-right font-medium text-slate-900 dark:text-white">
                                                    {item.pe_next_12_months ? `${item.pe_next_12_months.toFixed(1)}x` : '-'}
                                                </td>
                                                <td className="px-4 py-3 text-right text-violet-700 dark:text-violet-400 bg-violet-50/10 dark:bg-violet-900/5 lg:w-20">{item.stock_details?.consensus_target_pe ? `${item.stock_details.consensus_target_pe.toFixed(1)}x` : '-'}</td>
                                                <td className="px-4 py-3 text-right text-violet-700 dark:text-violet-400 bg-violet-50/10 dark:bg-violet-900/5 lg:w-20">{item.stock_details?.consensus_target_eps ? `$${item.stock_details.consensus_target_eps.toFixed(2)}` : '-'}</td>
                                                <td className={`px-4 py-3 text-right font-bold bg-violet-50/10 dark:bg-violet-900/5 lg:w-24 ${calculateEquityIRR(item) >= 15 ? 'text-emerald-600' : 'text-slate-900 dark:text-white'}`}>
                                                    {calculateEquityIRR(item) > 0 ? `${calculateEquityIRR(item).toFixed(1)}%` : '-'}
                                                </td>
                                                <td className="px-2 py-3 text-right">
                                                    <button onClick={() => handleDeleteItem(item.id)} className="text-slate-400 hover:text-rose-500">
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* FIXED INCOME TABLE */}
                    {fixedIncome.length > 0 && (
                        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20 flex justify-between items-center">
                                <h2 className="text-lg font-bold text-slate-900 dark:text-white">Fixed Income</h2>
                                <span className="text-sm font-medium text-slate-500">{fixedIncome.length} Positions</span>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-left">
                                    <thead>
                                        <tr className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-semibold text-xs tracking-wider">
                                            <th className="px-4 py-3 cursor-pointer group" onClick={() => requestSort('identifier')}>Identifier <SortIndicator columnKey="identifier" /></th>
                                            <th className="px-4 py-3 text-right cursor-pointer group" onClick={() => requestSort('qty')}>Face Value (Qty) <SortIndicator columnKey="qty" /></th>
                                            <th className="px-4 py-3 text-right cursor-pointer group" onClick={() => requestSort('avg_cost')}>Avg Cost <SortIndicator columnKey="avg_cost" /></th>
                                            <th className="px-4 py-3 text-right cursor-pointer group" onClick={() => requestSort('price')}>Px Last <SortIndicator columnKey="price" /></th>
                                            <th className="px-4 py-3 text-right cursor-pointer group font-bold" onClick={() => requestSort('current_value')}>Market Value <SortIndicator columnKey="current_value" /></th>
                                            <th className="px-4 py-3 text-right cursor-pointer group" onClick={() => requestSort('chg_pct_1d')}>1D % <SortIndicator columnKey="chg_pct_1d" /></th>
                                            <th className="px-4 py-3 text-right cursor-pointer group" onClick={() => requestSort('pnl_1d')}>1D PnL <SortIndicator columnKey="pnl_1d" /></th>
                                            <th className="px-4 py-3 text-right cursor-pointer group" onClick={() => requestSort('total_pnl_pct')}>Total PnL % <SortIndicator columnKey="total_pnl_pct" /></th>
                                            <th className="px-4 py-3 text-right cursor-pointer group bg-amber-50/30 dark:bg-amber-900/10" onClick={() => requestSort('ytw')}>Yield to Worst <SortIndicator columnKey="ytw" /></th>
                                            <th className="px-4 py-3 text-right cursor-pointer group bg-amber-50/30 dark:bg-amber-900/10" onClick={() => requestSort('duration')}>Duration <SortIndicator columnKey="duration" /></th>
                                            <th className="px-4 py-3"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                        {sortItems(fixedIncome).map(item => (
                                            <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                                <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white max-w-[200px] truncate" title={item.ticker || item.isin || 'N/A'}>
                                                    {item.ticker ? item.ticker.replace('Corp', '').replace('@', ' ') : item.isin}
                                                    <div className="text-xs text-slate-500 font-normal">{item.specific_type}</div>
                                                </td>
                                                <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-400 font-medium">{item.quantity.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                                                <td className="px-4 py-3 text-right cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded" onClick={() => startEditing(item.id, 'average_cost', item.average_cost)}>
                                                    {editingCell?.id === item.id ? (
                                                        <input
                                                            type="number" step="0.01" value={editValue}
                                                            onChange={e => setEditValue(e.target.value)} onBlur={saveEdit} onKeyDown={handleKeyDown} autoFocus
                                                            className="w-20 px-1 py-0.5 text-right text-sm border-blue-500 rounded outline-none text-black"
                                                        />
                                                    ) : (
                                                        <span className="border-b border-dashed border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300">{item.average_cost > 0 ? `$${item.average_cost.toFixed(2)}` : 'Edit'}</span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 text-right font-medium text-slate-900 dark:text-white">{item.price?.toFixed(2) || '-'}</td>
                                                <td className="px-4 py-3 text-right font-bold text-slate-900 dark:text-white">${item.current_value.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                                                <td className={`px-4 py-3 text-right font-medium ${(item.chg_pct_1d || 0) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                                    {(item.chg_pct_1d || 0) > 0 ? '+' : ''}{(item.chg_pct_1d || 0).toFixed(2)}%
                                                </td>
                                                <td className={`px-4 py-3 text-right font-medium ${(item.pnl_1d || 0) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                                    {(item.pnl_1d || 0) > 0 ? '+' : ''}{Math.round(item.pnl_1d || 0).toLocaleString()}
                                                </td>
                                                <td className={`px-4 py-3 text-right font-bold ${item.unrealized_pl_pct >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                                    {item.average_cost > 0 ? `${item.unrealized_pl_pct > 0 ? '+' : ''}${item.unrealized_pl_pct.toFixed(1)}%` : '-'}
                                                </td>
                                                <td className="px-4 py-3 text-right font-bold text-amber-700 dark:text-amber-400 bg-amber-50/10 dark:bg-amber-900/5">{item.yield_to_worst ? `${(item.yield_to_worst * 100).toFixed(2)}%` : '-'}</td>
                                                <td className="px-4 py-3 text-right font-medium text-amber-700 dark:text-amber-400 bg-amber-50/10 dark:bg-amber-900/5">{item.duration ? item.duration.toFixed(2) : '-'}</td>
                                                <td className="px-2 py-3 text-right">
                                                    <button onClick={() => handleDeleteItem(item.id)} className="text-slate-400 hover:text-rose-500">
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

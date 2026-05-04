"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { UploadCloud, RefreshCcw } from "lucide-react";
import { authFetch } from "@/lib/authFetch";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type StockEntry = {
    stock: string;
    rows: number;
    since: string;
    latest: string;
};

type HistogramBucket = {
    lower: number;
    upper: number;
    label: string;
    count: number;
};

type Analysis = {
    stock: string;
    years: number;
    band_pct: number;
    current_pe: number;
    current_pe_date: string;
    lower_pe: number;
    upper_pe: number;
    data_since: string;
    data_until: string;
    total_observations: number;
    occurrences_in_band: number;
    percentile_rank: number | null;
    avg_forward_return: number | null;
    win_rate: number | null;
    max_drawdown_in_band: number | null;
    histogram: HistogramBucket[];
};

const fmtPct = (v: number | null | undefined, digits = 1) =>
    v === null || v === undefined || Number.isNaN(v) ? "—" : `${(v * 100).toFixed(digits)}%`;
const fmtMult = (v: number | null | undefined, digits = 1) =>
    v === null || v === undefined || Number.isNaN(v) ? "—" : `${v.toFixed(digits)}x`;
const fmtDate = (s: string | null | undefined) => {
    if (!s) return "—";
    try {
        const d = new Date(s);
        return d.toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "numeric" });
    } catch { return s; }
};

export default function AlphaPage() {
    const [stocks, setStocks] = useState<StockEntry[]>([]);
    const [selectedStock, setSelectedStock] = useState<string>("");
    const [years, setYears] = useState<number>(1);
    const [bandPct, setBandPct] = useState<number>(5);
    const [analysis, setAnalysis] = useState<Analysis | null>(null);
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const fetchStocks = useCallback(async () => {
        try {
            const res = await authFetch(`${API}/api/alpha/stocks/`);
            if (res.ok) {
                const data: StockEntry[] = await res.json();
                setStocks(data);
                if (data.length > 0 && !selectedStock) {
                    setSelectedStock(data[0].stock);
                }
            }
        } catch (e) {
            console.error("Failed to fetch alpha stocks:", e);
        }
    }, [selectedStock]);

    const fetchAnalysis = useCallback(async () => {
        if (!selectedStock) return;
        setLoading(true);
        setError(null);
        try {
            const url = `${API}/api/alpha/analysis/?stock=${encodeURIComponent(selectedStock)}&years=${years}&band_pct=${bandPct}`;
            const res = await authFetch(url);
            if (res.ok) {
                const data: Analysis = await res.json();
                setAnalysis(data);
            } else {
                const j = await res.json().catch(() => ({}));
                setError(j.error || `HTTP ${res.status}`);
                setAnalysis(null);
            }
        } catch (e) {
            console.error("Failed to fetch alpha analysis:", e);
            setError(String(e));
        } finally {
            setLoading(false);
        }
    }, [selectedStock, years, bandPct]);

    useEffect(() => { fetchStocks(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => { fetchAnalysis(); }, [fetchAnalysis]);

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploading(true);
        setError(null);
        const fd = new FormData();
        fd.append("file", file);
        try {
            const res = await authFetch(`${API}/api/alpha/upload_excel/`, { method: "POST", body: fd });
            if (res.ok) {
                const data = await res.json();
                alert(data.message || "Upload complete");
                await fetchStocks();
                await fetchAnalysis();
            } else {
                const j = await res.json().catch(() => ({}));
                alert(j.error || `Upload failed (HTTP ${res.status})`);
            }
        } catch (err) {
            console.error("Upload error:", err);
            alert("Upload failed");
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };

    return (
        <div className="max-w-7xl mx-auto pb-12">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Alpha — P/E Band Forward Returns</h1>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                        Historical forward-return distribution conditional on the current P/E falling within a chosen band.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={fetchAnalysis}
                        className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                    >
                        <RefreshCcw className="w-4 h-4" />Refresh
                    </button>
                    <input ref={fileInputRef} type="file" accept=".xlsx,.xlsm" onChange={handleUpload} className="hidden" />
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading}
                        className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 transition-colors"
                    >
                        <UploadCloud className="w-4 h-4" />{uploading ? "Uploading…" : "Upload Excel"}
                    </button>
                </div>
            </div>

            {error && (
                <div className="mb-4 p-3 rounded-lg border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-900/20 text-sm text-rose-700 dark:text-rose-300">
                    {error}
                </div>
            )}

            {/* Inputs + Stats / Histogram layout */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">

                {/* Left column: inputs + stats */}
                <div className="lg:col-span-4 space-y-4">

                    {/* Inputs card */}
                    <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-4 space-y-3">
                        <div className="flex items-center justify-between">
                            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Stock</label>
                            <select
                                value={selectedStock}
                                onChange={(e) => setSelectedStock(e.target.value)}
                                className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-sm rounded px-2 py-1 min-w-[8rem]"
                            >
                                {stocks.length === 0 && <option value="">(no data)</option>}
                                {stocks.map(s => <option key={s.stock} value={s.stock}>{s.stock}</option>)}
                            </select>
                        </div>

                        <div className="flex items-center justify-between">
                            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Time of Performance (years)</label>
                            <input
                                type="number" min={0.25} step={0.25} value={years}
                                onChange={(e) => setYears(Number(e.target.value) || 1)}
                                className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-sm rounded px-2 py-1 w-24 text-right"
                            />
                        </div>

                        <div className="border-t border-slate-200 dark:border-slate-800 pt-3 space-y-2">
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-slate-600 dark:text-slate-400">Current P/E</span>
                                <span className="text-sm font-semibold text-slate-900 dark:text-white">{fmtMult(analysis?.current_pe)}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <label className="text-sm text-blue-600 dark:text-blue-400">Interval band P/E</label>
                                <div className="flex items-center gap-1">
                                    <input
                                        type="number" min={0} step={0.5} value={bandPct}
                                        onChange={(e) => setBandPct(Number(e.target.value) || 0)}
                                        className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-sm rounded px-2 py-1 w-20 text-right"
                                    />
                                    <span className="text-sm text-slate-500">%</span>
                                </div>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-blue-600 dark:text-blue-400">Lower band P/E</span>
                                <span className="text-sm font-semibold text-slate-900 dark:text-white">{fmtMult(analysis?.lower_pe)}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-blue-600 dark:text-blue-400">Upper band P/E</span>
                                <span className="text-sm font-semibold text-slate-900 dark:text-white">{fmtMult(analysis?.upper_pe)}</span>
                            </div>
                        </div>
                    </div>

                    {/* Performance Stats card */}
                    <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-4">
                        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-900 dark:text-white border-b border-slate-200 dark:border-slate-800 pb-2 mb-3">Performance Stats</h2>
                        <div className="space-y-2">
                            <StatRow label="Occurrences in Band" value={analysis?.occurrences_in_band?.toString() ?? "—"} />
                            <StatRow label="Percentile Rank" value={analysis?.percentile_rank == null ? "—" : analysis.percentile_rank.toFixed(3)} />
                            <StatRow label="Data Since" value={fmtDate(analysis?.data_since)} />
                            <StatRow label="Avg. Forward Return" value={fmtPct(analysis?.avg_forward_return, 1)} />
                            <StatRow label="Win Rate (%)" value={fmtPct(analysis?.win_rate, 0)} highlight />
                            <StatRow label="Max Drawdown in Band" value={fmtPct(analysis?.max_drawdown_in_band, 1)} />
                        </div>
                    </div>
                </div>

                {/* Right column: histogram */}
                <div className="lg:col-span-8">
                    <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-4 h-full">
                        <h2 className="text-base font-bold text-rose-500 text-center mb-2">Count of return in each bracket</h2>
                        <div style={{ width: "100%", height: 420 }}>
                            <ResponsiveContainer>
                                <BarChart data={analysis?.histogram || []} margin={{ top: 10, right: 16, left: 0, bottom: 30 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                                    <XAxis
                                        dataKey="label"
                                        tick={{ fill: "#64748b", fontSize: 10 }}
                                        tickFormatter={(label: string) => {
                                            const m = /^\[(-?\d+)%/.exec(label);
                                            return m ? `${m[1]}%` : label;
                                        }}
                                        angle={-45}
                                        textAnchor="end"
                                        interval={0}
                                        height={48}
                                        tickMargin={4}
                                        tickLine={false}
                                        axisLine={{ stroke: "#cbd5e1" }}
                                    />
                                    <YAxis
                                        tick={{ fill: "#64748b", fontSize: 11 }}
                                        tickLine={false}
                                        axisLine={false}
                                        allowDecimals={false}
                                    />
                                    <Tooltip
                                        formatter={(value) => [value as number, "Count"] as [number, string]}
                                        labelFormatter={(label: string) => {
                                            const m = /^\[(-?\d+)%,\s*(-?\d+)%\]/.exec(label);
                                            return m ? `Forward return: ${m[1]}% to ${m[2]}%` : `Bucket ${label}`;
                                        }}
                                        contentStyle={{ backgroundColor: "#1e293b", border: "none", borderRadius: 6, color: "#fff" }}
                                    />
                                    <Bar dataKey="count" fill="#1f4e79">
                                        {(analysis?.histogram || []).map((b, i) => (
                                            <Cell key={i} fill={b.lower < 0 ? "#b91c1c" : "#1f4e79"} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                        {loading && <p className="text-xs text-center text-slate-500 mt-2">Loading…</p>}
                        {!loading && analysis && analysis.occurrences_in_band === 0 && (
                            <p className="text-xs text-center text-slate-500 mt-2">No historical observations fell inside this P/E band — widen the interval %.</p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

function StatRow({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
    return (
        <div className={`flex items-center justify-between text-sm py-1 ${highlight ? "border border-slate-900 dark:border-white px-2 -mx-2 rounded" : ""}`}>
            <span className="text-slate-600 dark:text-slate-400">{label}</span>
            <span className="font-semibold text-slate-900 dark:text-white">{value}</span>
        </div>
    );
}

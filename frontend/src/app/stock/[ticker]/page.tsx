"use client";

import { useState, use, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, Save, TrendingUp, TrendingDown, RefreshCcw } from "lucide-react";
import ModelingTab from "@/components/ModelingTab";

export default function StockDetailPage({ params }: { params: Promise<{ ticker: string }> }) {
    const unwrappedParams = use(params);
    const ticker = unwrappedParams.ticker.toUpperCase();

    // Data State
    const [stock, setStock] = useState<{
        current_price: number;
        company_name: string;
        sector?: string;
        financials?: {
            date: string;
            revenue: number;
            op_income: number;
            net_income: number;
            cost_of_revenue: number;
            op_expense: number;
        }[];
        theses: {
            summary: string;
            conviction: number;
            estimates_5y?: {
                target_pe_multiple: number;
                target_eps: number;
                accumulated_dividends_5y: number;
            };
        }[];
    } | null>(null);
    const [activeTab, setActiveTab] = useState("overview");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // Form State
    const [peMultiple, setPeMultiple] = useState<number>(0);
    const [eps, setEps] = useState<number>(0);
    const [dividends, setDividends] = useState<number>(0);
    const [thesisText, setThesisText] = useState("");
    const [conviction, setConviction] = useState(3);

    useEffect(() => {
        const fetchStockData = async () => {
            try {
                const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/stocks/${ticker}/`);
                const data = await res.json();
                setStock(data);

                // If there's already a thesis (assuming first one is the current user's for now)
                if (data.theses && data.theses.length > 0) {
                    const thesis = data.theses[0];
                    setThesisText(thesis.summary);
                    setConviction(thesis.conviction);
                    if (thesis.estimates_5y) {
                        setPeMultiple(thesis.estimates_5y.target_pe_multiple);
                        setEps(thesis.estimates_5y.target_eps);
                        setDividends(thesis.estimates_5y.accumulated_dividends_5y);
                    }
                }
            } catch (error) {
                console.error("Failed to fetch stock detail:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchStockData();
    }, [ticker]);

    const handleSave = async () => {
        setSaving(true);
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/stocks/${ticker}/save_thesis/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    thesis: thesisText,
                    pe_multiple: peMultiple,
                    eps: eps,
                    dividends: dividends,
                    conviction: conviction
                })
            });

            if (res.ok) {
                alert("Estimates and thesis saved successfully!");
            } else {
                alert("Failed to save changes.");
            }
        } catch (error) {
            console.error("Error saving data:", error);
            alert("An error occurred while saving.");
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return <div className="max-w-5xl mx-auto py-20 text-center text-slate-500">Loading stock details...</div>;
    }

    if (!stock) {
        return <div className="max-w-5xl mx-auto py-20 text-center text-slate-500 font-bold">Stock not found.</div>;
    }

    const currentPrice = stock.current_price || 0;
    const companyName = stock.company_name || ticker;

    // Calcs
    const targetPrice = peMultiple * eps;
    const returnPct = currentPrice > 0 ? ((targetPrice / currentPrice) - 1) * 100 : 0;

    // Total IRR = Price IRR + Dividend Yield
    const priceIRR = currentPrice > 0 && targetPrice > 0 ? (Math.pow(targetPrice / currentPrice, 1 / 5) - 1) * 100 : 0;
    const irr = priceIRR + dividends;

    return (
        <div className="max-w-5xl mx-auto pb-12">
            <div className="mb-6">
                <Link href="/" className="inline-flex items-center text-sm font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors">
                    <ArrowLeft className="w-4 h-4 mr-1" />
                    Back to Watchlist
                </Link>
            </div>

            <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 mb-8">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">{ticker}</h1>
                        <span className="px-2.5 py-0.5 rounded-md text-xs font-semibold bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200">
                            {stock.sector || "Unknown"}
                        </span>
                    </div>
                    <p className="text-lg text-slate-600 dark:text-slate-300">{companyName}</p>
                </div>

                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-6 py-4 shadow-sm flex items-center gap-6">
                    <div>
                        <p className="text-sm text-slate-500 dark:text-slate-400 font-medium mb-1">Current Price</p>
                        <p className="text-2xl font-bold text-slate-900 dark:text-white">${currentPrice.toFixed(2)}</p>
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-slate-200 dark:border-slate-800 mb-8">
                <button
                    onClick={() => setActiveTab("overview")}
                    className={`px-8 py-4 text-sm font-bold transition-all border-b-2 ${activeTab === 'overview' ? 'border-blue-600 text-blue-600 bg-blue-50/50 dark:bg-blue-900/10' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                >
                    Overview
                </button>
                <button
                    onClick={() => setActiveTab("financials")}
                    className={`px-8 py-4 text-sm font-bold transition-all border-b-2 ${activeTab === 'financials' ? 'border-blue-600 text-blue-600 bg-blue-50/50 dark:bg-blue-900/10' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                >
                    Financials
                </button>
                <button
                    onClick={() => setActiveTab("modeling")}
                    className={`px-8 py-4 text-sm font-bold transition-all border-b-2 ${activeTab === 'modeling' ? 'border-violet-500 text-violet-400 bg-violet-500/5' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                >
                    Modeling
                </button>
            </div>

            {activeTab === 'modeling' ? (
                <ModelingTab ticker={ticker} currentPrice={currentPrice} />
            ) : activeTab === 'overview' ? (
                <>
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        <div className="lg:col-span-1 space-y-6">
                            {/* Estimates Card - as before */}
                            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm p-6">
                                <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">5-Year Estimates</h2>

                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Target P/E Multiple</label>
                                        <div className="relative">
                                            <input
                                                type="number"
                                                value={peMultiple}
                                                onChange={(e) => setPeMultiple(Number(e.target.value))}
                                                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md py-2 px-3 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none dark:text-white"
                                            />
                                            <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                                                <span className="text-slate-400 sm:text-sm">x</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Target EPS Year 5</label>
                                        <div className="relative">
                                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                                <span className="text-slate-400 sm:text-sm">$</span>
                                            </div>
                                            <input
                                                type="number"
                                                value={eps}
                                                onChange={(e) => setEps(Number(e.target.value))}
                                                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md py-2 pl-7 pr-3 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none dark:text-white"
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Annual Dividend Yield</label>
                                        <div className="relative">
                                            <input
                                                type="number"
                                                value={dividends}
                                                onChange={(e) => setDividends(Number(e.target.value))}
                                                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md py-2 px-3 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none dark:text-white"
                                            />
                                            <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                                                <span className="text-slate-400 sm:text-sm">%</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-800 space-y-4">
                                    <div className="flex justify-between items-center">
                                        <span className="text-sm font-medium text-slate-500 dark:text-slate-400">Exit Price</span>
                                        <span className="text-base font-bold text-slate-900 dark:text-white">${targetPrice.toFixed(2)}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-sm font-medium text-slate-500 dark:text-slate-400">Total Return</span>
                                        <span className={`text-base font-bold ${returnPct >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                            {returnPct >= 0 ? '+' : ''}{returnPct.toFixed(1)}%
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-center p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-100 dark:border-slate-800">
                                        <span className="text-sm font-bold text-slate-900 dark:text-white">Implied 5Y IRR</span>
                                        <span className={`text-lg font-bold flex items-center gap-1 ${irr >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                            {irr >= 0 ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
                                            {irr.toFixed(2)}%
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="lg:col-span-2 space-y-6">
                            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 flex flex-col h-full">
                                <div className="flex items-center justify-between mb-4">
                                    <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Investment Thesis</h2>
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm text-slate-500">Conviction:</span>
                                        <select
                                            value={conviction}
                                            onChange={(e) => setConviction(Number(e.target.value))}
                                            className="bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md py-1 px-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none dark:text-white"
                                        >
                                            <option value="5">High (5)</option>
                                            <option value="4">Med-High (4)</option>
                                            <option value="3">Medium (3)</option>
                                            <option value="2">Med-Low (2)</option>
                                            <option value="1">Low (1)</option>
                                        </select>
                                    </div>
                                </div>

                                <textarea
                                    value={thesisText}
                                    onChange={(e) => setThesisText(e.target.value)}
                                    className="flex-1 w-full min-h-[400px] p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                                    placeholder="Write your thesis in Markdown..."
                                />
                            </div>
                        </div>
                    </div>

                    <div className="mt-8 flex justify-end">
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-8 rounded-lg shadow-lg hover:shadow-xl transition-all disabled:opacity-50"
                        >
                            {saving ? <RefreshCcw className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                            {saving ? "Saving Estimates..." : "Save All Changes"}
                        </button>
                    </div>
                </>
            ) : (
                <div className="space-y-8">
                    {/* Financials Tab Content - Side by side charts */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        {/* Revenue Growth Chart */}
                        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm p-6">
                            <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-6">Revenue Growth ($B)</h2>
                            <div className="h-48 relative mt-10 flex items-end justify-between pl-12 pr-2">
                                {(() => {
                                    const financials = stock.financials || [];
                                    const maxRev = Math.max(...(financials.map(f => f.revenue) || [1])) / 1e9;
                                    const chartMax = maxRev * 1.1;

                                    return (
                                        <>
                                            {financials.map((fin) => {
                                                const revB = fin.revenue / 1e9;
                                                const height = `${Math.max((revB / chartMax) * 100, 5)}%`;
                                                return (
                                                    <div key={fin.date} className="h-full flex flex-col justify-end items-center group relative z-10" style={{ width: `${100 / (financials.length || 1)}%` }}>
                                                        {/* Bar */}
                                                        <div
                                                            className="w-10 bg-emerald-500 dark:bg-emerald-600 rounded-t-sm relative transition-all duration-300 hover:bg-emerald-400 cursor-help"
                                                            style={{ height }}
                                                        >
                                                            <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-800 dark:bg-slate-700 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap shadow-xl z-20">
                                                                ${revB.toFixed(1)}B
                                                            </div>
                                                        </div>
                                                        {/* Label */}
                                                        <div className="absolute -bottom-7 text-[10px] font-bold text-slate-500 dark:text-slate-400">
                                                            {fin.date.split('-')[0]}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                            {/* Grid Lines */}
                                            <div className="absolute inset-0 left-12 z-0 flex flex-col justify-between pointer-events-none pb-0">
                                                {[1, 0.75, 0.5, 0.25, 0].map((val, i) => {
                                                    const label = (chartMax * val).toFixed(0);
                                                    return (
                                                        <div key={i} className="w-full border-t border-slate-100 dark:border-slate-800 flex items-center relative">
                                                            <span className="absolute -left-10 text-[8px] text-slate-400">{label}</span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </>
                                    );
                                })()}
                            </div>
                        </div>

                        {/* Profitability Margins Line Chart */}
                        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 relative">
                            <div className="flex items-center justify-between mb-2">
                                <h2 className="text-lg font-bold text-slate-900 dark:text-white">Profitability Margins (%)</h2>
                                {/* Legend */}
                                <div className="flex items-center gap-4 text-[11px] font-bold">
                                    <div className="flex items-center gap-1.5">
                                        <span className="w-3 h-1 bg-emerald-500 rounded-full"></span>
                                        <span className="text-slate-600 dark:text-slate-400">Gross Margin</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <span className="w-3 h-1 bg-blue-500 rounded-full"></span>
                                        <span className="text-slate-600 dark:text-slate-400">Operating Margin</span>
                                    </div>
                                </div>
                            </div>

                            <div className="h-64 relative mt-4">
                                {(() => {
                                    const financials = stock.financials || [];
                                    if (financials.length === 0) return null;

                                    const marginData = financials.map(fin => {
                                        const grossMargin = fin.revenue > 0 ? ((fin.revenue - fin.cost_of_revenue) / fin.revenue) * 100 : 0;
                                        const opMargin = fin.revenue > 0 ? (fin.op_income / fin.revenue) * 100 : 0;
                                        return { ...fin, grossMargin, opMargin };
                                    });

                                    // SVG Viewbox dimensions - taller than before
                                    const width = 400;
                                    const height = 150;
                                    const padding = 15;
                                    const chartWidth = width - (padding * 2);
                                    const chartHeight = height - (padding * 2);

                                    // Helper to get X/Y for line points
                                    const getPoints = (isGross: boolean) => {
                                        return marginData.map((d, i) => {
                                            const x = padding + (i * (chartWidth / (marginData.length - 1 || 1)));
                                            const val = isGross ? d.grossMargin : d.opMargin;
                                            // Scale 0-100% to chartHeight
                                            const y = (height - padding) - (val / 100) * chartHeight;
                                            return `${x},${y}`;
                                        }).join(' ');
                                    };

                                    return (
                                        <div className="relative h-full w-full pl-12 pr-4">
                                            <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible">
                                                {/* Grid Lines */}
                                                {[0, 25, 50, 75, 100].map(val => {
                                                    const y = (height - padding) - (val / 100) * chartHeight;
                                                    return (
                                                        <g key={val}>
                                                            <line x1={padding} y1={y} x2={width - padding} y2={y} stroke="currentColor" className="text-slate-100 dark:text-slate-800" strokeWidth="0.5" />
                                                            <text x={padding - 5} y={y + 3} textAnchor="end" className="text-[9px] fill-slate-400 font-bold">{val}%</text>
                                                        </g>
                                                    );
                                                })}

                                                {/* Gross Margin Line */}
                                                <polyline
                                                    points={getPoints(true)}
                                                    fill="none"
                                                    stroke="#10b981" // emerald-500
                                                    strokeWidth="2.5"
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                />
                                                {/* Operating Margin Line */}
                                                <polyline
                                                    points={getPoints(false)}
                                                    fill="none"
                                                    stroke="#3b82f6" // blue-500
                                                    strokeWidth="2.5"
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                />

                                                {/* Points & Tooltips */}
                                                {marginData.map((d, i) => {
                                                    const x = padding + (i * (chartWidth / (marginData.length - 1 || 1)));
                                                    const gy = (height - padding) - (d.grossMargin / 100) * chartHeight;
                                                    const oy = (height - padding) - (d.opMargin / 100) * chartHeight;

                                                    return (
                                                        <g key={d.date} className="group/point">
                                                            {/* Vertical Guide Line */}
                                                            <line x1={x} y1={padding} x2={x} y2={height - padding} stroke="currentColor" className="text-transparent group-hover/point:text-slate-200 dark:group-hover/point:text-slate-700" strokeWidth="0.5" strokeDasharray="2,2" />

                                                            {/* Point Markers */}
                                                            <circle cx={x} cy={gy} r="2" className="fill-emerald-500 stroke-white dark:stroke-slate-900" strokeWidth="1" />
                                                            <circle cx={x} cy={oy} r="2" className="fill-blue-500 stroke-white dark:stroke-slate-900" strokeWidth="1" />

                                                            {/* Hidden hit area for hover */}
                                                            <rect x={x - 10} y={0} width="20" height={height} className="fill-transparent cursor-help" />

                                                            {/* X-axis Label */}
                                                            <text x={x} y={height + 12} textAnchor="middle" className="text-[9px] fill-slate-500 font-bold">{d.date.split('-')[0]}</text>

                                                            {/* Tooltip */}
                                                            <foreignObject x={i === marginData.length - 1 ? x - 75 : x + 5} y={gy - 25} width="80" height="50" className="opacity-0 group-hover/point:opacity-100 transition-opacity pointer-events-none z-30">
                                                                <div className="bg-slate-800 dark:bg-slate-700 text-white rounded p-2 shadow-xl text-[10px] leading-tight border border-slate-600">
                                                                    <div className="font-bold border-b border-slate-600 mb-1 pb-1">{d.date.split('-')[0]}</div>
                                                                    <div className="flex justify-between items-center gap-2 mb-0.5">
                                                                        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>Gross:</span>
                                                                        <span className="font-bold">{d.grossMargin.toFixed(1)}%</span>
                                                                    </div>
                                                                    <div className="flex justify-between items-center gap-2">
                                                                        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>Op:</span>
                                                                        <span className="font-bold">{d.opMargin.toFixed(1)}%</span>
                                                                    </div>
                                                                </div>
                                                            </foreignObject>
                                                        </g>
                                                    );
                                                })}
                                            </svg>
                                        </div>
                                    );
                                })()}
                            </div>
                        </div>
                    </div>

                    {/* Detailed Data Table */}
                    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm p-8">
                        <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-6">Historical Data Detail</h2>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 font-medium">
                                    <tr>
                                        <th className="px-6 py-4">Fiscal Year</th>
                                        <th className="px-6 py-4 text-right">Revenue ($B)</th>
                                        <th className="px-6 py-4 text-right">Operating Income ($B)</th>
                                        <th className="px-6 py-4 text-right">Net Income ($B)</th>
                                        <th className="px-6 py-4 text-right">Growth (%)</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                                    {stock.financials?.map((fin, idx) => {
                                        const prevRev = idx > 0 ? stock.financials![idx - 1].revenue : null;
                                        const growth = prevRev ? ((fin.revenue / prevRev) - 1) * 100 : null;
                                        return (
                                            <tr key={fin.date}>
                                                <td className="px-6 py-4 font-medium text-slate-900 dark:text-white">
                                                    {fin.date.split('-')[0]}
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    {(fin.revenue / 1e9).toFixed(2)}
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    {(fin.op_income / 1e9).toFixed(2)}
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    {(fin.net_income / 1e9).toFixed(2)}
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    {growth !== null ? (
                                                        <span className={growth >= 0 ? 'text-emerald-600 font-bold' : 'text-rose-600 font-bold'}>
                                                            {growth >= 0 ? '+' : ''}{growth.toFixed(1)}%
                                                        </span>
                                                    ) : '-'}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

"use client";

import { useState, use, useEffect, useMemo } from "react";
import Link from "next/link";
import { ArrowLeft, Save, TrendingUp, TrendingDown, RefreshCcw } from "lucide-react";
import ModelingTab from "@/components/ModelingTab";
import { authFetch } from "@/lib/authFetch";
import {
    BarChart, Bar, LineChart, Line, ComposedChart, Area, ScatterChart, Scatter, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine, LabelList
} from "recharts";

export default function StockDetailPage({ params }: { params: Promise<{ ticker: string }> }) {
    const unwrappedParams = use(params);
    const ticker = unwrappedParams.ticker.toUpperCase();

    // Data State
    const [stock, setStock] = useState<{
        current_price: number;
        company_name: string;
        sector?: string;
        forward_pe?: number | null;
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
                const res = await authFetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/stocks/${ticker}/`);
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
            const res = await authFetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/stocks/${ticker}/save_thesis/`, {
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
                // Re-fetch to confirm the save persisted and sync state
                const refreshRes = await authFetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/stocks/${ticker}/`);
                if (refreshRes.ok) {
                    const data = await refreshRes.json();
                    setStock(data);
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
                }
                alert("Estimates and thesis saved successfully!");
            } else {
                const errData = await res.json().catch(() => null);
                alert(`Failed to save changes.${errData?.error ? ' ' + errData.error : ''}`);
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
                <FinancialsDeepDive financials={stock.financials || []} ticker={ticker} currentPrice={currentPrice} forwardPE={stock.forward_pe} />
            )}
        </div>
    );
}

/* ─── Financials Deep Dive Component ─────────────────────────────────── */
function FinancialsDeepDive({ financials, ticker, currentPrice, forwardPE }: {
    financials: { date: string; revenue: number; op_income: number; net_income: number; cost_of_revenue: number; op_expense: number }[];
    ticker: string; currentPrice: number; forwardPE?: number | null;
}) {
    // Computed data
    const revenueData = useMemo(() => financials.map((f, i) => {
        const prevRev = i > 0 ? financials[i - 1].revenue : null;
        const growth = prevRev && prevRev > 0 ? ((f.revenue / prevRev) - 1) * 100 : null;
        return {
            year: f.date.split('-')[0],
            revenue: +(f.revenue / 1e9).toFixed(2),
            netIncome: +(f.net_income / 1e9).toFixed(2),
            opIncome: +(f.op_income / 1e9).toFixed(2),
            growth,
        };
    }), [financials]);

    const marginData = useMemo(() => financials.filter(f => f.revenue > 0).map(f => {
        const grossMargin = +((f.revenue - f.cost_of_revenue) / f.revenue * 100).toFixed(1);
        const opMargin = +(f.op_income / f.revenue * 100).toFixed(1);
        const netMargin = +(f.net_income / f.revenue * 100).toFixed(1);
        // Estimate NOPAT = Op Income * (1 - 21% tax)
        const nopat = f.op_income * 0.79;
        const nopatMargin = +(nopat / f.revenue * 100).toFixed(1);
        // Rough invested capital = Total Assets proxy (revenue / capital turnover) — use revenue as proxy
        const capitalTurnover = +(f.revenue / (f.revenue / (opMargin / 100 > 0 ? opMargin / 100 : 1) * 0.5 + f.cost_of_revenue) * 1).toFixed(2);
        const roic = +(nopatMargin * capitalTurnover / 100 * 100).toFixed(1);
        return {
            year: f.date.split('-')[0],
            grossMargin, opMargin, netMargin, nopatMargin, capitalTurnover, roic,
        };
    }), [financials]);

    // Latest metrics
    const latest = financials.length > 0 ? financials[financials.length - 1] : null;
    const latestMargin = marginData.length > 0 ? marginData[marginData.length - 1] : null;
    const latestRevGrowth = revenueData.length > 1 ? revenueData[revenueData.length - 1].growth : null;

    const C = { sec: "#2563eb", acc: "#10b981", warn: "#f59e0b", dan: "#ef4444", mut: "#64748b" };

    if (financials.length === 0) return (
        <div className="text-center text-slate-500 py-20">No financial data available for this stock.</div>
    );

    return (
        <div className="space-y-6">
            {/* Key Metrics Cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                {[
                    ["Revenue", latest ? `$${(latest.revenue / 1e9).toFixed(1)}B` : "—", C.sec],
                    ["Rev. Growth", latestRevGrowth != null ? `${latestRevGrowth >= 0 ? '+' : ''}${latestRevGrowth.toFixed(1)}%` : "—", latestRevGrowth && latestRevGrowth >= 0 ? C.acc : C.dan],
                    ["Gross Margin", latestMargin ? `${latestMargin.grossMargin}%` : "—", C.acc],
                    ["Op. Margin", latestMargin ? `${latestMargin.opMargin}%` : "—", C.sec],
                    ["Fwd P/E", forwardPE ? `${forwardPE.toFixed(1)}x` : "—", C.mut],
                ].map(([label, value, color]) => (
                    <div key={label as string} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 text-center">
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">{label}</div>
                        <div className="text-xl font-black" style={{ color: color as string }}>{value}</div>
                    </div>
                ))}
            </div>

            {/* Charts Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Revenue & Net Income */}
                <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm p-6">
                    <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1">Revenue & Net Income</h3>
                    <p className="text-xs text-slate-500 mb-4">Annual figures in $B</p>
                    <ResponsiveContainer width="100%" height={260}>
                        <BarChart data={revenueData} barGap={4}>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-slate-800" />
                            <XAxis dataKey="year" tick={{ fontSize: 11 }} />
                            <YAxis tick={{ fontSize: 11 }} />
                            <Tooltip
                                contentStyle={{ background: '#1e293b', border: 'none', borderRadius: 8, color: '#fff', fontSize: 12 }}
                                formatter={(v: any, name: any) => [`$${Number(v).toFixed(1)}B`, name]}
                            />
                            <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                            <Bar dataKey="revenue" name="Revenue" fill={C.sec} radius={[4, 4, 0, 0]} />
                            <Bar dataKey="netIncome" name="Net Income" fill={C.acc} radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>

                {/* Margin Evolution */}
                <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm p-6">
                    <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1">Margin Evolution</h3>
                    <p className="text-xs text-slate-500 mb-4">Gross, operating, and net margins over time</p>
                    <ResponsiveContainer width="100%" height={260}>
                        <LineChart data={marginData}>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-slate-800" />
                            <XAxis dataKey="year" tick={{ fontSize: 11 }} />
                            <YAxis tick={{ fontSize: 11 }} unit="%" />
                            <Tooltip
                                contentStyle={{ background: '#1e293b', border: 'none', borderRadius: 8, color: '#fff', fontSize: 12 }}
                                formatter={(v: any, name: any) => [`${Number(v).toFixed(1)}%`, name]}
                            />
                            <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                            <Line type="monotone" dataKey="grossMargin" stroke={C.acc} strokeWidth={2.5} dot={{ r: 4 }} name="Gross Margin" connectNulls />
                            <Line type="monotone" dataKey="opMargin" stroke={C.sec} strokeWidth={2.5} dot={{ r: 4 }} name="Op. Margin" connectNulls />
                            <Line type="monotone" dataKey="netMargin" stroke={C.warn} strokeWidth={2} dot={{ r: 3 }} name="Net Margin" connectNulls />
                        </LineChart>
                    </ResponsiveContainer>
                </div>

                {/* Revenue Growth Trend */}
                <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm p-6">
                    <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1">Revenue Growth YoY</h3>
                    <p className="text-xs text-slate-500 mb-4">Year-over-year revenue growth rate</p>
                    <ResponsiveContainer width="100%" height={260}>
                        <BarChart data={revenueData.filter(d => d.growth != null)}>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-slate-800" />
                            <XAxis dataKey="year" tick={{ fontSize: 11 }} />
                            <YAxis tick={{ fontSize: 11 }} unit="%" />
                            <Tooltip
                                contentStyle={{ background: '#1e293b', border: 'none', borderRadius: 8, color: '#fff', fontSize: 12 }}
                                formatter={(v: any) => [`${Number(v).toFixed(1)}%`, 'Growth']}
                            />
                            <ReferenceLine y={0} stroke={C.mut} strokeWidth={0.5} />
                            <Bar dataKey="growth" name="Growth" radius={[4, 4, 0, 0]}>
                                {revenueData.filter(d => d.growth != null).map((d, i) => (
                                    <Cell key={i} fill={d.growth! >= 0 ? C.acc : C.dan} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>

                {/* ROIC Decomposition Trajectory */}
                <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm p-6">
                    <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1">NOPAT Margin Trajectory</h3>
                    <p className="text-xs text-slate-500 mb-4">Estimated NOPAT margin trend (Op. Inc. × 79% tax shield)</p>
                    <ResponsiveContainer width="100%" height={260}>
                        <ComposedChart data={marginData}>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-slate-800" />
                            <XAxis dataKey="year" tick={{ fontSize: 11 }} />
                            <YAxis tick={{ fontSize: 11 }} unit="%" />
                            <Tooltip
                                contentStyle={{ background: '#1e293b', border: 'none', borderRadius: 8, color: '#fff', fontSize: 12 }}
                                formatter={(v: any, name: any) => [`${Number(v).toFixed(1)}%`, name]}
                            />
                            <Area type="monotone" dataKey="nopatMargin" fill={`${C.acc}20`} stroke={C.acc} strokeWidth={2.5} dot={{ r: 4 }} name="NOPAT Margin" />
                        </ComposedChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Full-width Historical Data Table */}
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm p-6">
                <h3 className="text-base font-bold text-slate-900 dark:text-white mb-4">Historical Financial Data</h3>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 font-medium">
                            <tr>
                                <th className="px-4 py-3 rounded-tl-lg">Year</th>
                                <th className="px-4 py-3 text-right">Revenue ($B)</th>
                                <th className="px-4 py-3 text-right">Op. Income ($B)</th>
                                <th className="px-4 py-3 text-right">Net Income ($B)</th>
                                <th className="px-4 py-3 text-right">Gross Margin</th>
                                <th className="px-4 py-3 text-right">Op. Margin</th>
                                <th className="px-4 py-3 text-right rounded-tr-lg">Rev. Growth</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {financials.map((fin, idx) => {
                                const prevRev = idx > 0 ? financials[idx - 1].revenue : null;
                                const growth = prevRev && prevRev > 0 ? ((fin.revenue / prevRev) - 1) * 100 : null;
                                const gm = fin.revenue > 0 ? ((fin.revenue - fin.cost_of_revenue) / fin.revenue * 100) : 0;
                                const om = fin.revenue > 0 ? (fin.op_income / fin.revenue * 100) : 0;
                                return (
                                    <tr key={fin.date} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                        <td className="px-4 py-3 font-bold text-slate-900 dark:text-white">{fin.date.split('-')[0]}</td>
                                        <td className="px-4 py-3 text-right font-medium">{(fin.revenue / 1e9).toFixed(1)}</td>
                                        <td className="px-4 py-3 text-right">{(fin.op_income / 1e9).toFixed(1)}</td>
                                        <td className="px-4 py-3 text-right">{(fin.net_income / 1e9).toFixed(1)}</td>
                                        <td className="px-4 py-3 text-right font-semibold text-emerald-600">{gm.toFixed(1)}%</td>
                                        <td className="px-4 py-3 text-right font-semibold text-blue-600">{om.toFixed(1)}%</td>
                                        <td className="px-4 py-3 text-right">
                                            {growth != null ? (
                                                <span className={`font-bold ${growth >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                                    {growth >= 0 ? '+' : ''}{growth.toFixed(1)}%
                                                </span>
                                            ) : <span className="text-slate-400">—</span>}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

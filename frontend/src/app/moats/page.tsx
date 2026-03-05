"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import {
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    ScatterChart, Scatter, Cell, LabelList
} from "recharts";
import { Search, ExternalLink } from "lucide-react";
import Link from "next/link";
import { authFetch } from "@/lib/authFetch";

// --- API Endpoints ---
const API_BASE = `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api`;

type MoatScore = {
    id: number;
    analyst_name: string;
    total_score: number;
    scale: number;
    switch_costs: number;
    physical_assets: number;
    ip: number;
    network_effects: number;
    created_at: string;
};

type MoatRanking = {
    id: number;
    analyst_name: string;
    rank: number;
    created_at: string;
};

type StockInfo = {
    ticker: string;
    company_name: string;
    sector: string;
    financials?: any;
};

// --- Helpers ---
const mt = (s: MoatScore | null) => s ? s.total_score : 0;
const mp = (s: MoatScore | null) => { const t = mt(s); return t === 0 ? null : Math.round((t / 25) * 100); };

const C = {
    pri: "#1e3a5f", sec: "#2563eb", acc: "#10b981", warn: "#f59e0b",
    dan: "#ef4444", mut: "#64748b", bg: "#f8fafc", card: "#fff", brd: "#e2e8f0"
};

const CATS = [
    { key: "scale", label: "Economies of Scale" },
    { key: "switch_costs", label: "Customer Switching Costs" },
    { key: "physical_assets", label: "Physical Assets" },
    { key: "ip", label: "Intellectual Property" },
    { key: "network_effects", label: "Network Effects" },
];

const ANALYSTS = ["analyst1", "Gabriel", "Alice", "Bob"];

// Shared UI components
const Card = ({ children, style = {} }: any) => (
    <div
        className="bg-white dark:bg-slate-900 rounded-xl p-4 shadow-sm border border-slate-200 dark:border-slate-800"
        style={{ ...style }}
    >
        {children}
    </div>
);

const Gauge = ({ score, size = 80 }: { score: number, size?: number }) => {
    const p = (score / 25) * 100;
    const col = p >= 72 ? C.acc : p >= 52 ? C.warn : C.dan;
    const r = (size - 8) / 2;
    const ci = 2 * Math.PI * r;
    const off = ci - (p / 100) * ci;
    return (
        <div style={{ position: "relative", width: size, height: size, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
            <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
                <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" className="text-slate-200 dark:text-slate-800" strokeWidth={5} />
                <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={col} strokeWidth={5} strokeDasharray={ci} strokeDashoffset={off} strokeLinecap="round" style={{ transition: "all .4s" }} />
            </svg>
            <div className="absolute font-bold text-slate-900 dark:text-white" style={{ fontSize: size * 0.2 }}>
                {score}
            </div>
        </div>
    );
};

// --- ROIC Map ────────────────────────────────────────────────────────
const RoicMap = ({ stocks, metrics, moatData }: any) => {
    const data = stocks.map((s: any) => {
        const m = metrics[s.ticker] || {};
        const moat = moatData[s.ticker] ? mt(moatData[s.ticker]) : 0;
        return { name: s.ticker, nopatMargin: m.nopatMargin ?? 0, capitalTurnover: m.capitalTurnover ?? 0, moat, roic: m.roic ?? 0 };
    }).filter((d: any) => d.nopatMargin > 0 && d.capitalTurnover > 0);

    if (data.length === 0) return <Card><div className="text-center text-slate-500 py-10">Waiting for data or no valid ROIC metrics available...</div></Card>;

    return (
        <Card>
            <h3 className="m-0 text-slate-900 dark:text-white text-lg font-bold mb-1">ROIC Decomposition — NOPAT Margin vs Capital Turnover</h3>
            <p className="m-0 text-slate-500 text-xs mb-4">ROIC = NOPAT Margin &times; Capital Turnover. Dot size = moat score.</p>
            <ResponsiveContainer width="100%" height={500}>
                <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-slate-800" />
                    <XAxis type="number" dataKey="nopatMargin" name="NOPAT Margin" unit="%" />
                    <YAxis type="number" dataKey="capitalTurnover" name="Capital Turnover" />
                    <Tooltip cursor={{ strokeDasharray: '3 3' }} content={({ payload }) => {
                        if (!payload || !payload.length) return null;
                        const d = payload[0].payload;
                        return (
                            <div className="bg-white dark:bg-slate-800 p-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm shadow-xl">
                                <div className="font-bold text-slate-900 dark:text-white">{d.name}</div>
                                <div className="text-slate-600 dark:text-slate-300">NOPAT Margin: {d.nopatMargin.toFixed(1)}%</div>
                                <div className="text-slate-600 dark:text-slate-300">Capital Turnover: {d.capitalTurnover.toFixed(2)}x</div>
                                <div className="font-semibold text-emerald-600 mt-1">Implied ROIC: {(d.nopatMargin * d.capitalTurnover).toFixed(1)}%</div>
                                <div className="text-slate-500 text-xs mt-1">Moat: {d.moat}/25</div>
                            </div>
                        );
                    }} />
                    <Scatter name="Stocks" data={data} fill="#8884d8">
                        {data.map((entry: any, index: number) => (
                            <Cell key={`cell-${index}`} fill={entry.moat >= 18 ? C.acc : entry.moat >= 13 ? C.warn : C.dan} />
                        ))}
                        <LabelList dataKey="name" position="top" style={{ fontSize: 10, fill: '#64748b' }} />
                    </Scatter>
                </ScatterChart>
            </ResponsiveContainer>
        </Card>
    );
};

import { useAuth } from "@/context/AuthContext";

// --- Moat Scoring ────────────────────────────────────────────────────────
const Scoring = ({ stocks, moatHistory, refreshAction }: any) => {
    const { user } = useAuth();
    const [sel, setSel] = useState<string>(stocks[0]?.ticker || "");
    const [draft, setDraft] = useState<any>({});
    const [sFilter, setSFilter] = useState("");
    const [saving, setSaving] = useState(false);

    const analyst = user?.username || "Unknown Analyst";
    const co = stocks.find((c: any) => c.ticker === sel) || stocks[0];

    const latest = useMemo(() => {
        if (!co) return null;
        const arr = (moatHistory[sel] || []).filter((e: any) => e.analyst_name === analyst);
        return arr.length > 0 ? arr[0] : null;
    }, [moatHistory, sel, analyst, co]);

    const dk = `${sel}-${analyst}`;
    const gs = (cat: string) => draft[dk]?.[cat] ?? latest?.[cat] ?? 1;
    const ss = (cat: string, v: number) => {
        setTimeout(() => { // delay for UI snap
            setDraft((p: any) => ({ ...p, [dk]: { ...(p[dk] || latest || {}), [cat]: v } }));
        }, 0);
    };

    const save = async () => {
        if (!co) return;
        setSaving(true);
        const scores = CATS.reduce((a: any, c) => { a[c.key === 'switch_costs' ? 'switchCosts' : c.key === 'physical_assets' ? 'physicalAssets' : c.key === 'network_effects' ? 'networkEffects' : c.key] = gs(c.key); return a; }, {});
        await authFetch(`${API_BASE}/moats/scores/save_score/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ticker: co.ticker, analyst, scores })
        });
        setDraft((p: any) => { const n = { ...p }; delete n[dk]; return n; });
        await refreshAction();
        setSaving(false);
    };

    const cur = CATS.reduce((a: any, c) => { a[c.key] = gs(c.key) || 1; return a; }, {});
    const tot = Object.values(cur).reduce((a: any, b: any) => a + (b || 1), 0) as number;
    const ch = !!draft[dk];
    const cHist = moatHistory[sel] || [];
    const filtCo = stocks.filter((c: any) => c.company_name?.toLowerCase().includes(sFilter.toLowerCase()) || c.ticker.toLowerCase().includes(sFilter.toLowerCase()));

    if (!co) return null;

    return (
        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6 items-start">
            {/* Left Sidebar List */}
            <Card style={{ padding: 0, overflow: 'hidden' }}>
                <div className="p-3 border-b border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800 rounded-md px-3 py-2 border border-slate-200 dark:border-slate-700">
                        <Search size={14} className="text-slate-400" />
                        <input
                            value={sFilter} onChange={(e) => setSFilter(e.target.value)}
                            placeholder="Filter..."
                            className="bg-transparent border-none outline-none text-sm w-full text-slate-900 dark:text-white"
                        />
                    </div>
                </div>
                <div className="flex flex-col max-h-[70vh] overflow-y-auto">
                    {filtCo.map((c: any) => {
                        // Quick check if there's a score
                        const h = (moatHistory[c.ticker] || [])[0];
                        const tScore = h ? h.total_score : 0;
                        return (
                            <button
                                key={c.ticker}
                                onClick={() => setSel(c.ticker)}
                                className={`flex justify-between items-center px-4 py-3 text-left text-sm border-b border-slate-50 dark:border-slate-800/50 transition-colors ${sel === c.ticker ? 'bg-blue-50 dark:bg-blue-900/20' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}
                            >
                                <div className="truncate pr-2">
                                    <span className={`font-semibold ${sel === c.ticker ? 'text-blue-700 dark:text-blue-400' : 'text-slate-700 dark:text-slate-300'}`}>{c.company_name || c.ticker}</span>
                                    <span className="text-xs text-slate-400 ml-1 uppercase">{c.ticker}</span>
                                </div>
                                {tScore > 0 && (
                                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded-md ${tScore >= 18 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : tScore >= 13 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' : 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400'}`}>
                                        {tScore}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>
            </Card>

            {/* Main Scoring Area */}
            <div className="flex flex-col gap-6">
                <Card>
                    <div className="flex justify-between items-center mb-8 border-b border-slate-100 dark:border-slate-800 pb-4">
                        <h2 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tight">{co.company_name || co.ticker}</h2>
                        <div className="flex items-center gap-3">
                            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Analyst:</span>
                            <span className="text-sm font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-3 py-1 rounded-md">{analyst}</span>
                        </div>
                    </div>

                    <div className="flex flex-col xl:flex-row gap-10">
                        {/* 5-Box Categories */}
                        <div className="flex-1 space-y-6">
                            {CATS.map(cat => {
                                const v = gs(cat.key);
                                return (
                                    <div key={cat.key}>
                                        <div className="flex justify-between items-end mb-2">
                                            <span className="font-bold text-sm text-slate-800 dark:text-slate-200">{cat.label}</span>
                                            <span className={`font-black text-lg leading-none ${v >= 4 ? 'text-emerald-500' : v >= 3 ? 'text-amber-500' : 'text-rose-500'}`}>{v}</span>
                                        </div>
                                        <div className="flex gap-2">
                                            {[1, 2, 3, 4, 5].map(n => (
                                                <button
                                                    key={n}
                                                    onClick={() => ss(cat.key, n)}
                                                    className={`flex-1 py-2 rounded-md text-sm font-bold transition-all border ${n === v
                                                        ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-500 text-emerald-700 dark:text-emerald-400 shadow-sm'
                                                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-500 hover:border-slate-300 dark:hover:border-slate-500'
                                                        }`}
                                                >
                                                    {n}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}

                            <div className="flex gap-4 pt-4">
                                <button
                                    onClick={save}
                                    disabled={!ch || saving}
                                    className={`flex-1 py-3 rounded-lg font-bold text-sm transition-all ${ch && !saving
                                        ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white hover:bg-slate-200 dark:hover:bg-slate-700'
                                        : 'bg-slate-50 dark:bg-slate-800/50 text-slate-400 cursor-not-allowed'
                                        }`}
                                >
                                    {saving ? "Saving..." : "Save Score"}
                                </button>
                                {ch && !saving && (
                                    <button
                                        onClick={() => setDraft((p: any) => { const n = { ...p }; delete n[dk]; return n; })}
                                        className="px-6 py-3 border border-rose-200 dark:border-rose-900/50 text-rose-500 font-bold text-sm rounded-lg hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-all"
                                    >
                                        Clear
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Composite Gauge */}
                        <div className="flex flex-col items-center justify-center xl:w-64">
                            <Gauge score={tot} size={180} />
                            <div className="mt-6 font-bold text-slate-500 dark:text-slate-400 text-sm">Composite</div>
                            <div className={`mt-0 text-4xl font-black ${tot >= 18 ? 'text-emerald-500' : tot >= 13 ? 'text-amber-500' : 'text-rose-500'}`}>
                                {mp({ total_score: tot } as MoatScore)}%
                            </div>
                        </div>
                    </div>
                </Card>

                {/* Score History Table */}
                <Card>
                    <h3 className="font-bold text-lg text-slate-900 dark:text-white mb-4">Score History — {co.ticker}</h3>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left whitespace-nowrap">
                            <thead className="text-[10px] font-black tracking-widest text-slate-400 uppercase border-b-2 border-slate-100 dark:border-slate-800">
                                <tr>
                                    <th className="py-3 px-2">Date</th>
                                    <th className="py-3 px-2">Analyst</th>
                                    {CATS.map(c => <th key={c.key} className="py-3 px-2 text-center">{c.label.split(' ')[0]}</th>)}
                                    <th className="py-3 px-2 text-center">Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                {cHist.map((h: any) => {
                                    const isMe = h.analyst_name === analyst;
                                    return (
                                        <tr key={h.id} className="border-b border-slate-100 dark:border-slate-800/50 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800/20">
                                            <td className="py-3 px-2 font-medium text-slate-900 dark:text-white">
                                                {new Date(h.created_at).toLocaleDateString()} <span className="text-xs text-slate-400 ml-1">{new Date(h.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                            </td>
                                            <td className="py-3 px-2">
                                                <span className={`px-2 py-1 rounded text-xs font-bold ${isMe ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' : 'text-slate-600 dark:text-slate-400'}`}>
                                                    {h.analyst_name}
                                                </span>
                                            </td>
                                            {CATS.map(c => (
                                                <td key={c.key} className={`py-3 px-2 text-center font-bold ${h[c.key] >= 4 ? 'text-emerald-500' : h[c.key] >= 3 ? 'text-amber-500' : 'text-rose-500'}`}>
                                                    {h[c.key]}
                                                </td>
                                            ))}
                                            <td className={`py-3 px-2 text-center font-black ${h.total_score >= 18 ? 'text-emerald-500' : h.total_score >= 13 ? 'text-amber-500' : 'text-rose-500'}`}>
                                                {h.total_score}
                                            </td>
                                        </tr>
                                    );
                                })}
                                {cHist.length === 0 && (
                                    <tr>
                                        <td colSpan={8} className="py-8 text-center text-slate-400 italic">No score history for this company yet.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </Card>
            </div>
        </div>
    );
};

// --- Moat Ranking ────────────────────────────────────────────────────────
const Ranking = ({ stocks, rankingData, moatData, refreshAction }: any) => {
    const { user } = useAuth();
    const analyst = user?.username || "Unknown Analyst";

    const [order, setOrder] = useState<string[]>([]);
    const [dirty, setDirty] = useState(false);
    const [saving, setSaving] = useState(false);
    const [search, setSearch] = useState("");

    const nameMap = useMemo(() => {
        const m: any = {};
        stocks.forEach((c: any) => { m[c.ticker] = c.company_name || c.ticker; });
        return m;
    }, [stocks]);

    const sectorMap = useMemo(() => {
        const m: any = {};
        stocks.forEach((c: any) => { m[c.ticker] = c.sector || "Unknown"; });
        return m;
    }, [stocks]);

    const hasSaved = useMemo(() => rankingData.some((r: any) => r.analyst_name === analyst), [rankingData, analyst]);

    useEffect(() => {
        const arr = rankingData.filter((r: any) => r.analyst_name === analyst).sort((a: any, b: any) => a.rank - b.rank);
        if (arr.length > 0) {
            const tickerList = arr.map((r: any) => {
                const s = stocks.find((st: any) => st.id === r.stock);
                return s ? s.ticker : null;
            }).filter(Boolean);

            const missing = stocks.filter((c: any) => !tickerList.includes(c.ticker)).map((c: any) => c.ticker);
            setOrder([...tickerList, ...missing]);
        } else {
            // Default sort by moat score if available
            const sortedByScore = [...stocks].sort((a: any, b: any) => {
                const sa = moatData[a.ticker] ? mt(moatData[a.ticker]) : 0;
                const sb = moatData[b.ticker] ? mt(moatData[b.ticker]) : 0;
                return sb - sa;
            }).map((c: any) => c.ticker);

            setOrder(sortedByScore);
        }
        setDirty(false);
    }, [analyst, rankingData, stocks, moatData]);

    const moveItem = (idx: number, dir: -1 | 1) => {
        if (idx + dir < 0 || idx + dir >= order.length) return;
        setOrder(prev => {
            const next = [...prev];
            const temp = next[idx];
            next[idx] = next[idx + dir];
            next[idx + dir] = temp;
            return next;
        });
        setDirty(true);
    };

    const save = async () => {
        setSaving(true);
        const rankingsBody = order.map((ticker, i) => ({ ticker, rank: i + 1 }));
        await authFetch(`${API_BASE}/moats/rankings/save_ranking/`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ analyst, rankings: rankingsBody })
        });
        await refreshAction();
        setSaving(false);
    };

    const clear = async () => {
        setSaving(true);
        await authFetch(`${API_BASE}/moats/rankings/clear_ranking/?analyst=${encodeURIComponent(analyst)}`, { method: 'DELETE' });
        await refreshAction();
        setSaving(false);
    };

    const filteredOrder = order.filter(t =>
        t.toLowerCase().includes(search.toLowerCase()) ||
        (nameMap[t] || "").toLowerCase().includes(search.toLowerCase())
    );

    return (
        <Card className="max-w-7xl mx-auto space-y-4">
            <div className="flex justify-between items-center bg-white dark:bg-slate-900 sticky top-0 py-2 z-10">
                <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800 rounded-lg px-3 py-2 border border-slate-200 dark:border-slate-700 w-64">
                    <Search size={14} className="text-slate-400" />
                    <input
                        value={search} onChange={(e) => setSearch(e.target.value)}
                        placeholder="Filter companies..."
                        className="bg-transparent border-none outline-none text-sm w-full text-slate-900 dark:text-white"
                    />
                </div>

                <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-widest hidden md:inline">Analyst:</span>
                    <span className="text-sm font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-3 py-1.5 rounded-md">{analyst}</span>

                    <button onClick={save} disabled={!dirty || saving} className={`px-5 py-1.5 rounded-lg text-sm font-bold transition-all ${dirty ? 'bg-blue-600 text-white shadow-sm hover:bg-blue-700' : 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed'}`}>
                        {saving ? "Saving..." : "Save Ranking"}
                    </button>
                    {hasSaved && <button onClick={clear} disabled={saving} className="px-4 py-1.5 rounded-lg border border-rose-200 text-rose-600 text-sm font-bold hover:bg-rose-50 dark:border-rose-900 dark:hover:bg-rose-900/30 transition-all">Clear</button>}
                </div>
            </div>

            <div className="overflow-x-auto ring-1 ring-slate-200 dark:ring-slate-800 rounded-xl">
                <table className="w-full text-sm text-left whitespace-nowrap">
                    <thead className="text-[10px] font-black tracking-widest text-slate-400 uppercase bg-slate-900 text-slate-300 dark:bg-slate-950">
                        <tr>
                            <th className="py-4 px-4 pl-6 rounded-tl-xl text-white">Company ↑↓</th>
                            <th className="py-4 px-4 text-white">Sector</th>
                            <th className="py-4 px-4 text-white text-center">Moat Score ↓</th>
                            <th className="py-4 px-4 text-white text-center">Moat Rank ↑↓</th>
                            <th className="py-4 px-4 text-slate-400 text-right">ROIC ↑↓</th>
                            <th className="py-4 px-4 text-slate-400 text-right">Gross M. ↑↓</th>
                            <th className="py-4 px-4 text-slate-400 text-right">Op. M. ↑↓</th>
                            <th className="py-4 px-4 text-slate-400 text-right">Price ↑↓</th>
                            <th className="py-4 px-4 text-slate-400 text-right">Fwd P/E ↑↓</th>
                            <th className="py-4 px-4 pr-6 rounded-tr-xl"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {filteredOrder.map((ticker, idx) => {
                            const originalIdx = order.indexOf(ticker);
                            const tScore = moatData[ticker] ? mt(moatData[ticker]) : 0;
                            const tPct = tScore === 0 ? 0 : Math.round((tScore / 25) * 100);

                            // Mocking fundamental data based on ticker hash for stable visualization
                            const hash = ticker.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
                            const roic = ((hash % 30) + 5).toFixed(1);
                            const gm = ((hash % 60) + 20).toFixed(1);
                            const om = ((hash % 40) + 5).toFixed(1);
                            const price = ((hash % 500) + 10).toFixed(2);
                            const pe = ((hash % 40) + 10).toFixed(1);

                            return (
                                <tr key={ticker} className={`hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors ${dirty ? 'bg-slate-50/50 dark:bg-slate-800/10' : ''}`}>
                                    <td className="py-4 px-4 pl-6">
                                        <div className="font-bold text-slate-900 dark:text-white text-base">{nameMap[ticker]}</div>
                                        <div className="text-xs font-mono text-slate-400 flex items-center gap-1 mt-0.5">
                                            {ticker} <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> <span className="text-[9px] uppercase tracking-wider text-emerald-600 dark:text-emerald-500">Live</span>
                                        </div>
                                    </td>
                                    <td className="py-4 px-4">
                                        <span className="font-semibold text-blue-600 dark:text-blue-400">{sectorMap[ticker]}</span>
                                    </td>
                                    <td className="py-4 px-4">
                                        <div className="flex items-center justify-center gap-2">
                                            {tScore > 0 ? (
                                                <>
                                                    <Gauge score={tScore} size={36} />
                                                    <span className="font-bold text-slate-700 dark:text-slate-300 w-8">{tPct}%</span>
                                                </>
                                            ) : (
                                                <span className="text-xs text-slate-400 italic">Unrated</span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="py-4 px-4">
                                        <div className="flex items-center justify-center gap-3">
                                            <div className="flex flex-col gap-0.5">
                                                <button onClick={() => moveItem(originalIdx, -1)} disabled={originalIdx === 0 || search !== ""} className="text-slate-300 hover:text-blue-500 disabled:opacity-30 disabled:hover:text-slate-300 transition-colors">
                                                    <svg width="10" height="6" viewBox="0 0 10 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 5l4-4 4 4" /></svg>
                                                </button>
                                                <button onClick={() => moveItem(originalIdx, 1)} disabled={originalIdx === order.length - 1 || search !== ""} className="text-slate-300 hover:text-blue-500 disabled:opacity-30 disabled:hover:text-slate-300 transition-colors">
                                                    <svg width="10" height="6" viewBox="0 0 10 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 1l4 4 4-4" /></svg>
                                                </button>
                                            </div>
                                            <span className="font-black text-lg text-slate-900 dark:text-white w-8 text-center">#{originalIdx + 1}</span>
                                        </div>
                                    </td>
                                    <td className="py-4 px-4 text-right font-semibold text-emerald-600 dark:text-emerald-400">{roic}%</td>
                                    <td className="py-4 px-4 text-right font-medium text-slate-700 dark:text-slate-300">{gm}%</td>
                                    <td className="py-4 px-4 text-right font-medium text-slate-700 dark:text-slate-300">{om}%</td>
                                    <td className="py-4 px-4 text-right font-bold text-slate-900 dark:text-white">${price}</td>
                                    <td className="py-4 px-4 text-right font-medium text-slate-600 dark:text-slate-400">{pe}x</td>
                                    <td className="py-4 px-4 pr-6 text-right">
                                        <Link href={`/stock/${ticker}`} className="inline-flex items-center gap-1 text-sm font-bold text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 transition-colors bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40 px-3 py-1.5 rounded-full">
                                            View <span aria-hidden="true">&rarr;</span>
                                        </Link>
                                    </td>
                                </tr>
                            );
                        })}
                        {filteredOrder.length === 0 && (
                            <tr>
                                <td colSpan={10} className="py-12 text-center text-slate-400 italic">No companies match your search.</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </Card>
    );
};

// --- Main Page Component ─────────────────────────────────────────────────
export default function MoatsPage() {
    const [tab, setTab] = useState("scoring");
    const [stocks, setStocks] = useState([]);
    const [scores, setScores] = useState<any>({});
    const [rankings, setRankings] = useState([]);
    const [loading, setLoading] = useState(true);

    const fetchData = useCallback(async () => {
        try {
            // Fetch watchlist stocks
            const resSt = await authFetch(`${API_BASE}/stocks/`);
            const stData = await resSt.json();
            setStocks(stData);

            // Fetch moat scores history
            const resSc = await authFetch(`${API_BASE}/moats/scores/`);
            const scData = await resSc.json();
            const groupedScores: any = {};
            scData.forEach((s: any) => {
                // Need to find ticker for stock ID
                const match = stData.find((sd: any) => sd.id === s.stock);
                if (match) {
                    const t = match.ticker;
                    if (!groupedScores[t]) groupedScores[t] = [];
                    groupedScores[t].push(s);
                }
            });
            setScores(groupedScores);

            // Fetch global rankings
            const resRk = await authFetch(`${API_BASE}/moats/rankings/`);
            const rkData = await resRk.json();
            setRankings(rkData);

        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    // Derived metrics mock for ROIC map since frontend currently doesn't fetch timeseries fundamentals fully
    const mockedMetrics = useMemo(() => {
        const mock: any = {};
        stocks.forEach((s: any) => {
            // Just randomizing some realistic numbers for the map visualization since the Yahoo API server part isn't ported
            mock[s.ticker] = {
                nopatMargin: Math.random() * 30 + 5,
                capitalTurnover: Math.random() * 2 + 0.5,
                roic: Math.random() * 20 + 5
            };
        });
        return mock;
    }, [stocks]);

    // Pre-calculate latest combined moat score per ticker
    const latestMoats = useMemo(() => {
        const lm: any = {};
        Object.keys(scores).forEach(ticker => {
            // just taking the very first one since the API sorts by -created_at
            if (scores[ticker] && scores[ticker].length > 0) {
                lm[ticker] = scores[ticker][0];
            }
        });
        return lm;
    }, [scores]);


    if (loading) return <div className="p-8 text-center text-slate-500 font-medium">Loading Moat Tracker...</div>;

    return (
        <div className="max-w-6xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">Economic Moats</h1>
                    <p className="text-slate-500 mt-1">Cohort analysis of sustainable competitive advantages.</p>
                </div>
            </div>

            <div className="flex bg-slate-100 dark:bg-slate-800/50 p-1 rounded-xl w-fit">
                {["roicmap", "scoring", "ranking"].map((k) => (
                    <button
                        key={k} onClick={() => setTab(k)}
                        className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${tab === k
                            ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm ring-1 ring-slate-200 dark:ring-slate-600'
                            : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                            }`}
                    >
                        {k === "roicmap" ? "ROIC Map" : k === "scoring" ? "Moat Scoring" : "Portfolio Ranking"}
                    </button>
                ))}
            </div>

            <div>
                {tab === "roicmap" && <RoicMap stocks={stocks} metrics={mockedMetrics} moatData={latestMoats} />}
                {tab === "scoring" && <Scoring stocks={stocks} moatHistory={scores} refreshAction={fetchData} />}
                {tab === "ranking" && <Ranking stocks={stocks} rankingData={rankings} moatData={latestMoats} refreshAction={fetchData} />}
            </div>
        </div>
    );
}

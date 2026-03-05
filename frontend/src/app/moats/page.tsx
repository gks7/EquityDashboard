"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import {
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    ScatterChart, Scatter, Cell, LabelList
} from "recharts";
import { Search } from "lucide-react";

// --- API Endpoints ---
const API_BASE = "http://127.0.0.1:8000/api";

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

// --- Moat Scoring ────────────────────────────────────────────────────────
const Scoring = ({ stocks, moatHistory, refreshAction }: any) => {
    const [sel, setSel] = useState<string>(stocks[0]?.ticker || "");
    const [analyst, setAnalyst] = useState(ANALYSTS[0]);
    const [draft, setDraft] = useState<any>({});
    const [sFilter, setSFilter] = useState("");
    const [saving, setSaving] = useState(false);

    const co = stocks.find((c: any) => c.ticker === sel) || stocks[0];
    if (!co) return null;

    const latest = useMemo(() => {
        const arr = (moatHistory[sel] || []).filter((e: any) => e.analyst_name === analyst);
        return arr.length > 0 ? arr[0] : null;
    }, [moatHistory, sel, analyst]);

    const dk = `${sel}-${analyst}`;
    const gs = (cat: string) => draft[dk]?.[cat] ?? latest?.[cat] ?? 1;
    const ss = (cat: string, v: number) => {
        setTimeout(() => { // small delay for UI responsiveness
            setDraft((p: any) => ({ ...p, [dk]: { ...(p[dk] || latest || {}), [cat]: v } }));
        }, 0);
    };

    const save = async () => {
        setSaving(true);
        const scores = CATS.reduce((a: any, c) => { a[c.key === 'switch_costs' ? 'switchCosts' : c.key === 'physical_assets' ? 'physicalAssets' : c.key === 'network_effects' ? 'networkEffects' : c.key] = gs(c.key); return a; }, {});
        await fetch(`${API_BASE}/moats/scores/save_score/`, {
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

    return (
        <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-6">
            <Card style={{ maxHeight: '80vh', overflowY: 'auto' }}>
                <div className="mb-4 flex items-center gap-2 bg-slate-50 dark:bg-slate-800 rounded-lg px-3 py-2 border border-slate-200 dark:border-slate-700">
                    <Search size={14} className="text-slate-400" />
                    <input
                        value={sFilter} onChange={(e) => setSFilter(e.target.value)}
                        placeholder="Search company..."
                        className="bg-transparent border-none outline-none text-sm w-full text-slate-900 dark:text-white"
                    />
                </div>
                <div className="flex flex-col gap-1">
                    {filtCo.map((c: any) => (
                        <button
                            key={c.ticker}
                            onClick={() => setSel(c.ticker)}
                            className={`flex justify-between items-center w-full px-3 py-2 rounded-lg text-left text-sm transition-colors ${sel === c.ticker ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-bold' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                        >
                            <span className="truncate pr-2">{c.company_name || c.ticker}</span>
                            <span className="text-xs font-mono text-slate-400">{c.ticker}</span>
                        </button>
                    ))}
                </div>
            </Card>

            <div className="flex flex-col gap-6">
                <Card>
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">{co.company_name || co.ticker} <span className="text-slate-400 text-lg font-normal">({co.ticker})</span></h2>
                        <div className="flex items-center gap-3">
                            <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Analyst</span>
                            <select
                                value={analyst} onChange={(e) => setAnalyst(e.target.value)}
                                className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-semibold text-slate-900 dark:text-white outline-none"
                            >
                                {ANALYSTS.map(a => <option key={a} value={a}>{a}</option>)}
                            </select>
                        </div>
                    </div>

                    <div className="flex flex-col lg:flex-row gap-8">
                        <div className="flex-1 space-y-4">
                            {CATS.map(cat => {
                                const v = gs(cat.key);
                                return (
                                    <div key={cat.key} className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl">
                                        <div className="flex justify-between items-center mb-3">
                                            <span className="font-bold text-sm text-slate-800 dark:text-slate-200">{cat.label}</span>
                                            <span className={`font-black text-lg ${v >= 4 ? 'text-emerald-500' : v >= 3 ? 'text-amber-500' : 'text-rose-500'}`}>{v}</span>
                                        </div>
                                        <div className="flex gap-2">
                                            {[1, 2, 3, 4, 5].map(n => (
                                                <button
                                                    key={n}
                                                    onClick={() => ss(cat.key, n)}
                                                    className={`flex-1 py-1.5 rounded-md text-sm font-bold transition-all border-2 ${n === v
                                                        ? (v >= 4 ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-500 text-emerald-600 dark:text-emerald-400'
                                                            : v >= 3 ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-500 text-amber-600 dark:text-amber-400'
                                                                : 'bg-rose-50 dark:bg-rose-900/20 border-rose-500 text-rose-600 dark:text-rose-400')
                                                        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400 hover:border-slate-300 dark:hover:border-slate-600'
                                                        }`}
                                                >
                                                    {n}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}

                            <button
                                onClick={save}
                                disabled={!ch || saving}
                                className={`w-full py-3 rounded-xl font-bold text-sm transition-all ${ch && !saving
                                    ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-md'
                                    : 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
                                    }`}
                            >
                                {saving ? "Saving..." : "Save Score"}
                            </button>
                        </div>

                        <div className="flex flex-col items-center justify-center lg:w-48 bg-slate-50 dark:bg-slate-800/50 rounded-xl p-6">
                            <Gauge score={tot} size={140} />
                            <div className="mt-4 font-bold text-slate-400 uppercase tracking-widest text-xs">Composite Score</div>
                            <div className={`mt-1 text-3xl font-black ${tot >= 18 ? 'text-emerald-500' : tot >= 13 ? 'text-amber-500' : 'text-rose-500'}`}>
                                {mp({ total_score: tot } as MoatScore)}%
                            </div>
                        </div>
                    </div>
                </Card>

                {cHist.length > 0 && (
                    <Card>
                        <h3 className="font-bold text-slate-900 dark:text-white mb-4">Score History</h3>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="text-xs text-slate-500 uppercase bg-slate-50 dark:bg-slate-800">
                                    <tr>
                                        <th className="px-4 py-3 rounded-tl-lg">Date</th>
                                        <th className="px-4 py-3">Analyst</th>
                                        {CATS.map(c => <th key={c.key} className="px-4 py-3 text-center">{c.label.split(' ')[0]}</th>)}
                                        <th className="px-4 py-3 text-center rounded-tr-lg">Total</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {cHist.map((h: any) => (
                                        <tr key={h.id} className="border-b border-slate-100 dark:border-slate-800 last:border-0">
                                            <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">
                                                {new Date(h.created_at).toLocaleDateString()}
                                            </td>
                                            <td className="px-4 py-3 text-blue-600 dark:text-blue-400 font-semibold">{h.analyst_name}</td>
                                            {CATS.map(c => (
                                                <td key={c.key} className="px-4 py-3 text-center font-bold text-slate-600 dark:text-slate-300">{h[c.key]}</td>
                                            ))}
                                            <td className={`px-4 py-3 text-center font-black ${h.total_score >= 18 ? 'text-emerald-500' : h.total_score >= 13 ? 'text-amber-500' : 'text-rose-500'}`}>
                                                {h.total_score}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </Card>
                )}
            </div>
        </div>
    );
};

// --- Moat Ranking ────────────────────────────────────────────────────────
const Ranking = ({ stocks, rankingData, refreshAction }: any) => {
    const [analyst, setAnalyst] = useState(ANALYSTS[0]);
    const [order, setOrder] = useState<string[]>([]);
    const [dirty, setDirty] = useState(false);
    const [saving, setSaving] = useState(false);
    const [dragIdx, setDragIdx] = useState<number | null>(null);

    const nameMap = useMemo(() => {
        const m: any = {};
        stocks.forEach((c: any) => { m[c.ticker] = c.company_name || c.ticker; });
        return m;
    }, [stocks]);

    const hasSaved = useMemo(() => rankingData.some((r: any) => r.analyst_name === analyst), [rankingData, analyst]);

    useEffect(() => {
        const arr = rankingData.filter((r: any) => r.analyst_name === analyst).sort((a: any, b: any) => a.rank - b.rank);
        if (arr.length > 0) {
            const tickers = arr.map((r: any) => r.stock); // API might return stock ID or ticker, we assume we mapped it. Wait! Let's ensure API returns ticker.
            // We need to match it against stocks list properly.
            // Quick fix for this UI: if the API returns stock (which is an ID), we need to resolve it to a ticker.
            // So let's map it safely.
            const tickerList = arr.map((r: any) => {
                const s = stocks.find((st: any) => st.id === r.stock);
                return s ? s.ticker : null;
            }).filter(Boolean);

            const missing = stocks.filter((c: any) => !tickerList.includes(c.ticker)).map((c: any) => c.ticker);
            setOrder([...tickerList, ...missing]);
        } else {
            setOrder(stocks.map((c: any) => c.ticker));
        }
        setDirty(false);
    }, [analyst, rankingData, stocks]);

    const handleDragStart = (idx: number) => (e: any) => { setDragIdx(idx); e.dataTransfer.effectAllowed = "move"; };
    const handleDragOver = (idx: number) => (e: any) => {
        e.preventDefault();
        if (dragIdx === null || idx === dragIdx) return;
        setOrder((prev) => {
            const next = [...prev];
            const [moved] = next.splice(dragIdx, 1);
            next.splice(idx, 0, moved);
            return next;
        });
        setDragIdx(idx);
        setDirty(true);
    };
    const handleDragEnd = () => setDragIdx(null);

    const save = async () => {
        setSaving(true);
        const rankingsBody = order.map((ticker, i) => ({ ticker, rank: i + 1 }));
        await fetch(`${API_BASE}/moats/rankings/save_ranking/`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ analyst, rankings: rankingsBody })
        });
        await refreshAction();
        setSaving(false);
    };

    const clear = async () => {
        setSaving(true);
        await fetch(`${API_BASE}/moats/rankings/clear_ranking/?analyst=${encodeURIComponent(analyst)}`, { method: 'DELETE' });
        await refreshAction();
        setSaving(false);
    };

    return (
        <Card className="max-w-3xl mx-auto">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white">Cohort Ranking</h2>
                    <p className="text-sm text-slate-500">Drag to reorder from strongest moat (#1) to weakest.</p>
                </div>

                <div className="flex items-center gap-3">
                    <select value={analyst} onChange={e => setAnalyst(e.target.value)} className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-semibold outline-none text-slate-900 dark:text-white">
                        {ANALYSTS.map(a => <option key={a} value={a}>{a}</option>)}
                    </select>
                    <button onClick={save} disabled={!dirty || saving} className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${dirty ? 'bg-blue-600 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-400'}`}>Save</button>
                    {hasSaved && <button onClick={clear} disabled={saving} className="px-4 py-1.5 rounded-lg border border-red-200 text-red-600 text-sm font-bold hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-900/30">Reset</button>}
                </div>
            </div>

            <div className="max-h-[600px] overflow-y-auto pr-2 space-y-2">
                {order.map((ticker, idx) => (
                    <div
                        key={ticker} draggable onDragStart={handleDragStart(idx)} onDragOver={handleDragOver(idx)} onDragEnd={handleDragEnd}
                        className={`flex items-center gap-4 p-3 rounded-xl cursor-grab border-2 transition-all ${dragIdx === idx ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-transparent bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
                    >
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-sm ${idx < 3 ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30' : idx < 10 ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30' : 'bg-slate-200 text-slate-500 dark:bg-slate-700'}`}>
                            {idx + 1}
                        </div>
                        <div className="flex-1">
                            <div className="font-bold text-sm text-slate-900 dark:text-white">{nameMap[ticker]}</div>
                            <div className="text-xs font-mono text-slate-500">{ticker}</div>
                        </div>
                        <div className="text-slate-400 cursor-grab px-2">≡</div>
                    </div>
                ))}
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
            // Fetch stocks and portfolio snapshot
            const [resSt, resPort] = await Promise.all([
                fetch(`${API_BASE}/stocks/`),
                fetch(`${API_BASE}/portfolio/`)
            ]);

            const stData = await resSt.json();
            const portData = await resPort.json();

            // Extract unique tickers from portfolio
            const portTickers = new Set(portData.map((p: any) => p.ticker));

            // Filter stocks to only include those in the portfolio
            const activeStocks = stData.filter((s: any) => portTickers.has(s.ticker));
            setStocks(activeStocks.length > 0 ? activeStocks : stData); // Fallback to all if portfolio is empty

            // Fetch moat scores history
            const resSc = await fetch(`${API_BASE}/moats/scores/`);
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
            const resRk = await fetch(`${API_BASE}/moats/rankings/`);
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
                {tab === "ranking" && <Ranking stocks={stocks} rankingData={rankings} refreshAction={fetchData} />}
            </div>
        </div>
    );
}

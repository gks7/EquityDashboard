"use client";

import { useState, useEffect, useCallback } from "react";
import { Save, RefreshCcw, TrendingUp, TrendingDown, Info } from "lucide-react";
import { authFetch } from "@/lib/authFetch";

// ─── Types ───────────────────────────────────────────────────────────────────

type ValMethod = "EV/Revenue" | "EV/EBITDA" | "P/E" | "Price/FCF";

interface SegmentConfig {
    name: string;
    color: string;
    method: ValMethod;
    defaultRevenue: number;    // $B
    defaultMargin: number;     // % (EBITDA or net margin depending on method)
    defaultMultiple: number;   // turns
    description: string;
}

interface TickerConfig {
    label: string;              // e.g. "Sum-of-the-Parts"
    targetYear: number;
    segments: SegmentConfig[];
    sharesOutstanding: number;  // billions
    defaultNetDebt: number;     // $B (negative = net cash)
    methodNote: string;
}

// ─── Per-Ticker Config Map ─────────────────────────────────────────────────

const TICKER_CONFIGS: Record<string, TickerConfig> = {
    AMZN: {
        label: "Sum-of-the-Parts",
        targetYear: 2031,
        sharesOutstanding: 10.7,
        defaultNetDebt: 20,
        methodNote: "AWS valued on EV/EBITDA, Retail on EV/Revenue (thin margins), Advertising on EV/EBITDA",
        segments: [
            {
                name: "AWS",
                color: "#f59e0b",
                method: "EV/EBITDA",
                defaultRevenue: 230,
                defaultMargin: 40,
                defaultMultiple: 22,
                description: "Cloud infrastructure & AI services"
            },
            {
                name: "Retail",
                color: "#3b82f6",
                method: "EV/Revenue",
                defaultRevenue: 520,
                defaultMargin: 6,
                defaultMultiple: 0.8,
                description: "North America + International e-commerce"
            },
            {
                name: "Advertising",
                color: "#8b5cf6",
                method: "EV/EBITDA",
                defaultRevenue: 120,
                defaultMargin: 55,
                defaultMultiple: 18,
                description: "Sponsored products, display, video ads"
            },
        ],
    },
    GOOGL: {
        label: "Sum-of-the-Parts",
        targetYear: 2031,
        sharesOutstanding: 12.2,
        defaultNetDebt: -100,
        methodNote: "Search & YouTube on EV/EBITDA, Cloud on EV/Revenue (growth stage), Other Bets excluded",
        segments: [
            {
                name: "Google Search",
                color: "#10b981",
                method: "EV/EBITDA",
                defaultRevenue: 280,
                defaultMargin: 45,
                defaultMultiple: 18,
                description: "Core search advertising"
            },
            {
                name: "YouTube",
                color: "#ef4444",
                method: "EV/EBITDA",
                defaultRevenue: 75,
                defaultMargin: 30,
                defaultMultiple: 18,
                description: "Video advertising & subscriptions"
            },
            {
                name: "Google Cloud",
                color: "#3b82f6",
                method: "EV/Revenue",
                defaultRevenue: 120,
                defaultMargin: 18,
                defaultMultiple: 8,
                description: "Cloud infrastructure, GCP, Workspace"
            },
            {
                name: "Other Bets",
                color: "#6b7280",
                method: "EV/Revenue",
                defaultRevenue: 10,
                defaultMargin: -50,
                defaultMultiple: 0,
                description: "Waymo, DeepMind products, Verily — venture stage"
            },
        ],
    },
    META: {
        label: "Sum-of-the-Parts",
        targetYear: 2031,
        sharesOutstanding: 2.5,
        defaultNetDebt: -50,
        methodNote: "Family of Apps on EV/EBITDA; Reality Labs valued on EV/Revenue as an option",
        segments: [
            {
                name: "Family of Apps",
                color: "#3b82f6",
                method: "EV/EBITDA",
                defaultRevenue: 280,
                defaultMargin: 52,
                defaultMultiple: 16,
                description: "Facebook, Instagram, WhatsApp, Messenger"
            },
            {
                name: "Reality Labs",
                color: "#8b5cf6",
                method: "EV/Revenue",
                defaultRevenue: 20,
                defaultMargin: -80,
                defaultMultiple: 3,
                description: "Quest headsets, Horizon Worlds, AR glasses"
            },
        ],
    },
    MSFT: {
        label: "Sum-of-the-Parts",
        targetYear: 2031,
        sharesOutstanding: 7.4,
        defaultNetDebt: -30,
        methodNote: "Productivity & Business Processes and Intelligent Cloud on EV/EBITDA; More Personal Computing on lower multiple",
        segments: [
            {
                name: "Intelligent Cloud",
                color: "#00bfff",
                method: "EV/EBITDA",
                defaultRevenue: 220,
                defaultMargin: 48,
                defaultMultiple: 22,
                description: "Azure, Windows Server, GitHub, SQL"
            },
            {
                name: "Productivity & Business",
                color: "#3b82f6",
                method: "EV/EBITDA",
                defaultRevenue: 180,
                defaultMargin: 52,
                defaultMultiple: 22,
                description: "Microsoft 365, Teams, Dynamics, LinkedIn"
            },
            {
                name: "More Personal Computing",
                color: "#6b7280",
                method: "EV/Revenue",
                defaultRevenue: 80,
                defaultMargin: 15,
                defaultMultiple: 2,
                description: "Windows OEM, Xbox, Bing, Surface"
            },
        ],
    },
};

// Generic fallback for unconfigured tickers
const DEFAULT_CONFIG = (ticker: string): TickerConfig => ({
    label: "Single-Segment P/E",
    targetYear: 2031,
    sharesOutstanding: 1.0,
    defaultNetDebt: 0,
    methodNote: `Simple EPS × Multiple model. Add ${ticker} to the config for a SOTP breakdown.`,
    segments: [
        {
            name: ticker,
            color: "#3b82f6",
            method: "P/E",
            defaultRevenue: 0,
            defaultMargin: 20,
            defaultMultiple: 20,
            description: "Net Income-based valuation"
        },
    ],
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function calcSegmentEV(
    seg: SegmentConfig,
    revenue: number,
    margin: number,
    multiple: number,
    method: ValMethod
): number {
    if (multiple <= 0 || revenue <= 0) return 0;
    switch (method) {
        case "EV/Revenue":
            return revenue * multiple;
        case "EV/EBITDA":
            return revenue * (margin / 100) * multiple;
        case "P/E":
            return revenue * (margin / 100) * multiple; // revenue here = total revenue
        case "Price/FCF":
            return revenue * (margin / 100) * multiple;
        default:
            return 0;
    }
}

function getMarginLabel(method: ValMethod): string {
    switch (method) {
        case "EV/Revenue": return "Op Margin (%)";
        case "EV/EBITDA": return "EBITDA Margin (%)";
        case "P/E": return "Net Margin (%)";
        case "Price/FCF": return "FCF Margin (%)";
    }
}

function getMultipleLabel(method: ValMethod): string {
    return method; // e.g. "EV/EBITDA"
}

// ─── State type per segment ───────────────────────────────────────────────

interface SegmentState {
    revenue: number;
    margin: number;
    multiple: number;
    method: ValMethod;
}

// ─── Props ──────────────────────────────────────────────────────────────────

interface ModelingTabProps {
    ticker: string;
    currentPrice: number;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ModelingTab({ ticker, currentPrice }: ModelingTabProps) {
    const config = TICKER_CONFIGS[ticker] ?? DEFAULT_CONFIG(ticker);

    // ── State init ────────────────────────────────────────────────────────────
    const initSegments = (): SegmentState[] =>
        config.segments.map((s) => ({
            revenue: s.defaultRevenue,
            margin: s.defaultMargin,
            multiple: s.defaultMultiple,
            method: s.method,
        }));

    const [segments, setSegments] = useState<SegmentState[]>(initSegments);
    const [netDebt, setNetDebt] = useState(config.defaultNetDebt);
    const [sharesOut, setSharesOut] = useState(config.sharesOutstanding);
    const [saving, setSaving] = useState(false);
    const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">("idle");
    const [loading, setLoading] = useState(true);

    // ── Load saved model ──────────────────────────────────────────────────────
    useEffect(() => {
        const load = async () => {
            try {
                const res = await authFetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/stocks/${ticker}/get_model/`);
                if (res.ok) {
                    const data = await res.json();
                    if (data.model_data && Object.keys(data.model_data).length > 0) {
                        const md = data.model_data;
                        if (md.segments) setSegments(md.segments);
                        if (md.netDebt !== undefined) setNetDebt(md.netDebt);
                        if (md.sharesOut !== undefined) setSharesOut(md.sharesOut);
                    }
                }
            } catch {
                // silently ignore — fallback to defaults
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [ticker]);

    // Reset when ticker changes
    useEffect(() => {
        setSegments(initSegments());
        setNetDebt(config.defaultNetDebt);
        setSharesOut(config.sharesOutstanding);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ticker]);

    // ── Calculations ──────────────────────────────────────────────────────────
    const segmentEVs = segments.map((s, i) =>
        calcSegmentEV(config.segments[i], s.revenue, s.margin, s.multiple, s.method)
    );
    const totalEV = segmentEVs.reduce((a, b) => a + b, 0);
    const equityValue = totalEV - netDebt;
    const impliedPrice = sharesOut > 0 ? (equityValue / sharesOut) : 0;
    const upsidePct = currentPrice > 0 ? ((impliedPrice / currentPrice) - 1) * 100 : 0;
    const irr5y = currentPrice > 0 && impliedPrice > 0
        ? (Math.pow(impliedPrice / currentPrice, 1 / (config.targetYear - 2026)) - 1) * 100
        : 0;
    const years = config.targetYear - 2026;

    // ── Segment update handler ────────────────────────────────────────────────
    const updateSegment = useCallback(
        (idx: number, field: keyof SegmentState, value: number | ValMethod) => {
            setSegments((prev) => {
                const updated = [...prev];
                updated[idx] = { ...updated[idx], [field]: value };
                return updated;
            });
        },
        []
    );

    // ── Save ──────────────────────────────────────────────────────────────────
    const handleSave = async () => {
        setSaving(true);
        setSaveStatus("idle");
        try {
            const res = await authFetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/stocks/${ticker}/save_model/`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ model_data: { segments, netDebt, sharesOut } }),
            });
            setSaveStatus(res.ok ? "success" : "error");
        } catch {
            setSaveStatus("error");
        } finally {
            setSaving(false);
            setTimeout(() => setSaveStatus("idle"), 3000);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-24">
                <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    const isSOTP = config.segments.length > 1;

    return (
        <div className="space-y-8">

            {/* ── Method Note Banner ──────────────────────────────────────────── */}
            <div className="flex items-start gap-3 px-5 py-3.5 rounded-xl border border-blue-500/20 bg-blue-500/5">
                <Info className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
                <div>
                    <span className="text-xs font-bold text-blue-300 uppercase tracking-widest mr-2">
                        {config.label} — {config.targetYear}E
                    </span>
                    <span className="text-xs text-slate-400">{config.methodNote}</span>
                </div>
            </div>

            {/* ── Main Grid ────────────────────────────────────────────────────── */}
            <div className="grid grid-cols-1 xl:grid-cols-5 gap-8">

                {/* Left — Input Table (3/5) */}
                <div className="xl:col-span-3 space-y-6">
                    <div className="bg-[#111827] rounded-xl border border-slate-800 overflow-hidden">
                        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
                            <h2 className="text-base font-bold text-white">Segment Projections ({config.targetYear}E)</h2>
                            <span className="text-xs text-slate-500 font-medium">All figures in $B</span>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b border-slate-800/80">
                                        <th className="px-4 py-3 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider w-36">Segment</th>
                                        <th className="px-3 py-3 text-right text-[11px] font-bold text-slate-500 uppercase tracking-wider">Method</th>
                                        <th className="px-3 py-3 text-right text-[11px] font-bold text-slate-500 uppercase tracking-wider">Revenue</th>
                                        <th className="px-3 py-3 text-right text-[11px] font-bold text-slate-500 uppercase tracking-wider">Margin</th>
                                        <th className="px-3 py-3 text-right text-[11px] font-bold text-slate-500 uppercase tracking-wider">Multiple</th>
                                        <th className="px-3 py-3 text-right text-[11px] font-bold text-slate-500 uppercase tracking-wider">EV ($B)</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800/50">
                                    {config.segments.map((seg, i) => {
                                        const s = segments[i];
                                        const ev = segmentEVs[i];
                                        const evShare = totalEV > 0 ? (ev / totalEV) * 100 : 0;
                                        return (
                                            <tr key={seg.name} className="group">
                                                {/* Segment name */}
                                                <td className="px-4 py-4">
                                                    <div className="flex items-center gap-2.5">
                                                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: seg.color }} />
                                                        <div>
                                                            <div className="text-sm font-semibold text-white leading-tight">{seg.name}</div>
                                                            <div className="text-[10px] text-slate-500 leading-tight mt-0.5 hidden xl:block max-w-[120px] truncate">{seg.description}</div>
                                                        </div>
                                                    </div>
                                                </td>

                                                {/* Method selector */}
                                                <td className="px-2 py-4 text-right">
                                                    <select
                                                        value={s.method}
                                                        onChange={(e) => updateSegment(i, "method", e.target.value as ValMethod)}
                                                        className="text-[11px] font-mono font-bold rounded-md px-2 py-1.5 border border-slate-700 bg-slate-800/80 text-blue-300 focus:ring-1 focus:ring-blue-500 focus:outline-none cursor-pointer"
                                                    >
                                                        <option value="EV/Revenue">EV/Rev</option>
                                                        <option value="EV/EBITDA">EV/EBITDA</option>
                                                        <option value="P/E">P/E</option>
                                                        <option value="Price/FCF">P/FCF</option>
                                                    </select>
                                                </td>

                                                {/* Revenue */}
                                                <td className="px-2 py-4 text-right">
                                                    <div className="relative inline-block">
                                                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500 text-xs pointer-events-none">$</span>
                                                        <input
                                                            type="number"
                                                            value={s.revenue}
                                                            min={0}
                                                            onChange={(e) => updateSegment(i, "revenue", Number(e.target.value))}
                                                            className="w-20 pl-5 pr-2 py-1.5 text-sm text-right font-mono text-white bg-slate-800/80 border border-slate-700 rounded-md focus:ring-1 focus:ring-blue-500 focus:outline-none focus:border-blue-500 transition-colors"
                                                        />
                                                    </div>
                                                </td>

                                                {/* Margin */}
                                                <td className="px-2 py-4 text-right">
                                                    <div className="relative inline-block group/tip">
                                                        <input
                                                            type="number"
                                                            value={s.margin}
                                                            onChange={(e) => updateSegment(i, "margin", Number(e.target.value))}
                                                            className="w-20 pr-6 pl-2 py-1.5 text-sm text-right font-mono text-white bg-slate-800/80 border border-slate-700 rounded-md focus:ring-1 focus:ring-blue-500 focus:outline-none focus:border-blue-500 transition-colors"
                                                            title={getMarginLabel(s.method)}
                                                        />
                                                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 text-xs pointer-events-none">%</span>
                                                    </div>
                                                </td>

                                                {/* Multiple */}
                                                <td className="px-2 py-4 text-right">
                                                    <div className="relative inline-block">
                                                        <input
                                                            type="number"
                                                            value={s.multiple}
                                                            min={0}
                                                            step={0.5}
                                                            onChange={(e) => updateSegment(i, "multiple", Number(e.target.value))}
                                                            className="w-20 pr-5 pl-2 py-1.5 text-sm text-right font-mono text-white bg-slate-800/80 border border-slate-700 rounded-md focus:ring-1 focus:ring-blue-500 focus:outline-none focus:border-blue-500 transition-colors"
                                                        />
                                                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 text-xs pointer-events-none">x</span>
                                                    </div>
                                                </td>

                                                {/* EV output */}
                                                <td className="px-4 py-4 text-right">
                                                    <div className="flex flex-col items-end gap-1">
                                                        <span className="text-sm font-bold font-mono text-white">
                                                            ${ev.toFixed(1)}B
                                                        </span>
                                                        {isSOTP && totalEV > 0 && (
                                                            <div className="w-12 h-1 rounded-full overflow-hidden bg-slate-800">
                                                                <div
                                                                    className="h-full rounded-full transition-all duration-300"
                                                                    style={{ width: `${evShare}%`, background: seg.color }}
                                                                />
                                                            </div>
                                                        )}
                                                        {isSOTP && (
                                                            <span className="text-[10px] text-slate-500 font-mono">{evShare.toFixed(1)}%</span>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>

                                {/* Totals footer */}
                                <tfoot>
                                    <tr className="border-t-2 border-slate-700 bg-slate-800/30">
                                        <td colSpan={5} className="px-4 py-4 text-sm font-bold text-slate-300 uppercase tracking-wider">
                                            Total Enterprise Value
                                        </td>
                                        <td className="px-4 py-4 text-right text-sm font-bold font-mono text-white">
                                            ${totalEV.toFixed(1)}B
                                        </td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>

                    {/* Bridge: EV → Equity → Price */}
                    <div className="bg-[#111827] rounded-xl border border-slate-800 p-6">
                        <h3 className="text-sm font-bold text-slate-300 mb-5 uppercase tracking-wider">EV Bridge to Equity Value</h3>
                        <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                            <div>
                                <label className="block text-xs font-medium text-slate-400 mb-1.5">Net Debt ($B)
                                    <span className="text-slate-600 ml-1 font-normal">(negative = net cash)</span>
                                </label>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm pointer-events-none">$</span>
                                    <input
                                        type="number"
                                        value={netDebt}
                                        step={1}
                                        onChange={(e) => setNetDebt(Number(e.target.value))}
                                        className="w-full pl-7 pr-3 py-2 text-sm font-mono text-white bg-slate-800/80 border border-slate-700 rounded-lg focus:ring-1 focus:ring-blue-500 focus:outline-none focus:border-blue-500 transition-colors"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-400 mb-1.5">Shares Outstanding (B)
                                </label>
                                <input
                                    type="number"
                                    value={sharesOut}
                                    step={0.1}
                                    min={0.01}
                                    onChange={(e) => setSharesOut(Number(e.target.value))}
                                    className="w-full px-3 py-2 text-sm font-mono text-white bg-slate-800/80 border border-slate-700 rounded-lg focus:ring-1 focus:ring-blue-500 focus:outline-none focus:border-blue-500 transition-colors"
                                />
                            </div>
                        </div>

                        {/* Bridge visual */}
                        <div className="mt-6 space-y-2">
                            <BridgeRow label="Total EV" value={totalEV} prefix="$" suffix="B" sign={false} />
                            <BridgeRow label={netDebt < 0 ? "( + ) Net Cash" : "( − ) Net Debt"} value={-netDebt} prefix="$" suffix="B" sign={true} />
                            <div className="border-t border-slate-700 pt-2">
                                <BridgeRow label="Equity Value" value={equityValue} prefix="$" suffix="B" sign={false} highlight />
                            </div>
                            <BridgeRow label={`÷ Shares Outstanding`} value={sharesOut} suffix="B shs" sign={false} />
                            <div className="border-t border-slate-700 pt-2">
                                <BridgeRow label={`Implied Price (${config.targetYear}E)`} value={impliedPrice} prefix="$" sign={false} highlight />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right — Summary + Chart (2/5) */}
                <div className="xl:col-span-2 space-y-6">

                    {/* KPI Cards */}
                    <div className="grid grid-cols-1 gap-4">
                        <KPICard
                            label="Total EV"
                            value={`$${totalEV.toFixed(1)}B`}
                            sub={`Equity: $${equityValue.toFixed(1)}B`}
                            color="#3b82f6"
                        />
                        <KPICard
                            label="Implied Price"
                            value={`$${impliedPrice.toFixed(2)}`}
                            sub={`Current: $${currentPrice.toFixed(2)}`}
                            color="#10b981"
                        />
                        <div
                            className="rounded-xl border p-5 flex flex-col gap-1"
                            style={{
                                borderColor: upsidePct >= 0 ? "rgba(16,185,129,0.25)" : "rgba(239,68,68,0.25)",
                                background: upsidePct >= 0 ? "rgba(16,185,129,0.05)" : "rgba(239,68,68,0.05)"
                            }}
                        >
                            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                                Upside / Downside
                            </span>
                            <div className="flex items-center gap-2 mt-1">
                                {upsidePct >= 0
                                    ? <TrendingUp className="w-5 h-5 text-emerald-400" />
                                    : <TrendingDown className="w-5 h-5 text-rose-400" />
                                }
                                <span className={`text-2xl font-black font-mono ${upsidePct >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                    {upsidePct >= 0 ? "+" : ""}{upsidePct.toFixed(1)}%
                                </span>
                            </div>
                            <span className="text-xs text-slate-500 mt-0.5">
                                Implied {years}Y IRR: <span className={`font-bold ${irr5y >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{irr5y.toFixed(1)}%</span>
                            </span>
                        </div>
                    </div>

                    {/* SOTP Waterfall Chart */}
                    {isSOTP && (
                        <div className="bg-[#111827] rounded-xl border border-slate-800 p-6">
                            <h3 className="text-sm font-bold text-slate-300 mb-6 uppercase tracking-wider">EV Breakdown</h3>
                            <SOTPChart
                                segments={config.segments.map((s, i) => ({
                                    name: s.name,
                                    color: s.color,
                                    ev: segmentEVs[i],
                                }))}
                                totalEV={totalEV}
                            />
                        </div>
                    )}

                    {/* Save button */}
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="w-full flex items-center justify-center gap-2 py-3.5 px-6 rounded-xl font-bold text-sm transition-all focus:outline-none focus:ring-2 focus:ring-blue-500"
                        style={{
                            background: saveStatus === "success"
                                ? "rgba(16,185,129,0.15)"
                                : saveStatus === "error"
                                    ? "rgba(239,68,68,0.15)"
                                    : "rgba(59,130,246,0.15)",
                            border: `1px solid ${saveStatus === "success" ? "rgba(16,185,129,0.35)" : saveStatus === "error" ? "rgba(239,68,68,0.35)" : "rgba(59,130,246,0.35)"}`,
                            color: saveStatus === "success" ? "#34d399" : saveStatus === "error" ? "#f87171" : "#60a5fa",
                        }}
                    >
                        {saving
                            ? <><RefreshCcw className="w-4 h-4 animate-spin" /> Saving…</>
                            : saveStatus === "success"
                                ? "✓ Model Saved"
                                : saveStatus === "error"
                                    ? "✕ Save Failed — Retry"
                                    : <><Save className="w-4 h-4" /> Save Model</>
                        }
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Sub-Components ───────────────────────────────────────────────────────────

function KPICard({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
    return (
        <div
            className="rounded-xl border p-5 flex flex-col gap-1"
            style={{ borderColor: `${color}33`, background: `${color}0d` }}
        >
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{label}</span>
            <span className="text-2xl font-black font-mono" style={{ color }}>{value}</span>
            {sub && <span className="text-xs text-slate-500">{sub}</span>}
        </div>
    );
}

function BridgeRow({
    label, value, prefix = "", suffix = "", sign, highlight,
}: {
    label: string;
    value: number;
    prefix?: string;
    suffix?: string;
    sign: boolean;
    highlight?: boolean;
}) {
    const isNeg = value < 0;
    const formatted = `${prefix}${Math.abs(value).toFixed(1)}${suffix ? " " + suffix : ""}`;
    return (
        <div className={`flex justify-between items-center py-1 ${highlight ? "py-2" : ""}`}>
            <span className={`text-sm ${highlight ? "font-bold text-white" : "text-slate-400"}`}>{label}</span>
            <span className={`text-sm font-mono font-bold ${highlight
                ? "text-white text-base"
                : sign
                    ? isNeg ? "text-rose-400" : "text-emerald-400"
                    : "text-slate-300"
                }`}>
                {sign && !isNeg ? "+" : sign && isNeg ? "-" : ""}{formatted}
            </span>
        </div>
    );
}

function SOTPChart({
    segments,
    totalEV,
}: {
    segments: { name: string; color: string; ev: number }[];
    totalEV: number;
}) {
    if (totalEV <= 0) return (
        <p className="text-slate-500 text-sm text-center py-4">Enter segment values to see breakdown</p>
    );

    const barHeight = 36;
    const gap = 12;
    const labelWidth = 96;
    const valueWidth = 70;
    const chartPadding = 12;
    const maxBarWidth = 260; // px budget for bar area
    const svgWidth = labelWidth + maxBarWidth + valueWidth + chartPadding * 2;
    const svgHeight = segments.length * (barHeight + gap) - gap + 8;

    return (
        <svg
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            className="w-full overflow-visible"
            style={{ minHeight: svgHeight }}
        >
            {segments.map((seg, i) => {
                const frac = totalEV > 0 ? Math.max(seg.ev / totalEV, 0) : 0;
                const barW = frac * maxBarWidth;
                const y = i * (barHeight + gap);
                const pct = (frac * 100).toFixed(1);

                return (
                    <g key={seg.name}>
                        {/* Segment label */}
                        <text
                            x={labelWidth - 8}
                            y={y + barHeight / 2 + 4}
                            textAnchor="end"
                            fontSize="11"
                            fontWeight="600"
                            fill="#94a3b8"
                            fontFamily="system-ui, sans-serif"
                        >
                            {seg.name}
                        </text>

                        {/* Background track */}
                        <rect
                            x={labelWidth}
                            y={y}
                            width={maxBarWidth}
                            height={barHeight}
                            rx={6}
                            fill="rgba(30,41,59,0.6)"
                        />

                        {/* Filled bar */}
                        <rect
                            x={labelWidth}
                            y={y}
                            width={barW}
                            height={barHeight}
                            rx={6}
                            fill={seg.color}
                            opacity={0.85}
                        />

                        {/* Inline pct label */}
                        {barW > 40 && (
                            <text
                                x={labelWidth + barW - 8}
                                y={y + barHeight / 2 + 4}
                                textAnchor="end"
                                fontSize="10"
                                fontWeight="700"
                                fill="white"
                                fontFamily="system-ui, sans-serif"
                            >
                                {pct}%
                            </text>
                        )}

                        {/* EV value label */}
                        <text
                            x={labelWidth + maxBarWidth + 10}
                            y={y + barHeight / 2 + 4}
                            textAnchor="start"
                            fontSize="11"
                            fontWeight="700"
                            fill="#e2e8f0"
                            fontFamily="'Courier New', monospace"
                        >
                            ${seg.ev.toFixed(0)}B
                        </text>
                    </g>
                );
            })}
        </svg>
    );
}

"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
    Save,
    RefreshCcw,
    Info,
    Wand2,
    Plus,
    Minus,
} from "lucide-react";
import { authFetch } from "@/lib/authFetch";
import type { MacroPayload, MacroIndicator } from "@/lib/macroColors";

export interface BridgeDefaults {
    marketGrowth: number;       // nominal market growth (macro)
    cardPenetration: number;    // secular cash → card
    crossBorderMix: number;     // travel, mix shift, etc.
    netYield: number;           // pricing + VAS
    marginExpansion: number;    // operating leverage / mix
    netBuyback: number;         // buyback yield net of SBC
    dividendYield: number;
    multipleRerate: number;     // annual % change in P/E
}

type BridgeState = BridgeDefaults;

interface Props {
    ticker: string;
    currentPrice: number;
    defaults: BridgeDefaults;
    macroDriver: string;
    methodNote: string;
    targetYear: number;
}

interface BridgeLine {
    key: keyof BridgeDefaults;
    label: string;
    desc: string;
    color: string;
    group: "volume" | "revenue" | "earnings" | "shareholder" | "rerate";
    allowNegative?: boolean;
}

const LINES: BridgeLine[] = [
    {
        key: "marketGrowth",
        label: "Nominal market growth",
        desc: "Macro tailwind — nominal PCE YoY",
        color: "#0ea5e9",
        group: "volume",
    },
    {
        key: "cardPenetration",
        label: "Card penetration",
        desc: "Secular cash → card / digital shift",
        color: "#06b6d4",
        group: "volume",
    },
    {
        key: "crossBorderMix",
        label: "Cross-border / mix",
        desc: "Travel volumes, premium mix, B2B",
        color: "#0891b2",
        group: "volume",
    },
    {
        key: "netYield",
        label: "Net yield expansion",
        desc: "Pricing + value-added services",
        color: "#22c55e",
        group: "revenue",
    },
    {
        key: "marginExpansion",
        label: "Margin expansion",
        desc: "Operating leverage on a fixed cost base",
        color: "#16a34a",
        group: "earnings",
    },
    {
        key: "netBuyback",
        label: "Net buyback yield",
        desc: "Share buybacks net of SBC dilution",
        color: "#a855f7",
        group: "shareholder",
    },
    {
        key: "dividendYield",
        label: "Dividend yield",
        desc: "Cash returned to shareholders",
        color: "#c084fc",
        group: "shareholder",
    },
    {
        key: "multipleRerate",
        label: "Multiple re-rate",
        desc: "Annual change in P/E (±2% range typical)",
        color: "#f59e0b",
        group: "rerate",
        allowNegative: true,
    },
];

const GROUP_LABELS: Record<BridgeLine["group"], string> = {
    volume: "Volume tailwind",
    revenue: "Revenue growth",
    earnings: "Earnings growth",
    shareholder: "Capital return",
    rerate: "Multiple",
};

function findIndicator(
    payload: MacroPayload | null,
    name: string
): MacroIndicator | null {
    if (!payload) return null;
    for (const s of payload.sections) {
        for (const i of s.indicators) {
            if (i.name === name) return i;
        }
    }
    return null;
}

function latestZ(i: MacroIndicator | null): number | null {
    if (!i) return null;
    const cell = i.cells[i.cells.length - 1];
    return cell?.z ?? null;
}

function latestValue(i: MacroIndicator | null): number | null {
    if (!i) return null;
    for (let idx = i.cells.length - 1; idx >= 0; idx--) {
        const v = i.cells[idx].value;
        if (v !== null) return v;
    }
    return null;
}

export default function GrowthBridgeTab({
    ticker,
    currentPrice,
    defaults,
    macroDriver,
    methodNote,
    targetYear,
}: Props) {
    const [bridge, setBridge] = useState<BridgeState>(defaults);
    const [macro, setMacro] = useState<MacroPayload | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">(
        "idle"
    );

    // ── Load saved bridge ─────────────────────────────────────────────────
    useEffect(() => {
        const load = async () => {
            try {
                const res = await authFetch(
                    `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/stocks/${ticker}/get_model/`
                );
                if (res.ok) {
                    const data = await res.json();
                    const md = data.model_data;
                    if (md && md.bridge && typeof md.bridge === "object") {
                        setBridge({ ...defaults, ...md.bridge });
                    }
                }
            } catch {
                /* fall back to defaults */
            } finally {
                setLoading(false);
            }
        };
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ticker]);

    // ── Reset when ticker changes ─────────────────────────────────────────
    useEffect(() => {
        setBridge(defaults);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ticker]);

    // ── Load macro.json (same file the macro page uses) ──────────────────
    useEffect(() => {
        fetch("/data/macro.json", { cache: "no-store" })
            .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
            .then((data: MacroPayload) => setMacro(data))
            .catch(() => {
                /* silently — macro cards just won't show */
            });
    }, []);

    const macroDriverInd = useMemo(
        () => findIndicator(macro, macroDriver),
        [macro, macroDriver]
    );
    const macroDriverLatest = useMemo(
        () => latestValue(macroDriverInd),
        [macroDriverInd]
    );

    // ── Math ──────────────────────────────────────────────────────────────
    const totals = useMemo(() => {
        const vol =
            bridge.marketGrowth +
            bridge.cardPenetration +
            bridge.crossBorderMix;
        const rev = vol + bridge.netYield;
        const earn = rev + bridge.marginExpansion;
        const shareReturn = earn + bridge.netBuyback;
        const irr =
            shareReturn + bridge.dividendYield + bridge.multipleRerate;
        return { vol, rev, earn, shareReturn, irr };
    }, [bridge]);

    const years = targetYear - 2026;
    const compoundedReturn =
        years > 0
            ? (Math.pow(1 + totals.irr / 100, years) - 1) * 100
            : totals.irr;
    const impliedPrice =
        years > 0
            ? currentPrice * Math.pow(1 + totals.irr / 100, years)
            : currentPrice;

    const update = useCallback(
        (key: keyof BridgeDefaults, value: number) => {
            setBridge((prev) => ({ ...prev, [key]: value }));
        },
        []
    );

    const autoFillMacro = useCallback(() => {
        if (macroDriverLatest !== null) {
            update("marketGrowth", Math.round(macroDriverLatest * 10) / 10);
        }
    }, [macroDriverLatest, update]);

    const resetDefaults = useCallback(() => {
        setBridge(defaults);
    }, [defaults]);

    const save = useCallback(async () => {
        setSaving(true);
        setSaveStatus("idle");
        try {
            const res = await authFetch(
                `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/stocks/${ticker}/save_model/`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ model_data: { bridge } }),
                }
            );
            setSaveStatus(res.ok ? "success" : "error");
        } catch {
            setSaveStatus("error");
        } finally {
            setSaving(false);
            setTimeout(() => setSaveStatus("idle"), 2500);
        }
    }, [bridge, ticker]);

    if (loading) {
        return (
            <div className="text-sm text-slate-500 dark:text-slate-400 p-6">
                Loading saved model…
            </div>
        );
    }

    // ── Macro cards ───────────────────────────────────────────────────────
    const macroCards = [
        { name: "Nominal PCE", label: "Nominal consumer spending" },
        { name: "Real GDP", label: "Real GDP growth" },
        { name: "Retail Sales", label: "Retail sales" },
        { name: "CPI", label: "Headline inflation" },
    ];

    return (
        <div className="space-y-5">
            {/* Macro driver cards */}
            {macro && (
                <div>
                    <div className="flex items-center justify-between mb-2">
                        <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">
                            Macro context (FRED)
                        </h3>
                        <span className="text-[11px] text-slate-500">
                            latest YoY %
                        </span>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        {macroCards.map((m) => {
                            const ind = findIndicator(macro, m.name);
                            const v = latestValue(ind);
                            const z = latestZ(ind);
                            const isMacroDriver = m.name === macroDriver;
                            return (
                                <div
                                    key={m.name}
                                    className={`rounded-lg border px-3 py-2 ${
                                        isMacroDriver
                                            ? "border-sky-500/40 bg-sky-500/5"
                                            : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
                                    }`}
                                >
                                    <div className="text-[10px] uppercase tracking-wider text-slate-500 flex items-center gap-1">
                                        {m.label}
                                        {isMacroDriver && (
                                            <span className="text-sky-600 dark:text-sky-400 font-semibold">
                                                · driver
                                            </span>
                                        )}
                                    </div>
                                    <div className="text-base font-bold tabular-nums text-slate-900 dark:text-white mt-0.5">
                                        {v === null ? "—" : `${v.toFixed(1)}%`}
                                    </div>
                                    {z !== null && (
                                        <div className="text-[10px] text-slate-400">
                                            z {z >= 0 ? "+" : ""}
                                            {z.toFixed(2)}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                            IRR Bridge ({ticker})
                        </h3>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                            All inputs annualized. Approximate addition; for
                            compounded over {years}y see below.
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={autoFillMacro}
                            disabled={macroDriverLatest === null}
                            title={
                                macroDriverLatest === null
                                    ? `${macroDriver} not yet available`
                                    : `Use latest ${macroDriver} (${macroDriverLatest.toFixed(1)}%)`
                            }
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-sky-300 dark:border-sky-700 text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-900/20 hover:bg-sky-100 dark:hover:bg-sky-900/30 disabled:opacity-50 transition-colors"
                        >
                            <Wand2 className="w-3.5 h-3.5" />
                            Auto-fill macro
                        </button>
                        <button
                            onClick={resetDefaults}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                        >
                            <RefreshCcw className="w-3.5 h-3.5" />
                            Reset
                        </button>
                        <button
                            onClick={save}
                            disabled={saving}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg text-white disabled:opacity-50 transition-colors ${
                                saveStatus === "success"
                                    ? "bg-emerald-600"
                                    : saveStatus === "error"
                                    ? "bg-rose-600"
                                    : "bg-blue-600 hover:bg-blue-700"
                            }`}
                        >
                            <Save className="w-3.5 h-3.5" />
                            {saveStatus === "success"
                                ? "Saved"
                                : saveStatus === "error"
                                ? "Failed"
                                : saving
                                ? "Saving…"
                                : "Save"}
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-5 gap-0">
                    <div className="lg:col-span-3 p-4 lg:border-r border-slate-200 dark:border-slate-800">
                        <BridgeTable
                            lines={LINES}
                            bridge={bridge}
                            totals={totals}
                            onChange={update}
                        />
                    </div>

                    <div className="lg:col-span-2 p-4 bg-slate-50/60 dark:bg-slate-950/40 flex flex-col">
                        <ContributionViz
                            lines={LINES}
                            bridge={bridge}
                            totalIRR={totals.irr}
                        />
                        <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800 grid grid-cols-2 gap-3">
                            <Kpi
                                label={`Annual IRR`}
                                value={`${totals.irr >= 0 ? "+" : ""}${totals.irr.toFixed(1)}%`}
                                tone={
                                    totals.irr >= 12
                                        ? "good"
                                        : totals.irr >= 8
                                        ? "neutral"
                                        : "bad"
                                }
                            />
                            <Kpi
                                label={`Compounded (${years}y)`}
                                value={`${compoundedReturn >= 0 ? "+" : ""}${compoundedReturn.toFixed(0)}%`}
                                tone={
                                    compoundedReturn >= 60
                                        ? "good"
                                        : compoundedReturn >= 30
                                        ? "neutral"
                                        : "bad"
                                }
                            />
                            <Kpi
                                label={`Implied price (${targetYear})`}
                                value={`$${impliedPrice.toFixed(0)}`}
                            />
                            <Kpi
                                label={`Current price`}
                                value={`$${currentPrice.toFixed(0)}`}
                            />
                        </div>
                        <p className="mt-3 text-[10.5px] text-slate-500 leading-snug">
                            <Info className="w-3 h-3 inline align-[-2px] mr-1" />
                            {methodNote}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ── Bridge table ──────────────────────────────────────────────────────────

function BridgeTable({
    lines,
    bridge,
    totals,
    onChange,
}: {
    lines: BridgeLine[];
    bridge: BridgeState;
    totals: {
        vol: number;
        rev: number;
        earn: number;
        shareReturn: number;
        irr: number;
    };
    onChange: (key: keyof BridgeDefaults, value: number) => void;
}) {
    const grouped = useMemo(() => {
        const out: Record<BridgeLine["group"], BridgeLine[]> = {
            volume: [],
            revenue: [],
            earnings: [],
            shareholder: [],
            rerate: [],
        };
        for (const l of lines) out[l.group].push(l);
        return out;
    }, [lines]);

    const subtotalAt: Record<BridgeLine["group"], { label: string; value: number }> = {
        volume: { label: "Volume growth", value: totals.vol },
        revenue: { label: "Net revenue growth", value: totals.rev },
        earnings: { label: "Op income growth", value: totals.earn },
        shareholder: { label: "Per-share return", value: totals.shareReturn },
        rerate: { label: "Total IRR", value: totals.irr },
    };

    const groupOrder: BridgeLine["group"][] = [
        "volume",
        "revenue",
        "earnings",
        "shareholder",
        "rerate",
    ];

    return (
        <div className="space-y-4">
            {groupOrder.map((g) => (
                <div key={g}>
                    <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-1.5">
                        {GROUP_LABELS[g]}
                    </div>
                    <div className="space-y-1">
                        {grouped[g].map((l) => (
                            <BridgeRow
                                key={l.key}
                                line={l}
                                value={bridge[l.key]}
                                onChange={(v) => onChange(l.key, v)}
                            />
                        ))}
                        <Subtotal
                            label={subtotalAt[g].label}
                            value={subtotalAt[g].value}
                            highlight={g === "rerate"}
                        />
                    </div>
                </div>
            ))}
        </div>
    );
}

function BridgeRow({
    line,
    value,
    onChange,
}: {
    line: BridgeLine;
    value: number;
    onChange: (v: number) => void;
}) {
    const adjust = (delta: number) => onChange(Math.round((value + delta) * 10) / 10);

    return (
        <div className="flex items-center gap-2 py-1">
            <span
                className="inline-block w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: line.color }}
                aria-hidden="true"
            />
            <div className="flex-1 min-w-0">
                <div className="text-[12.5px] font-medium text-slate-700 dark:text-slate-200 truncate">
                    {line.label}
                </div>
                <div className="text-[10.5px] text-slate-400 dark:text-slate-500 truncate">
                    {line.desc}
                </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
                <button
                    onClick={() => adjust(-0.5)}
                    className="w-5 h-5 rounded text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center"
                    aria-label="decrease"
                >
                    <Minus className="w-3 h-3" />
                </button>
                <input
                    type="number"
                    step={0.1}
                    value={value}
                    onChange={(e) => onChange(Number(e.target.value))}
                    className="w-16 text-right text-[12.5px] tabular-nums font-semibold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <span className="text-[11px] text-slate-400">%</span>
                <button
                    onClick={() => adjust(0.5)}
                    className="w-5 h-5 rounded text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center"
                    aria-label="increase"
                >
                    <Plus className="w-3 h-3" />
                </button>
            </div>
        </div>
    );
}

function Subtotal({
    label,
    value,
    highlight,
}: {
    label: string;
    value: number;
    highlight?: boolean;
}) {
    return (
        <div
            className={`mt-1 flex items-center justify-between rounded px-2 py-1 ${
                highlight
                    ? "bg-blue-500/10 ring-1 ring-blue-500/30"
                    : "bg-slate-100 dark:bg-slate-800/60"
            }`}
        >
            <span
                className={`text-[11px] font-bold uppercase tracking-wider ${
                    highlight
                        ? "text-blue-700 dark:text-blue-300"
                        : "text-slate-600 dark:text-slate-300"
                }`}
            >
                = {label}
            </span>
            <span
                className={`text-[13px] font-bold tabular-nums ${
                    highlight
                        ? "text-blue-700 dark:text-blue-200"
                        : "text-slate-900 dark:text-white"
                }`}
            >
                {value >= 0 ? "+" : ""}
                {value.toFixed(1)}%
            </span>
        </div>
    );
}

// ── Contribution visualization (stacked horizontal bar) ───────────────────

function ContributionViz({
    lines,
    bridge,
    totalIRR,
}: {
    lines: BridgeLine[];
    bridge: BridgeState;
    totalIRR: number;
}) {
    const total = useMemo(
        () => lines.reduce((acc, l) => acc + Math.abs(bridge[l.key]), 0),
        [lines, bridge]
    );

    return (
        <div>
            <div className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-2">
                Contribution breakdown
            </div>
            <div className="flex h-7 rounded-md overflow-hidden ring-1 ring-slate-200 dark:ring-slate-800">
                {lines.map((l) => {
                    const v = bridge[l.key];
                    const w = total > 0 ? (Math.abs(v) / total) * 100 : 0;
                    if (w < 0.5) return null;
                    return (
                        <div
                            key={l.key}
                            className="relative flex items-center justify-center text-[10px] text-white font-semibold"
                            style={{
                                width: `${w}%`,
                                backgroundColor: l.color,
                                opacity: v < 0 ? 0.45 : 1,
                            }}
                            title={`${l.label}: ${v >= 0 ? "+" : ""}${v.toFixed(1)}%`}
                        >
                            {w > 8 && `${v >= 0 ? "+" : ""}${v.toFixed(1)}`}
                        </div>
                    );
                })}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1">
                {lines.map((l) => (
                    <div
                        key={l.key}
                        className="flex items-center gap-1.5 text-[10.5px] text-slate-600 dark:text-slate-400"
                    >
                        <span
                            className="inline-block w-2 h-2 rounded-sm shrink-0"
                            style={{ backgroundColor: l.color }}
                        />
                        <span className="truncate flex-1">{l.label}</span>
                        <span className="tabular-nums font-semibold text-slate-700 dark:text-slate-300">
                            {bridge[l.key] >= 0 ? "+" : ""}
                            {bridge[l.key].toFixed(1)}
                        </span>
                    </div>
                ))}
            </div>
            <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-[12px]">
                <span className="font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300">
                    Total IRR
                </span>
                <span className="font-bold tabular-nums text-blue-700 dark:text-blue-200">
                    {totalIRR >= 0 ? "+" : ""}
                    {totalIRR.toFixed(1)}%
                </span>
            </div>
        </div>
    );
}

// ── Small KPI tile ────────────────────────────────────────────────────────

function Kpi({
    label,
    value,
    tone = "neutral",
}: {
    label: string;
    value: string;
    tone?: "good" | "neutral" | "bad";
}) {
    const toneClass =
        tone === "good"
            ? "text-sky-700 dark:text-sky-300"
            : tone === "bad"
            ? "text-rose-700 dark:text-rose-300"
            : "text-slate-900 dark:text-white";
    return (
        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2.5 py-2">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">
                {label}
            </div>
            <div className={`text-base font-bold tabular-nums ${toneClass}`}>
                {value}
            </div>
        </div>
    );
}

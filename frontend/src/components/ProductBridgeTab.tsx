"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Save, RefreshCcw, Info, Plus, Minus } from "lucide-react";
import { authFetch } from "@/lib/authFetch";

export interface ProductDriver {
    id: string;
    label: string;
    desc: string;
    defaultValue: number;
    allowNegative?: boolean;
}

export interface ProductSegmentConfig {
    id: string;
    name: string;
    color: string;
    defaultWeight: number; // % of revenue
    drivers: ProductDriver[];
}

export interface ProductBridgeConfig {
    segments: ProductSegmentConfig[];
    marginExpansion: number;
    netBuyback: number;
    dividendYield: number;
    multipleRerate: number;
}

interface SegmentState {
    weight: number;
    drivers: Record<string, number>;
}

interface CompanyAdjustments {
    marginExpansion: number;
    netBuyback: number;
    dividendYield: number;
    multipleRerate: number;
}

interface ProductBridgeState {
    segments: Record<string, SegmentState>;
    company: CompanyAdjustments;
}

function initState(config: ProductBridgeConfig): ProductBridgeState {
    const segments: Record<string, SegmentState> = {};
    for (const seg of config.segments) {
        const drivers: Record<string, number> = {};
        for (const d of seg.drivers) drivers[d.id] = d.defaultValue;
        segments[seg.id] = { weight: seg.defaultWeight, drivers };
    }
    return {
        segments,
        company: {
            marginExpansion: config.marginExpansion,
            netBuyback: config.netBuyback,
            dividendYield: config.dividendYield,
            multipleRerate: config.multipleRerate,
        },
    };
}

interface Props {
    ticker: string;
    currentPrice: number;
    bridgeConfig: ProductBridgeConfig;
    methodNote: string;
    targetYear: number;
}

export default function ProductBridgeTab({
    ticker,
    currentPrice,
    bridgeConfig,
    methodNote,
    targetYear,
}: Props) {
    const [state, setState] = useState<ProductBridgeState>(() =>
        initState(bridgeConfig)
    );
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">(
        "idle"
    );

    // ── Load saved model ──────────────────────────────────────────────────
    useEffect(() => {
        const load = async () => {
            try {
                const res = await authFetch(
                    `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/stocks/${ticker}/get_model/`
                );
                if (res.ok) {
                    const data = await res.json();
                    const md = data.model_data;
                    if (md && md.productBridge) {
                        // Merge saved state over defaults to preserve any new drivers
                        const fresh = initState(bridgeConfig);
                        for (const segId of Object.keys(md.productBridge.segments ?? {})) {
                            if (fresh.segments[segId]) {
                                fresh.segments[segId] = {
                                    weight:
                                        md.productBridge.segments[segId].weight ??
                                        fresh.segments[segId].weight,
                                    drivers: {
                                        ...fresh.segments[segId].drivers,
                                        ...(md.productBridge.segments[segId].drivers ?? {}),
                                    },
                                };
                            }
                        }
                        if (md.productBridge.company) {
                            fresh.company = {
                                ...fresh.company,
                                ...md.productBridge.company,
                            };
                        }
                        setState(fresh);
                    }
                }
            } catch {
                /* keep defaults */
            } finally {
                setLoading(false);
            }
        };
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ticker]);

    useEffect(() => {
        setState(initState(bridgeConfig));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ticker]);

    // ── Math ──────────────────────────────────────────────────────────────
    const computed = useMemo(() => {
        const segments = bridgeConfig.segments.map((cfg) => {
            const s = state.segments[cfg.id];
            const segGrowth = cfg.drivers.reduce(
                (sum, d) => sum + (s.drivers[d.id] ?? 0),
                0
            );
            return {
                id: cfg.id,
                name: cfg.name,
                color: cfg.color,
                weight: s.weight,
                growth: segGrowth,
            };
        });

        const totalWeight = segments.reduce((a, b) => a + b.weight, 0);
        const normFactor = totalWeight > 0 ? 100 / totalWeight : 1;

        const withContrib = segments.map((seg) => ({
            ...seg,
            normalizedWeight: seg.weight * normFactor,
            contribution: (seg.weight * normFactor * seg.growth) / 100,
        }));

        const totalRevenueGrowth = withContrib.reduce(
            (sum, s) => sum + s.contribution,
            0
        );
        const opIncomeGrowth = totalRevenueGrowth + state.company.marginExpansion;
        const epsGrowth = opIncomeGrowth + state.company.netBuyback;
        const irr =
            epsGrowth + state.company.dividendYield + state.company.multipleRerate;

        return {
            segments: withContrib,
            totalWeight,
            totalRevenueGrowth,
            opIncomeGrowth,
            epsGrowth,
            irr,
        };
    }, [bridgeConfig.segments, state]);

    const years = targetYear - 2026;
    const compoundedReturn =
        years > 0
            ? (Math.pow(1 + computed.irr / 100, years) - 1) * 100
            : computed.irr;
    const impliedPrice =
        years > 0
            ? currentPrice * Math.pow(1 + computed.irr / 100, years)
            : currentPrice;

    // ── Mutators ──────────────────────────────────────────────────────────
    const setDriver = useCallback(
        (segId: string, driverId: string, value: number) => {
            setState((prev) => ({
                ...prev,
                segments: {
                    ...prev.segments,
                    [segId]: {
                        ...prev.segments[segId],
                        drivers: {
                            ...prev.segments[segId].drivers,
                            [driverId]: value,
                        },
                    },
                },
            }));
        },
        []
    );

    const setWeight = useCallback((segId: string, value: number) => {
        setState((prev) => ({
            ...prev,
            segments: {
                ...prev.segments,
                [segId]: { ...prev.segments[segId], weight: value },
            },
        }));
    }, []);

    const setCompany = useCallback(
        (key: keyof CompanyAdjustments, value: number) => {
            setState((prev) => ({
                ...prev,
                company: { ...prev.company, [key]: value },
            }));
        },
        []
    );

    const resetDefaults = useCallback(() => {
        setState(initState(bridgeConfig));
    }, [bridgeConfig]);

    const save = useCallback(async () => {
        setSaving(true);
        setSaveStatus("idle");
        try {
            const res = await authFetch(
                `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/stocks/${ticker}/save_model/`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ model_data: { productBridge: state } }),
                }
            );
            setSaveStatus(res.ok ? "success" : "error");
        } catch {
            setSaveStatus("error");
        } finally {
            setSaving(false);
            setTimeout(() => setSaveStatus("idle"), 2500);
        }
    }, [state, ticker]);

    if (loading) {
        return (
            <div className="text-sm text-slate-500 dark:text-slate-400 p-6">
                Loading saved model…
            </div>
        );
    }

    const weightsSumOk = Math.abs(computed.totalWeight - 100) < 0.5;

    return (
        <div className="space-y-5">
            {/* Revenue mix donut + summary */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
                <div className="flex items-center gap-4 flex-wrap">
                    <RevenueMixDonut segments={computed.segments} />
                    <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-1">
                            Revenue mix ({ticker})
                        </h3>
                        <div className="flex flex-wrap gap-x-4 gap-y-1">
                            {computed.segments.map((s) => (
                                <div
                                    key={s.id}
                                    className="flex items-center gap-1.5 text-[12px]"
                                >
                                    <span
                                        className="inline-block w-2 h-2 rounded-sm"
                                        style={{ backgroundColor: s.color }}
                                    />
                                    <span className="text-slate-700 dark:text-slate-300">
                                        {s.name}
                                    </span>
                                    <span className="font-semibold text-slate-900 dark:text-white tabular-nums">
                                        {s.normalizedWeight.toFixed(0)}%
                                    </span>
                                </div>
                            ))}
                        </div>
                        {!weightsSumOk && (
                            <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1">
                                Weights sum to {computed.totalWeight.toFixed(0)}%
                                — auto-normalized for math.
                            </p>
                        )}
                    </div>
                </div>
            </div>

            {/* Bridge body */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                            IRR Bridge ({ticker})
                        </h3>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                            Segment-weighted revenue growth + company-level
                            adjustments. Approximate addition.
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
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
                    {/* Segments + company section */}
                    <div className="lg:col-span-3 p-4 lg:border-r border-slate-200 dark:border-slate-800 space-y-4">
                        {bridgeConfig.segments.map((cfg) => {
                            const segState = state.segments[cfg.id];
                            const computedSeg = computed.segments.find(
                                (s) => s.id === cfg.id
                            )!;
                            return (
                                <SegmentBlock
                                    key={cfg.id}
                                    config={cfg}
                                    segState={segState}
                                    growth={computedSeg.growth}
                                    weight={computedSeg.weight}
                                    normalizedWeight={computedSeg.normalizedWeight}
                                    contribution={computedSeg.contribution}
                                    onDriverChange={(driverId, v) =>
                                        setDriver(cfg.id, driverId, v)
                                    }
                                    onWeightChange={(v) => setWeight(cfg.id, v)}
                                />
                            );
                        })}

                        {/* Company-level adjustments */}
                        <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3">
                            <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-2">
                                Company-level
                            </div>
                            <Subtotal
                                label="Total revenue growth"
                                value={computed.totalRevenueGrowth}
                            />
                            <NumericInputRow
                                label="Margin expansion"
                                desc="Operating leverage / services mix"
                                value={state.company.marginExpansion}
                                color="#22c55e"
                                allowNegative
                                onChange={(v) => setCompany("marginExpansion", v)}
                            />
                            <Subtotal
                                label="Op income growth"
                                value={computed.opIncomeGrowth}
                            />
                            <NumericInputRow
                                label="Net buyback yield"
                                desc="Buybacks net of SBC dilution"
                                value={state.company.netBuyback}
                                color="#a855f7"
                                onChange={(v) => setCompany("netBuyback", v)}
                            />
                            <NumericInputRow
                                label="Dividend yield"
                                desc="Cash returned to shareholders"
                                value={state.company.dividendYield}
                                color="#c084fc"
                                onChange={(v) => setCompany("dividendYield", v)}
                            />
                            <NumericInputRow
                                label="Multiple re-rate"
                                desc="Annual P/E change"
                                value={state.company.multipleRerate}
                                color="#f59e0b"
                                allowNegative
                                onChange={(v) => setCompany("multipleRerate", v)}
                            />
                            <Subtotal
                                label="Total IRR"
                                value={computed.irr}
                                highlight
                            />
                        </div>
                    </div>

                    {/* Right column: viz + KPIs */}
                    <div className="lg:col-span-2 p-4 bg-slate-50/60 dark:bg-slate-950/40 flex flex-col">
                        <ContributionViz computed={computed} state={state} />

                        <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800 grid grid-cols-2 gap-3">
                            <Kpi
                                label="Annual IRR"
                                value={`${computed.irr >= 0 ? "+" : ""}${computed.irr.toFixed(1)}%`}
                                tone={
                                    computed.irr >= 12
                                        ? "good"
                                        : computed.irr >= 8
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
                                label="Current price"
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

// ── Segment block ─────────────────────────────────────────────────────────

function SegmentBlock({
    config,
    segState,
    growth,
    weight,
    normalizedWeight,
    contribution,
    onDriverChange,
    onWeightChange,
}: {
    config: ProductSegmentConfig;
    segState: SegmentState;
    growth: number;
    weight: number;
    normalizedWeight: number;
    contribution: number;
    onDriverChange: (driverId: string, v: number) => void;
    onWeightChange: (v: number) => void;
}) {
    return (
        <div
            className="rounded-lg border p-3"
            style={{
                borderColor: `${config.color}33`,
                backgroundColor: `${config.color}08`,
            }}
        >
            <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                    <span
                        className="inline-block w-3 h-3 rounded-sm"
                        style={{ backgroundColor: config.color }}
                    />
                    <span className="text-sm font-bold text-slate-900 dark:text-white">
                        {config.name}
                    </span>
                </div>
                <div className="flex items-center gap-1 text-[11px]">
                    <span className="text-slate-500">weight</span>
                    <input
                        type="number"
                        step={1}
                        min={0}
                        max={100}
                        value={weight}
                        onChange={(e) => onWeightChange(Number(e.target.value))}
                        className="w-12 text-right tabular-nums font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <span className="text-slate-400">%</span>
                </div>
            </div>

            {config.drivers.map((d) => (
                <NumericInputRow
                    key={d.id}
                    label={d.label}
                    desc={d.desc}
                    value={segState.drivers[d.id]}
                    color={config.color}
                    allowNegative={d.allowNegative}
                    onChange={(v) => onDriverChange(d.id, v)}
                />
            ))}

            <div className="mt-2 pt-2 border-t border-slate-300/30 dark:border-slate-700 flex items-center justify-between text-[11px]">
                <span className="text-slate-600 dark:text-slate-300 font-semibold">
                    {config.name} growth
                </span>
                <span className="tabular-nums font-bold text-slate-900 dark:text-white">
                    {growth >= 0 ? "+" : ""}
                    {growth.toFixed(1)}%
                </span>
            </div>
            <div className="flex items-center justify-between text-[11px] mt-0.5">
                <span className="text-slate-500">
                    × {normalizedWeight.toFixed(0)}% mix
                </span>
                <span
                    className="tabular-nums font-semibold"
                    style={{ color: config.color }}
                >
                    → {contribution >= 0 ? "+" : ""}
                    {contribution.toFixed(2)}% to total
                </span>
            </div>
        </div>
    );
}

// ── Numeric row ───────────────────────────────────────────────────────────

function NumericInputRow({
    label,
    desc,
    value,
    color,
    allowNegative,
    onChange,
}: {
    label: string;
    desc: string;
    value: number;
    color: string;
    allowNegative?: boolean;
    onChange: (v: number) => void;
}) {
    const adjust = (delta: number) => {
        const next = Math.round((value + delta) * 10) / 10;
        onChange(allowNegative ? next : Math.max(0, next));
    };

    return (
        <div className="flex items-center gap-2 py-1">
            <span
                className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
                style={{ backgroundColor: color }}
                aria-hidden="true"
            />
            <div className="flex-1 min-w-0">
                <div className="text-[12px] font-medium text-slate-700 dark:text-slate-200 truncate">
                    {label}
                </div>
                <div className="text-[10px] text-slate-400 dark:text-slate-500 truncate">
                    {desc}
                </div>
            </div>
            <div className="flex items-center gap-0.5 shrink-0">
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
                    className="w-14 text-right text-[12px] tabular-nums font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
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
            className={`my-1 flex items-center justify-between rounded px-2 py-1 ${
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

// ── Revenue mix donut ─────────────────────────────────────────────────────

function RevenueMixDonut({
    segments,
}: {
    segments: Array<{
        id: string;
        color: string;
        normalizedWeight: number;
    }>;
}) {
    const size = 72;
    const r = size / 2 - 6;
    const cx = size / 2;
    const cy = size / 2;
    const circumference = 2 * Math.PI * r;

    const placed = segments.reduce<
        Array<{ id: string; color: string; portion: number; cumulative: number }>
    >((acc, s) => {
        const prev = acc.length > 0 ? acc[acc.length - 1] : null;
        const cumulative = prev ? prev.cumulative + prev.portion : 0;
        acc.push({
            id: s.id,
            color: s.color,
            portion: s.normalizedWeight / 100,
            cumulative,
        });
        return acc;
    }, []);

    return (
        <svg width={size} height={size} aria-hidden="true">
            {placed.map((s) => (
                <circle
                    key={s.id}
                    cx={cx}
                    cy={cy}
                    r={r}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={10}
                    strokeDasharray={`${circumference * s.portion} ${circumference}`}
                    strokeDashoffset={-circumference * s.cumulative}
                    transform={`rotate(-90 ${cx} ${cy})`}
                />
            ))}
        </svg>
    );
}

// ── Contribution viz ──────────────────────────────────────────────────────

function ContributionViz({
    computed,
    state,
}: {
    computed: {
        segments: Array<{
            id: string;
            name: string;
            color: string;
            contribution: number;
        }>;
        totalRevenueGrowth: number;
        opIncomeGrowth: number;
        irr: number;
    };
    state: ProductBridgeState;
}) {
    type Slice = { key: string; label: string; value: number; color: string };
    const slices: Slice[] = [
        ...computed.segments.map((s) => ({
            key: `seg-${s.id}`,
            label: s.name,
            value: s.contribution,
            color: s.color,
        })),
        {
            key: "margin",
            label: "Margin",
            value: state.company.marginExpansion,
            color: "#22c55e",
        },
        {
            key: "buyback",
            label: "Buyback",
            value: state.company.netBuyback,
            color: "#a855f7",
        },
        {
            key: "dividend",
            label: "Dividend",
            value: state.company.dividendYield,
            color: "#c084fc",
        },
        {
            key: "rerate",
            label: "Re-rate",
            value: state.company.multipleRerate,
            color: "#f59e0b",
        },
    ];

    const total = slices.reduce((a, b) => a + Math.abs(b.value), 0);

    return (
        <div>
            <div className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-2">
                Contribution breakdown
            </div>
            <div className="flex h-7 rounded-md overflow-hidden ring-1 ring-slate-200 dark:ring-slate-800">
                {slices.map((s) => {
                    const w = total > 0 ? (Math.abs(s.value) / total) * 100 : 0;
                    if (w < 0.5) return null;
                    return (
                        <div
                            key={s.key}
                            className="relative flex items-center justify-center text-[10px] text-white font-semibold"
                            style={{
                                width: `${w}%`,
                                backgroundColor: s.color,
                                opacity: s.value < 0 ? 0.45 : 1,
                            }}
                            title={`${s.label}: ${s.value >= 0 ? "+" : ""}${s.value.toFixed(2)}%`}
                        >
                            {w > 8 && `${s.value >= 0 ? "+" : ""}${s.value.toFixed(1)}`}
                        </div>
                    );
                })}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1">
                {slices.map((s) => (
                    <div
                        key={s.key}
                        className="flex items-center gap-1.5 text-[10.5px] text-slate-600 dark:text-slate-400"
                    >
                        <span
                            className="inline-block w-2 h-2 rounded-sm shrink-0"
                            style={{ backgroundColor: s.color }}
                        />
                        <span className="truncate flex-1">{s.label}</span>
                        <span className="tabular-nums font-semibold text-slate-700 dark:text-slate-300">
                            {s.value >= 0 ? "+" : ""}
                            {s.value.toFixed(2)}
                        </span>
                    </div>
                ))}
            </div>
            <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-[12px]">
                <span className="font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300">
                    Total IRR
                </span>
                <span className="font-bold tabular-nums text-blue-700 dark:text-blue-200">
                    {computed.irr >= 0 ? "+" : ""}
                    {computed.irr.toFixed(1)}%
                </span>
            </div>
        </div>
    );
}

// ── KPI tile ──────────────────────────────────────────────────────────────

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

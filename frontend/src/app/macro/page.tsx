"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCcw, Gauge, Info, AlertCircle } from "lucide-react";
import type { MacroPayload, MacroIndicator } from "@/lib/macroColors";
import { PALETTE_GRADIENT_CSS } from "@/lib/macroColors";
import { HeatmapSection } from "@/components/macro/HeatmapSection";
import { MacroHoverProvider } from "@/components/macro/MacroHoverContext";
import { IndicatorChart } from "@/components/macro/IndicatorChart";
import { classifyRegime, TONE_CLASSES } from "@/components/macro/regime";
import { AnomalyStrip } from "@/components/macro/AnomalyStrip";
import { BondCockpit } from "@/components/macro/BondCockpit";

type RangeKey = "1y" | "3y" | "5y" | "all";
const RANGE_OPTIONS: Array<{ key: RangeKey; label: string; months: number | null }> = [
  { key: "1y", label: "1Y", months: 12 },
  { key: "3y", label: "3Y", months: 36 },
  { key: "5y", label: "5Y", months: 60 },
  { key: "all", label: "All", months: null },
];

const GRID_COLS = "150px 80px 64px 1fr";

const formatRelative = (iso: string) => {
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr${hrs === 1 ? "" : "s"} ago`;
  const days = Math.round(hrs / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
};

function recessionRangesAsIndices(
  months: string[] | undefined,
  monthsWindow: string[]
): Array<{ startIdx: number; endIdx: number }> {
  if (!months || months.length === 0) return [];
  const indexOf = new Map(monthsWindow.map((m, i) => [m, i]));
  const indices = months
    .map((m) => indexOf.get(m))
    .filter((i): i is number => i !== undefined)
    .sort((a, b) => a - b);
  if (indices.length === 0) return [];
  const out: Array<{ startIdx: number; endIdx: number }> = [];
  let start = indices[0];
  let prev = indices[0];
  for (let i = 1; i < indices.length; i++) {
    if (indices[i] !== prev + 1) {
      out.push({ startIdx: start, endIdx: prev });
      start = indices[i];
    }
    prev = indices[i];
  }
  out.push({ startIdx: start, endIdx: prev });
  return out;
}

export default function MacroPage() {
  const [data, setData] = useState<MacroPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [range, setRange] = useState<RangeKey>("all");

  const load = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const r = await fetch(`/data/macro.json?ts=${Date.now()}`, {
        cache: "no-store",
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setData(await r.json());
    } catch (e) {
      setError(String(e));
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const visibleMonths = useMemo(() => {
    if (!data) return [];
    const opt = RANGE_OPTIONS.find((r) => r.key === range);
    if (!opt || opt.months === null) return data.months_window;
    return data.months_window.slice(-opt.months);
  }, [data, range]);

  const yearTicks = useMemo(() => {
    const seen = new Set<string>();
    const ticks: { year: string; index: number }[] = [];
    visibleMonths.forEach((m, i) => {
      const y = m.slice(0, 4);
      if (!seen.has(y)) {
        seen.add(y);
        ticks.push({ year: y, index: i });
      }
    });
    return ticks;
  }, [visibleMonths]);

  const recessionRanges = useMemo(
    () => recessionRangesAsIndices(data?.recession_months, visibleMonths),
    [data, visibleMonths]
  );

  const regime = useMemo(() => (data ? classifyRegime(data) : null), [data]);

  const allIndicators: MacroIndicator[] = useMemo(
    () => (data ? data.sections.flatMap((s) => s.indicators) : []),
    [data]
  );

  const selected = useMemo(
    () => allIndicators.find((i) => i.id === selectedId) ?? null,
    [allIndicators, selectedId]
  );

  const indicatorCount = allIndicators.length;

  const handleSelect = useCallback(
    (id: string) => setSelectedId((prev) => (prev === id ? null : id)),
    []
  );

  if (error) {
    return (
      <div className="max-w-7xl mx-auto pb-12">
        <div className="p-4 rounded-lg border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-900/20 text-sm text-rose-700 dark:text-rose-300">
          Failed to load macro data: {error}
        </div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="max-w-7xl mx-auto pb-12">
        <div className="animate-pulse">
          <div className="h-7 w-32 bg-slate-200 dark:bg-slate-800 rounded mb-2" />
          <div className="h-4 w-80 bg-slate-200 dark:bg-slate-800 rounded mb-6" />
          <div className="h-[420px] bg-slate-200 dark:bg-slate-800 rounded-xl" />
        </div>
      </div>
    );
  }

  const total = visibleMonths.length;

  return (
    <MacroHoverProvider>
      <div className="max-w-7xl mx-auto pb-12">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-blue-500/10 text-blue-500">
                <Gauge className="w-4 h-4" />
              </span>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                Macro
              </h1>
              {regime && (
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-semibold ring-1 ${TONE_CLASSES[regime.tone]}`}
                  title={regime.reasons.join("\n")}
                >
                  {regime.tone === "bad" && <AlertCircle className="w-3.5 h-3.5" />}
                  {regime.label}
                </span>
              )}
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              US macroeconomic indicators colored by z-score vs a trailing{" "}
              {data.rolling_window_years}-year window. Sign-adjusted per series
              so blue is always &ldquo;better than normal&rdquo;.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden sm:flex flex-col items-end text-[11px] leading-tight">
              <span className="text-slate-400 dark:text-slate-500">
                Last refreshed
              </span>
              <span
                className="text-slate-700 dark:text-slate-300 font-medium tabular-nums"
                title={new Date(data.generated_at).toLocaleString()}
              >
                {formatRelative(data.generated_at)}
              </span>
            </div>
            <button
              onClick={load}
              disabled={refreshing}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"
            >
              <RefreshCcw
                className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`}
              />
              Refresh
            </button>
          </div>
        </div>

        <AnomalyStrip data={data} onSelect={handleSelect} />

        <BondCockpit data={data} />

        {selected && (
          <div className="mb-4">
            <IndicatorChart
              indicator={selected}
              recessionMonths={data.recession_months}
              onClose={() => setSelectedId(null)}
            />
          </div>
        )}

        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40">
            <div className="flex items-center gap-2 text-[11.5px] text-slate-500 dark:text-slate-400">
              <Info className="w-3.5 h-3.5" />
              <span className="font-medium text-slate-700 dark:text-slate-300">
                {indicatorCount} indicators
              </span>
              <span className="text-slate-300 dark:text-slate-700">·</span>
              <span>{data.rolling_window_years}y rolling z-score window</span>
              <span className="text-slate-300 dark:text-slate-700">·</span>
              <span>{total} months</span>
              <span className="text-slate-300 dark:text-slate-700">·</span>
              <span className="text-slate-600 dark:text-slate-400">
                click any row to chart
              </span>
            </div>
            <div className="flex items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400">
              <div className="inline-flex items-center gap-px rounded-md bg-slate-100 dark:bg-slate-800 p-0.5">
                {RANGE_OPTIONS.map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setRange(opt.key)}
                    className={`px-2 py-0.5 rounded text-[10.5px] font-semibold transition-colors ${
                      range === opt.key
                        ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm"
                        : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <span>worse</span>
              <span
                className="inline-block w-44 h-2.5 rounded-full ring-1 ring-black/5 dark:ring-white/10"
                style={{ background: PALETTE_GRADIENT_CSS }}
              />
              <span>better</span>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-950 px-4 py-4">
            <div
              className="grid items-end gap-3 mb-2 relative"
              style={{ gridTemplateColumns: GRID_COLS }}
            >
              <div />
              <div className="text-[10px] uppercase tracking-wider text-slate-500 text-right pr-1">
                Latest
              </div>
              <div className="text-[10px] uppercase tracking-wider text-slate-500 text-center">
                Trend
              </div>
              <div className="relative h-[14px]">
                {yearTicks.map((t) => (
                  <span
                    key={t.year}
                    className="absolute text-[10.5px] text-slate-500 tabular-nums"
                    style={{ left: `${(t.index / total) * 100}%` }}
                  >
                    {t.year}
                  </span>
                ))}
              </div>
            </div>

            <div className="relative">
              <div
                className="absolute inset-0 grid gap-3 pointer-events-none"
                style={{ gridTemplateColumns: GRID_COLS }}
                aria-hidden="true"
              >
                <div />
                <div />
                <div />
                <div className="relative">
                  {recessionRanges.map((r) => (
                    <span
                      key={`rec-${r.startIdx}`}
                      className="absolute top-0 bottom-0 bg-slate-900/[0.06] dark:bg-white/[0.05]"
                      style={{
                        left: `${(r.startIdx / total) * 100}%`,
                        width: `${((r.endIdx - r.startIdx + 1) / total) * 100}%`,
                      }}
                      title="NBER recession"
                    />
                  ))}
                  {yearTicks.slice(1).map((t) => (
                    <span
                      key={t.year}
                      className="absolute top-0 bottom-0 w-px bg-slate-900/[0.06] dark:bg-white/[0.04]"
                      style={{ left: `${(t.index / total) * 100}%` }}
                    />
                  ))}
                </div>
              </div>

              <div className="relative">
                {data.sections.map((s) => (
                  <HeatmapSection
                    key={s.title}
                    section={s}
                    monthsWindow={visibleMonths}
                    selectedId={selectedId}
                    onSelect={handleSelect}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        <footer className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
          <span>
            Source:{" "}
            <a
              href="https://fred.stlouisfed.org/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline decoration-dotted hover:text-slate-700 dark:hover:text-slate-300"
            >
              FRED — St. Louis Fed
            </a>
          </span>
          <span className="text-slate-300 dark:text-slate-700">·</span>
          <span>
            Cell color reflects z-score vs trailing {data.rolling_window_years}y
            window
          </span>
          {recessionRanges.length > 0 && (
            <>
              <span className="text-slate-300 dark:text-slate-700">·</span>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block w-3 h-3 bg-slate-400/30 dark:bg-white/10 rounded-sm" />
                NBER recession
              </span>
            </>
          )}
          <span className="text-slate-300 dark:text-slate-700">·</span>
          <span>Regime label is a rule-based heuristic, not a forecast</span>
        </footer>
      </div>
    </MacroHoverProvider>
  );
}

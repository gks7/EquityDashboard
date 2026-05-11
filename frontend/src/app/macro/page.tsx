"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCcw, Gauge, Info } from "lucide-react";
import type { MacroPayload } from "@/lib/macroColors";
import { HeatmapSection } from "@/components/macro/HeatmapSection";

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

export default function MacroPage() {
  const [data, setData] = useState<MacroPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

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

  const yearTicks = useMemo(() => {
    if (!data) return [];
    const seen = new Set<string>();
    const ticks: { year: string; index: number }[] = [];
    data.months_window.forEach((m, i) => {
      const y = m.slice(0, 4);
      if (!seen.has(y)) {
        seen.add(y);
        ticks.push({ year: y, index: i });
      }
    });
    return ticks;
  }, [data]);

  const indicatorCount = useMemo(
    () =>
      data?.sections.reduce((acc, s) => acc + s.indicators.length, 0) ?? 0,
    [data]
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

  const total = data.months_window.length;

  return (
    <div className="max-w-7xl mx-auto pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-blue-500/10 text-blue-500">
              <Gauge className="w-4 h-4" />
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Macro
            </h1>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            US macroeconomic indicators colored by z-score vs a trailing{" "}
            {data.rolling_window_years}-year window. Sign-adjusted per series so
            green is always &ldquo;better than normal&rdquo;.
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

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40">
          <div className="flex items-center gap-2 text-[11.5px] text-slate-500 dark:text-slate-400">
            <Info className="w-3.5 h-3.5" />
            <span className="font-medium text-slate-700 dark:text-slate-300">
              {indicatorCount} indicators
            </span>
            <span className="text-slate-300 dark:text-slate-700">·</span>
            <span>
              {data.rolling_window_years}y rolling z-score window
            </span>
            <span className="text-slate-300 dark:text-slate-700">·</span>
            <span>{total} months</span>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
            <span>worse</span>
            <span
              className="inline-block w-44 h-2.5 rounded-full ring-1 ring-black/5 dark:ring-white/10"
              style={{
                background:
                  "linear-gradient(to right, #d24545, #e6c34a, #3fa863)",
              }}
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
              className="absolute inset-0 grid pointer-events-none"
              style={{ gridTemplateColumns: GRID_COLS }}
              aria-hidden="true"
            >
              <div />
              <div />
              <div />
              <div className="relative">
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
                  monthsWindow={data.months_window}
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
        <span className="text-slate-300 dark:text-slate-700">·</span>
        <span>Hover any cell for monthly detail</span>
      </footer>
    </div>
  );
}

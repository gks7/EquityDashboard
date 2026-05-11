"use client";

import { useEffect, useMemo, useState } from "react";
import type { MacroPayload } from "@/lib/macroColors";
import { HeatmapSection } from "@/components/macro/HeatmapSection";

export default function MacroPage() {
  const [data, setData] = useState<MacroPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/data/macro.json", { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(String(e)));
  }, []);

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

  if (error) {
    return (
      <div className="text-rose-400 p-6 text-sm">
        Failed to load macro data: {error}
      </div>
    );
  }
  if (!data) {
    return (
      <div className="text-slate-500 p-6 text-sm">Loading macro data…</div>
    );
  }

  const total = data.months_window.length;

  return (
    <div className="bg-slate-50 dark:bg-[#0a0e1a] text-slate-900 dark:text-slate-100 min-h-full -mx-4 -my-6 sm:-mx-6 md:-mx-8 px-4 py-6 sm:px-6 md:px-8">
      <header className="mb-3 flex items-baseline gap-3 flex-wrap">
        <h1 className="text-xl font-bold tracking-tight">Macro</h1>
        <span className="text-xs text-slate-500">
          Last refreshed {new Date(data.generated_at).toLocaleString()} ·{" "}
          {data.rolling_window_years}y rolling z-score window
        </span>
        <span className="inline-flex items-center gap-1.5 ml-2 text-[11px] text-slate-500">
          worse
          <span
            className="inline-block w-40 h-2.5 rounded-sm"
            style={{
              background:
                "linear-gradient(to right, #d24545, #e6c34a, #3fa863)",
            }}
          />
          better
        </span>
      </header>

      <div
        className="grid items-center gap-3 mb-1"
        style={{ gridTemplateColumns: "180px 70px 1fr" }}
      >
        <div />
        <div />
        <div className="relative h-[18px]">
          {yearTicks.map((t) => (
            <span
              key={t.year}
              className="absolute text-[11px] text-slate-500"
              style={{ left: `${(t.index / total) * 100}%` }}
            >
              {t.year}
            </span>
          ))}
        </div>
      </div>

      <div className="rounded-lg bg-black p-4">
        {data.sections.map((s) => (
          <HeatmapSection
            key={s.title}
            section={s}
            monthsWindow={data.months_window}
          />
        ))}
      </div>

      <footer className="mt-6 text-[11px] text-slate-500">
        Source: FRED (St. Louis Fed). Colors reflect z-score vs trailing 10y
        window; green = better-than-normal, red = worse-than-normal
        (sign-adjusted per series).
      </footer>
    </div>
  );
}

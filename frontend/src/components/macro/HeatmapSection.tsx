"use client";

import React from "react";
import type { MacroSection } from "@/lib/macroColors";
import { HeatmapRow } from "./HeatmapRow";

interface Props {
  section: MacroSection;
  monthsWindow: string[];
}

export const HeatmapSection: React.FC<Props> = ({ section, monthsWindow }) => {
  return (
    <section className="mb-5 last:mb-0">
      <div className="flex items-center gap-2 mb-2 pl-1">
        <span
          aria-hidden="true"
          className="inline-block w-[3px] h-3.5 rounded-sm bg-blue-500/80"
        />
        <h3 className="text-slate-900 dark:text-slate-100 text-[12px] font-semibold uppercase tracking-[0.08em]">
          {section.title}
        </h3>
        <span className="text-[11px] text-slate-500 dark:text-slate-500 font-normal normal-case tracking-normal">
          {section.indicators.length}{" "}
          {section.indicators.length === 1 ? "series" : "series"}
        </span>
      </div>
      <div className="rounded-md bg-slate-50/70 dark:bg-slate-950/40 ring-1 ring-slate-200 dark:ring-white/5 px-2 py-1.5">
        {section.indicators.map((ind) => (
          <HeatmapRow
            key={ind.id}
            indicator={ind}
            monthsWindow={monthsWindow}
          />
        ))}
      </div>
    </section>
  );
};

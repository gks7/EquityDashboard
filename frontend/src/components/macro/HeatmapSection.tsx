"use client";

import React, { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { MacroSection } from "@/lib/macroColors";
import { HeatmapRow } from "./HeatmapRow";

interface Props {
  section: MacroSection;
  monthsWindow: string[];
  selectedId?: string | null;
  onSelect?: (indicatorId: string) => void;
}

function sectionAvgLatestZ(section: MacroSection): number | null {
  const zs: number[] = [];
  for (const ind of section.indicators) {
    const latest = ind.cells[ind.cells.length - 1];
    if (latest && latest.z !== null && latest.z !== undefined) {
      zs.push(latest.z);
    }
  }
  if (zs.length === 0) return null;
  return zs.reduce((a, b) => a + b, 0) / zs.length;
}

export const HeatmapSection: React.FC<Props> = ({
  section,
  monthsWindow,
  selectedId,
  onSelect,
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const avgZ = useMemo(() => sectionAvgLatestZ(section), [section]);

  const tone =
    avgZ === null
      ? "neutral"
      : avgZ > 0.4
      ? "good"
      : avgZ < -0.4
      ? "bad"
      : "neutral";

  const toneClass =
    tone === "good"
      ? "text-sky-700 dark:text-sky-400 bg-sky-500/10"
      : tone === "bad"
      ? "text-rose-700 dark:text-rose-400 bg-rose-500/10"
      : "text-slate-600 dark:text-slate-400 bg-slate-500/10";

  return (
    <section className="mb-5 last:mb-0">
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        aria-expanded={!collapsed}
        className="flex items-center gap-2 mb-2 pl-1 group w-full text-left"
      >
        <ChevronDown
          className={`w-3 h-3 text-slate-400 transition-transform ${
            collapsed ? "-rotate-90" : ""
          }`}
        />
        <span
          aria-hidden="true"
          className="inline-block w-[3px] h-3.5 rounded-sm bg-blue-500/80"
        />
        <h3 className="text-slate-900 dark:text-slate-100 text-[12px] font-semibold uppercase tracking-[0.08em]">
          {section.title}
        </h3>
        <span className="text-[11px] text-slate-500 font-normal normal-case tracking-normal">
          {section.indicators.length} series
        </span>
        {avgZ !== null && (
          <span
            className={`inline-flex items-center gap-1 text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded-full normal-case tracking-normal ${toneClass}`}
            title={`Average latest z-score across ${section.indicators.length} indicators`}
          >
            {avgZ >= 0 ? "▲" : "▼"} z {avgZ >= 0 ? "+" : ""}
            {avgZ.toFixed(2)}
          </span>
        )}
      </button>
      {!collapsed && (
        <div>
          {section.indicators.map((ind) => (
            <HeatmapRow
              key={ind.id}
              indicator={ind}
              monthsWindow={monthsWindow}
              onSelect={onSelect}
              isSelected={selectedId === ind.id}
            />
          ))}
        </div>
      )}
    </section>
  );
};

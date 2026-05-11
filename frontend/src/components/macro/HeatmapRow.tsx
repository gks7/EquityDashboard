"use client";

import React, { useState } from "react";
import type { MacroIndicator } from "@/lib/macroColors";
import { Sparkline } from "./Sparkline";

interface Props {
  indicator: MacroIndicator;
  monthsWindow: string[];
}

export const HeatmapRow: React.FC<Props> = ({ indicator, monthsWindow }) => {
  const [hover, setHover] = useState<
    | { x: number; y: number; cell: (typeof indicator.cells)[number] }
    | null
  >(null);

  const cellByMonth = new Map(indicator.cells.map((c) => [c.month, c]));

  return (
    <div
      className="grid items-center gap-3 py-[2px]"
      style={{ gridTemplateColumns: "180px 70px 1fr" }}
    >
      <div className="text-[12px] text-right font-semibold text-slate-200 pr-1">
        {indicator.name}
      </div>
      <Sparkline points={indicator.sparkline} />
      <div className="flex h-[22px] gap-[1px]">
        {monthsWindow.map((m) => {
          const c = cellByMonth.get(m);
          const color = c?.color ?? "#2a2a2a";
          return (
            <div
              key={m}
              onMouseEnter={(e) =>
                c &&
                setHover({ x: e.clientX, y: e.clientY, cell: c })
              }
              onMouseMove={(e) =>
                c &&
                setHover({ x: e.clientX, y: e.clientY, cell: c })
              }
              onMouseLeave={() => setHover(null)}
              className="flex-1"
              style={{
                backgroundColor: color,
                cursor: c ? "crosshair" : "default",
              }}
              aria-label={
                c
                  ? `${indicator.name} ${m}: ${c.value} (z=${c.z})`
                  : undefined
              }
            />
          );
        })}
      </div>
      {hover && (
        <div
          className="fixed z-50 pointer-events-none whitespace-nowrap rounded border border-slate-700 bg-slate-900 text-white text-[11px] px-2.5 py-1.5"
          style={{ left: hover.x + 12, top: hover.y + 12 }}
        >
          <div className="font-semibold">
            {indicator.name} · {hover.cell.month}
          </div>
          <div>
            Value: {hover.cell.value} {indicator.transform_label}
          </div>
          <div>Z-score: {hover.cell.z}</div>
        </div>
      )}
    </div>
  );
};

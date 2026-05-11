"use client";

import React, { useState } from "react";
import type { MacroIndicator } from "@/lib/macroColors";
import { zToColor } from "@/lib/macroColors";
import { Sparkline } from "./Sparkline";
import { useMacroHover } from "./MacroHoverContext";

interface Props {
  indicator: MacroIndicator;
  monthsWindow: string[];
  onSelect?: (indicatorId: string) => void;
  isSelected?: boolean;
}

const formatMonth = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m) return ym;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
};

const formatValue = (v: number | null, label: string) => {
  if (v === null || v === undefined) return "—";
  const isPct = /%/.test(label);
  const digits = Math.abs(v) >= 100 ? 0 : isPct ? 2 : 2;
  return isPct ? `${v.toFixed(digits)}%` : v.toFixed(digits);
};

export const HeatmapRow: React.FC<Props> = ({
  indicator,
  monthsWindow,
  onSelect,
  isSelected = false,
}) => {
  const [hover, setHover] = useState<
    | { x: number; y: number; cell: (typeof indicator.cells)[number]; prev: number | null }
    | null
  >(null);
  const { hoveredIndex, setHovered } = useMacroHover();

  const cellByMonth = new Map(indicator.cells.map((c) => [c.month, c]));
  const orderedCells = monthsWindow
    .map((m) => cellByMonth.get(m))
    .filter((c): c is (typeof indicator.cells)[number] => !!c);
  const latestCell = orderedCells[orderedCells.length - 1];

  const total = monthsWindow.length;

  return (
    <div
      className={`grid items-center gap-3 py-[3px] rounded-md transition-colors ${
        isSelected
          ? "bg-blue-500/10 ring-1 ring-blue-500/30"
          : onSelect
          ? "hover:bg-slate-100/60 dark:hover:bg-slate-800/30 cursor-pointer"
          : ""
      }`}
      style={{ gridTemplateColumns: "150px 80px 64px 1fr" }}
      onClick={onSelect ? () => onSelect(indicator.id) : undefined}
    >
      <div className="text-[12.5px] text-right font-medium text-slate-700 dark:text-slate-300 pr-1 truncate">
        {indicator.name}
      </div>

      <div className="flex items-center justify-end gap-2 pr-1">
        <span
          className="inline-block w-2 h-2 rounded-full ring-1 ring-black/20 dark:ring-black/40"
          style={{
            backgroundColor: latestCell
              ? zToColor(latestCell.z, indicator.bad_when_high)
              : "#cbd5e1",
          }}
          aria-hidden="true"
        />
        <span className="text-[12.5px] tabular-nums font-semibold text-slate-900 dark:text-slate-100">
          {formatValue(indicator.latest_value, indicator.transform_label)}
        </span>
      </div>

      <Sparkline
        points={indicator.sparkline}
        className="text-slate-500 dark:text-slate-400"
      />

      <div className="relative flex h-[22px] gap-[1px]">
        {monthsWindow.map((m, idx) => {
          const c = cellByMonth.get(m);
          const prev =
            idx > 0
              ? cellByMonth.get(monthsWindow[idx - 1])?.value ?? null
              : null;
          return (
            <div
              key={m}
              onMouseEnter={(e) => {
                if (c) {
                  setHover({ x: e.clientX, y: e.clientY, cell: c, prev });
                  setHovered(m, idx);
                }
              }}
              onMouseMove={(e) =>
                c && setHover({ x: e.clientX, y: e.clientY, cell: c, prev })
              }
              onMouseLeave={() => {
                setHover(null);
                setHovered(null, null);
              }}
              className={`flex-1 rounded-[1px] transition-transform hover:scale-y-110 hover:z-10 ${
                c ? "" : "bg-slate-200 dark:bg-slate-800"
              }`}
              style={{
                backgroundColor: c
                  ? zToColor(c.z, indicator.bad_when_high)
                  : undefined,
                cursor: c ? "crosshair" : onSelect ? "pointer" : "default",
              }}
              aria-label={
                c ? `${indicator.name} ${m}: ${c.value} (z=${c.z})` : undefined
              }
            />
          );
        })}
        {hoveredIndex !== null && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-[-2px] bottom-[-2px] w-px bg-slate-900/70 dark:bg-white/70 z-20"
            style={{ left: `${((hoveredIndex + 0.5) / total) * 100}%` }}
          />
        )}
      </div>

      {hover && (
        <div
          className="fixed z-50 pointer-events-none whitespace-nowrap rounded-lg border border-slate-700 bg-slate-900/95 backdrop-blur text-white text-[11.5px] px-3 py-2 shadow-xl"
          style={{ left: hover.x + 14, top: hover.y + 14 }}
        >
          <div className="flex items-center gap-2 font-semibold mb-1">
            <span
              className="inline-block w-2 h-2 rounded-full"
              style={{
                backgroundColor: zToColor(
                  hover.cell.z,
                  indicator.bad_when_high
                ),
              }}
            />
            {indicator.name}
            <span className="text-slate-400 font-normal">
              · {formatMonth(hover.cell.month)}
            </span>
          </div>
          <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
            <span className="text-slate-400">Value</span>
            <span className="tabular-nums text-right">
              {formatValue(hover.cell.value, indicator.transform_label)}
              {hover.prev !== null && hover.cell.value !== null && (
                <span
                  className={`ml-2 text-[10.5px] ${
                    hover.cell.value - hover.prev >= 0
                      ? "text-sky-400"
                      : "text-orange-400"
                  }`}
                >
                  {hover.cell.value - hover.prev >= 0 ? "▲" : "▼"}{" "}
                  {Math.abs(hover.cell.value - hover.prev).toFixed(2)}
                </span>
              )}
            </span>
            <span className="text-slate-400">Z-score</span>
            <span className="tabular-nums text-right">
              {hover.cell.z?.toFixed(2) ?? "—"}
            </span>
            <span className="text-slate-400">Series</span>
            <span className="text-right">{indicator.transform_label}</span>
          </div>
          {onSelect && (
            <div className="mt-1.5 pt-1.5 border-t border-slate-700 text-[10px] text-slate-400">
              click row to expand chart
            </div>
          )}
        </div>
      )}
    </div>
  );
};

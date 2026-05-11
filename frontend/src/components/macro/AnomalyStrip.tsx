"use client";

import React, { useMemo } from "react";
import { AlertTriangle } from "lucide-react";
import type { MacroPayload } from "@/lib/macroColors";
import { zToColor } from "@/lib/macroColors";

interface Anomaly {
  id: string;
  name: string;
  z: number;
  signedZ: number;
  color: string;
  value: number | null;
  transform_label: string;
  bad_when_high: boolean;
}

const Z_THRESHOLD = 1.5;
const MAX_ITEMS = 8;

interface Props {
  data: MacroPayload;
  onSelect?: (indicatorId: string) => void;
}

export const AnomalyStrip: React.FC<Props> = ({ data, onSelect }) => {
  const anomalies = useMemo<Anomaly[]>(() => {
    const out: Anomaly[] = [];
    for (const section of data.sections) {
      for (const ind of section.indicators) {
        const latest = ind.cells[ind.cells.length - 1];
        if (!latest || latest.z === null || latest.z === undefined) continue;
        // signedZ: positive => "better than normal", negative => "worse than normal"
        const signed = ind.bad_when_high ? -latest.z : latest.z;
        if (Math.abs(latest.z) >= Z_THRESHOLD) {
          out.push({
            id: ind.id,
            name: ind.name,
            z: latest.z,
            signedZ: signed,
            color: zToColor(latest.z, ind.bad_when_high),
            value: latest.value,
            transform_label: ind.transform_label,
            bad_when_high: ind.bad_when_high,
          });
        }
      }
    }
    out.sort((a, b) => Math.abs(b.z) - Math.abs(a.z));
    return out.slice(0, MAX_ITEMS);
  }, [data]);

  if (anomalies.length === 0) return null;

  return (
    <div className="mb-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 shrink-0">
          <AlertTriangle className="w-3.5 h-3.5" />
          Anomalies
          <span className="text-[10px] font-normal normal-case tracking-normal text-slate-400">
            |z| ≥ {Z_THRESHOLD}
          </span>
        </span>
        <div className="flex items-center gap-1.5 flex-wrap">
          {anomalies.map((a) => {
            const arrow = a.signedZ >= 0 ? "▲" : "▼";
            const isPct = /%/.test(a.transform_label);
            const valStr =
              a.value === null
                ? ""
                : isPct
                ? `${a.value.toFixed(2)}%`
                : a.value.toFixed(2);
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => onSelect?.(a.id)}
                className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                title={`${a.name}: ${valStr} (z=${a.z.toFixed(2)})`}
              >
                <span
                  className="inline-block w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: a.color }}
                  aria-hidden="true"
                />
                <span className="font-medium text-slate-700 dark:text-slate-200">
                  {a.name}
                </span>
                <span className="font-mono text-[10px] text-slate-500 dark:text-slate-400">
                  {arrow} z{a.z >= 0 ? "+" : ""}
                  {a.z.toFixed(1)}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

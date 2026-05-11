"use client";

import React from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import type { MacroPayload } from "@/lib/macroColors";
import {
  classifyRegime,
  TONE_CLASSES,
  QUADRANTS,
  type Quadrant,
} from "./regime";
import { RegimeMatrix } from "./RegimeMatrix";

interface Props {
  data: MacroPayload;
}

const fmtZ = (v: number | null) =>
  v === null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(2)}`;

export const RegimePanel: React.FC<Props> = ({ data }) => {
  const r = classifyRegime(data);

  return (
    <div className="mb-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
      <div className="flex flex-col md:flex-row">
        {/* Left side: classification + alerts + reasoning */}
        <div className="flex-1 p-4 md:p-5 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap mb-1">
            <span className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Current regime
            </span>
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[12px] font-semibold ring-1 ${TONE_CLASSES[r.tone]}`}
            >
              {r.tone === "bad" && <AlertCircle className="w-3.5 h-3.5" />}
              {r.label}
            </span>
          </div>

          <p className="text-[12.5px] text-slate-600 dark:text-slate-400 leading-snug">
            {r.quadrant.blurb}
          </p>

          {/* Axes summary */}
          <div className="mt-3 grid grid-cols-2 gap-2 max-w-md">
            <AxisStat
              label="Growth z"
              value={fmtZ(r.growthZ)}
              sign={r.growthZ === null ? 0 : Math.sign(r.growthZ)}
              hint="signed avg of Activity + Employment"
            />
            <AxisStat
              label="Inflation z"
              value={fmtZ(r.inflationZ)}
              sign={r.inflationZ === null ? 0 : Math.sign(r.inflationZ)}
              hint="raw avg of Headline + Persistence"
              inflationSemantics
            />
          </div>

          {/* Risk alerts */}
          <div className="mt-3 flex flex-wrap gap-1.5">
            {r.alerts.map((a) => (
              <span
                key={a.key}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] ${
                  a.triggered
                    ? "bg-rose-500/10 text-rose-700 dark:text-rose-300 ring-1 ring-rose-500/30"
                    : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                }`}
                title={
                  a.triggered
                    ? `${a.label} threshold tripped`
                    : `${a.label}: within normal range`
                }
              >
                {a.triggered ? (
                  <AlertCircle className="w-3 h-3" />
                ) : (
                  <CheckCircle2 className="w-3 h-3 opacity-60" />
                )}
                <span className="font-medium">{a.label}</span>
                <span className="font-mono tabular-nums opacity-80">
                  {a.value}
                </span>
              </span>
            ))}
          </div>

          <p className="mt-3 text-[10.5px] text-slate-400 leading-snug">
            Quadrant chosen by sign of growth-z (avg of Activity + Employment,
            sign-adjusted per series) and inflation-z (avg of Headline +
            Inflation Persistence, raw). Heuristic, not a forecast.
          </p>
        </div>

        {/* Right side: matrix */}
        <div className="border-t md:border-t-0 md:border-l border-slate-200 dark:border-slate-800 p-3 md:p-4 flex flex-col items-center justify-center bg-slate-50/50 dark:bg-slate-950/40">
          <RegimeMatrix
            growthZ={r.growthZ}
            inflationZ={r.inflationZ}
            activeQuadrant={r.quadrant.key}
            size={220}
          />
          <div className="mt-2 grid grid-cols-2 gap-1 max-w-[220px]">
            {(Object.keys(QUADRANTS) as Quadrant[]).map((q) => {
              const isActive = q === r.quadrant.key;
              return (
                <span
                  key={q}
                  className={`text-[10px] px-1.5 py-0.5 rounded text-center transition-colors ${
                    isActive
                      ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900 font-semibold"
                      : "text-slate-500 dark:text-slate-500"
                  }`}
                >
                  {QUADRANTS[q].label}
                </span>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

interface AxisStatProps {
  label: string;
  value: string;
  sign: number;
  hint: string;
  inflationSemantics?: boolean;
}

const AxisStat: React.FC<AxisStatProps> = ({
  label,
  value,
  sign,
  hint,
  inflationSemantics,
}) => {
  // For growth: positive = good (sky). For inflation: positive = hot/bad (amber/rose).
  const goodSign = inflationSemantics ? -sign : sign;
  const tone =
    goodSign > 0
      ? "text-sky-600 dark:text-sky-400"
      : goodSign < 0
      ? "text-rose-600 dark:text-rose-400"
      : "text-slate-500";
  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">
        {label}
      </div>
      <div className={`text-sm font-bold tabular-nums ${tone}`}>
        {sign > 0 ? "▲" : sign < 0 ? "▼" : "▪"} {value}
      </div>
      <div className="text-[10px] text-slate-400 mt-0.5">{hint}</div>
    </div>
  );
};

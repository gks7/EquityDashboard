"use client";

import React, { useMemo } from "react";
import { useTheme } from "next-themes";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PALETTE, type Num, type Palette, pct, mult, bn, qLong } from "@/lib/sp500";

export function usePalette(): Palette {
  const { resolvedTheme } = useTheme();
  return resolvedTheme === "dark" ? PALETTE.dark : PALETTE.light;
}

export type Fmt = "pct" | "x" | "bn";
const fmtVal = (f: Fmt, v: Num | undefined) => (f === "pct" ? pct(v) : f === "x" ? mult(v) : bn(v, 1));
const fmtTick = (f: Fmt) => (v: number) =>
  f === "pct" ? `${+(v * 100).toFixed(Math.abs(v) < 0.05 && v !== 0 ? 1 : 0)}%` : f === "x" ? `${v.toFixed(1)}x` : `${Math.round(v)}`;

export interface Series {
  key: string;
  name: string;
  values: Num[];
  color: string;
  dash?: boolean;
  kind?: "line" | "bar";
  stack?: string;
  width?: number;
}

export function Card({
  title,
  subtitle,
  right,
  children,
  foot,
  className = "",
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
  foot?: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm min-w-0 ${className}`}>
      <header className="flex flex-wrap items-start justify-between gap-2 px-4 pt-3.5 pb-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{title}</h3>
          {subtitle && <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</p>}
        </div>
        {right}
      </header>
      <div className="px-2 pb-2">{children}</div>
      {foot && <div className="px-4 pb-3 text-[11.5px] text-slate-500 dark:text-slate-400 leading-relaxed">{foot}</div>}
    </section>
  );
}

export function Legend({ series }: { series: Pick<Series, "name" | "color" | "dash" | "kind">[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 px-2 pb-1 text-[12px] text-slate-600 dark:text-slate-400">
      {series.map((s) => (
        <span key={s.name} className="inline-flex items-center gap-1.5">
          {s.kind === "bar" ? (
            <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: s.color }} />
          ) : s.dash ? (
            <span className="inline-block w-4 border-t-2 border-dashed" style={{ borderColor: s.color }} />
          ) : (
            <span className="inline-block w-4 h-0.5 rounded" style={{ background: s.color }} />
          )}
          {s.name}
        </span>
      ))}
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { key: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex items-center gap-px rounded-md bg-slate-100 dark:bg-slate-800 p-0.5">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key)}
          aria-pressed={value === o.key}
          className={`px-2.5 py-1 rounded text-[11.5px] font-semibold transition-colors ${
            value === o.key
              ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm"
              : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Line / bar / stacked-bar chart over quarters, one y-axis. */
export function QuarterChart({
  quarters,
  series,
  fmt,
  height = 260,
  from = 0,
  legend = true,
}: {
  quarters: string[];
  series: Series[];
  fmt: Fmt;
  height?: number;
  from?: number;
  legend?: boolean;
}) {
  const p = usePalette();
  const data = useMemo(
    () =>
      quarters.slice(from).map((q, j) => {
        const row: Record<string, string | number | null> = { q };
        for (const s of series) row[s.key] = s.values[j + from] ?? null;
        return row;
      }),
    [quarters, series, from]
  );
  const hasNeg = series.some((s) => s.values.slice(from).some((v) => v !== null && v < 0));
  return (
    <>
      {legend && <Legend series={series} />}
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }} barCategoryGap="22%">
          <CartesianGrid vertical={false} stroke={p.grid} />
          <XAxis dataKey="q" tick={{ fontSize: 11, fill: p.axis }} tickLine={false} axisLine={{ stroke: p.grid }} minTickGap={16} />
          <YAxis tickFormatter={fmtTick(fmt)} tick={{ fontSize: 11, fill: p.axis }} tickLine={false} axisLine={false} width={44} />
          {hasNeg && <ReferenceLine y={0} stroke={p.axis} strokeOpacity={0.6} />}
          <Tooltip
            cursor={{ stroke: p.axis, strokeOpacity: 0.4, fill: p.grid, fillOpacity: 0.35 }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              return (
                <div className="rounded-lg border border-slate-700 bg-slate-900/95 backdrop-blur text-white text-[11.5px] px-3 py-2 shadow-xl min-w-[170px]">
                  <div className="font-semibold mb-1">{qLong(String(label))}</div>
                  {series.map((s) => {
                    const v = payload.find((x) => x.dataKey === s.key)?.value as number | null | undefined;
                    return (
                      <div key={s.key} className="flex items-center justify-between gap-4">
                        <span className="inline-flex items-center gap-1.5 text-slate-300">
                          <span className="inline-block w-2 h-2 rounded-sm" style={{ background: s.color }} />
                          {s.name}
                        </span>
                        <span className="tabular-nums font-semibold">{fmtVal(fmt, v ?? null)}</span>
                      </div>
                    );
                  })}
                </div>
              );
            }}
          />
          {series.map((s) =>
            s.kind === "bar" ? (
              <Bar key={s.key} dataKey={s.key} fill={s.color} stackId={s.stack} radius={s.stack ? 0 : [3, 3, 0, 0]} isAnimationActive={false} />
            ) : (
              <Line
                key={s.key}
                dataKey={s.key}
                stroke={s.color}
                strokeWidth={s.width ?? 2}
                strokeDasharray={s.dash ? "5 4" : undefined}
                dot={false}
                activeDot={{ r: 4, stroke: "white", strokeWidth: 1 }}
                connectNulls
                isAnimationActive={false}
              />
            )
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </>
  );
}

export function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "up" | "down" | null }) {
  return (
    <div className="bg-white dark:bg-slate-900 px-3.5 py-3 min-w-0">
      <div className="text-[10.5px] uppercase tracking-wider text-slate-500 leading-tight">{label}</div>
      <div className="text-lg font-bold tabular-nums text-slate-900 dark:text-white mt-0.5">{value}</div>
      {sub && (
        <div
          className={`text-[11.5px] tabular-nums ${
            tone === "up" ? "text-emerald-600 dark:text-emerald-400" : tone === "down" ? "text-rose-600 dark:text-rose-400" : "text-slate-500"
          }`}
        >
          {sub}
        </div>
      )}
    </div>
  );
}

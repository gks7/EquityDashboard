"use client";

import React, { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  type DruckRow,
  FREQ_LABEL,
  fmtAxis,
  fmtDay,
  fmtIso,
  fmtMonthTick,
  fmtVal,
  niceTicks,
} from "@/lib/druck";

const SERIES = "#2c7bb6";
const MA = "#e8853a";

/** Expanded view of one indicator: why it matters + history chart with range picker. */
export const DruckChart: React.FC<{ row: DruckRow }> = ({ row }) => {
  const spanYears = (row.series[row.series.length - 1][0] - row.series[0][0]) / 365.25;
  const maxY = Math.max(1, Math.round(spanYears));
  const ranges = [1, 2, 5, 10].filter((y) => y < maxY).concat(maxY);
  const [years, setYears] = useState(
    row.freq === "A" || row.freq === "Q" ? maxY : Math.min(5, maxY)
  );

  const { data, ticks, step, xTicks, yearsOnly } = useMemo(() => {
    const end = row.series[row.series.length - 1][0];
    const start = end - years * 365.25;
    const maByDay = new Map((row.ma ?? []).map(([d, v]) => [d, v]));
    const data = row.series
      .filter(([d]) => d >= start)
      .map(([d, v]) => ({ d, v, ma: maByDay.get(d) ?? null }));
    const vals = data.flatMap((p) => (p.ma != null ? [p.v, p.ma] : [p.v]));
    let lo = Math.min(...vals), hi = Math.max(...vals);
    const pad = (hi - lo) * 0.05 || Math.abs(hi) * 0.05 || 1;
    lo -= pad; hi += pad;
    const { ticks, step } = niceTicks(lo, hi, 5);
    // x ticks on month starts
    const x0 = data[0]?.d ?? start, x1 = end;
    const span = (x1 - x0) / 365.25;
    const every = span > 6 ? 24 : span > 3 ? 12 : span > 1.5 ? 6 : 3;
    const xTicks: number[] = [];
    const y0 = new Date(x0 * 864e5).getUTCFullYear(), y1 = new Date(x1 * 864e5).getUTCFullYear();
    for (let y = y0; y <= y1; y++) {
      if (every === 24 && y % 2) continue;
      for (let m = 0; m < 12; m += Math.min(every, 12)) {
        const day = Date.UTC(y, m, 1) / 864e5;
        if (day >= x0 && day <= x1) xTicks.push(day);
      }
    }
    return { data, ticks, step, xTicks, yearsOnly: every >= 12 };
  }, [row, years]);

  const hasMa = !!row.ma && data.some((p) => p.ma != null);
  const crossesZero = ticks[0] < 0 && ticks[ticks.length - 1] > 0;

  return (
    <div className="px-4 py-4 bg-slate-50/60 dark:bg-slate-950/40">
      <p className="text-[12.5px] text-slate-600 dark:text-slate-400 max-w-3xl mb-3">
        {row.why}{" "}
        <span className="text-slate-400 dark:text-slate-500">
          Frequência {FREQ_LABEL[row.freq]}; último dado {fmtIso(row.date)}.
        </span>
      </p>
      <div className="flex flex-wrap items-center gap-3 mb-2">
        <div className="inline-flex items-center gap-px rounded-md bg-slate-100 dark:bg-slate-800 p-0.5">
          {ranges.map((y) => (
            <button
              key={y}
              type="button"
              onClick={() => setYears(y)}
              aria-pressed={years === y}
              className={`px-2 py-0.5 rounded text-[10.5px] font-semibold transition-colors ${
                years === y
                  ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm"
                  : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              {y}A
            </button>
          ))}
        </div>
        {hasMa && (
          <div className="ml-auto flex items-center gap-4 text-[11px] text-slate-500 dark:text-slate-400">
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block w-3.5 h-0.5 rounded" style={{ background: SERIES }} />
              {row.name}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block w-3.5 h-0.5 rounded" style={{ background: MA }} />
              Média móvel 200 dias
            </span>
          </div>
        )}
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
          <CartesianGrid vertical={false} className="stroke-slate-200 dark:stroke-slate-800" />
          <XAxis
            dataKey="d"
            type="number"
            domain={["dataMin", "dataMax"]}
            ticks={xTicks}
            tickFormatter={(d: number) => fmtMonthTick(d, yearsOnly)}
            tick={{ fontSize: 11, fill: "currentColor" }}
            className="text-slate-500"
            tickLine={false}
            axisLine={{ className: "stroke-slate-300 dark:stroke-slate-700" }}
          />
          <YAxis
            domain={[ticks[0], ticks[ticks.length - 1]]}
            ticks={ticks}
            tickFormatter={(v: number) => fmtAxis(row, v, step)}
            tick={{ fontSize: 11, fill: "currentColor" }}
            className="text-slate-500"
            tickLine={false}
            axisLine={false}
            width={64}
          />
          {crossesZero && <ReferenceLine y={0} className="stroke-slate-400 dark:stroke-slate-600" />}
          <Tooltip
            cursor={{ className: "stroke-slate-300 dark:stroke-slate-600" }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as { v: number; ma: number | null };
              return (
                <div className="rounded-lg border border-slate-700 bg-slate-900/95 backdrop-blur text-white text-[11.5px] px-3 py-2 shadow-xl">
                  <div className="text-slate-400 mb-0.5">{fmtDay(label as number)}</div>
                  <div className="font-semibold tabular-nums">{fmtVal(row, p.v)}</div>
                  {hasMa && p.ma != null && (
                    <div className="tabular-nums text-slate-300">Média 200d: {fmtVal(row, p.ma)}</div>
                  )}
                </div>
              );
            }}
          />
          {hasMa && (
            <Line type="monotone" dataKey="ma" stroke={MA} strokeWidth={2} dot={false}
              connectNulls isAnimationActive={false} activeDot={{ r: 4, fill: MA, stroke: "white", strokeWidth: 2 }} />
          )}
          <Line type="monotone" dataKey="v" stroke={SERIES} strokeWidth={2} dot={false}
            isAnimationActive={false} activeDot={{ r: 4, fill: SERIES, stroke: "white", strokeWidth: 2 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

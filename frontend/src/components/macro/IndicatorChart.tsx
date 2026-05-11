"use client";

import React, { useMemo } from "react";
import { X } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { MacroIndicator } from "@/lib/macroColors";

interface Props {
  indicator: MacroIndicator;
  recessionMonths?: string[];
  onClose: () => void;
}

const formatMonthShort = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m) return ym;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-US", {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  });
};

const formatMonthLong = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m) return ym;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
};

function contiguousRanges(months: string[]): Array<[string, string]> {
  if (!months || months.length === 0) return [];
  const sorted = [...months].sort();
  const ranges: Array<[string, string]> = [];
  let start = sorted[0];
  let prev = sorted[0];
  const nextMonth = (ym: string) => {
    const [y, m] = ym.split("-").map(Number);
    const d = new Date(Date.UTC(y, m, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  };
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] !== nextMonth(prev)) {
      ranges.push([start, prev]);
      start = sorted[i];
    }
    prev = sorted[i];
  }
  ranges.push([start, prev]);
  return ranges;
}

export const IndicatorChart: React.FC<Props> = ({
  indicator,
  recessionMonths,
  onClose,
}) => {
  const chartData = useMemo(
    () =>
      indicator.cells
        .filter((c) => c.value !== null)
        .map((c) => ({ month: c.month, value: c.value as number })),
    [indicator]
  );

  const stats = useMemo(() => {
    const values = chartData.map((d) => d.value);
    if (values.length === 0) {
      return { mean: 0, min: 0, max: 0, latest: 0 };
    }
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    return {
      mean,
      min: Math.min(...values),
      max: Math.max(...values),
      latest: values[values.length - 1],
    };
  }, [chartData]);

  const recessionRanges = useMemo(() => {
    if (!recessionMonths) return [];
    const seenInData = new Set(chartData.map((d) => d.month));
    return contiguousRanges(
      recessionMonths.filter((m) => seenInData.has(m))
    );
  }, [recessionMonths, chartData]);

  const isPct = /%/.test(indicator.transform_label);
  const formatY = (v: number) =>
    isPct ? `${v.toFixed(1)}%` : v >= 100 ? v.toFixed(0) : v.toFixed(2);

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800">
        <div className="flex flex-wrap items-baseline gap-3">
          <h3 className="text-base font-bold text-slate-900 dark:text-white">
            {indicator.name}
          </h3>
          <span className="text-[11px] uppercase tracking-wide text-slate-500">
            {indicator.id} · {indicator.transform_label}
          </span>
        </div>
        <button
          onClick={onClose}
          aria-label="Close chart"
          className="p-1 rounded-md text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-slate-200 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-800">
        <Stat label="Latest" value={formatY(stats.latest)} />
        <Stat label="6y mean" value={formatY(stats.mean)} />
        <Stat label="6y min" value={formatY(stats.min)} />
        <Stat label="6y max" value={formatY(stats.max)} />
      </div>

      <div className="px-2 py-3">
        <ResponsiveContainer width="100%" height={260}>
          <LineChart
            data={chartData}
            margin={{ top: 10, right: 16, bottom: 4, left: 0 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              className="stroke-slate-200 dark:stroke-slate-800"
            />
            <XAxis
              dataKey="month"
              tickFormatter={formatMonthShort}
              minTickGap={40}
              tick={{ fontSize: 11, fill: "currentColor" }}
              className="text-slate-500"
              tickLine={false}
              axisLine={{ className: "stroke-slate-300 dark:stroke-slate-700" }}
            />
            <YAxis
              tickFormatter={formatY}
              tick={{ fontSize: 11, fill: "currentColor" }}
              className="text-slate-500"
              tickLine={false}
              axisLine={false}
              width={56}
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const v = payload[0].value as number;
                return (
                  <div className="rounded-lg border border-slate-700 bg-slate-900/95 backdrop-blur text-white text-[11.5px] px-3 py-2 shadow-xl">
                    <div className="font-semibold mb-0.5">
                      {formatMonthLong(label as string)}
                    </div>
                    <div className="tabular-nums">{formatY(v)}</div>
                  </div>
                );
              }}
            />
            {recessionRanges.map(([s, e], i) => (
              <ReferenceArea
                key={`rec-${i}`}
                x1={s}
                x2={e}
                strokeOpacity={0}
                className="fill-slate-400/15 dark:fill-white/[0.06]"
              />
            ))}
            <ReferenceLine
              y={stats.mean}
              stroke="currentColor"
              strokeDasharray="4 4"
              className="text-slate-400 dark:text-slate-600"
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke="#2c7bb6"
              strokeWidth={1.75}
              dot={false}
              activeDot={{ r: 4, fill: "#2c7bb6", stroke: "white", strokeWidth: 1 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="px-4 pb-3 text-[11px] text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span>
          <span className="inline-block w-3 h-px align-middle bg-current mr-1.5 text-slate-400" />
          Dashed line = 6y mean
        </span>
        {recessionRanges.length > 0 && (
          <span>
            <span className="inline-block w-3 h-3 align-middle bg-slate-400/30 dark:bg-white/10 mr-1.5" />
            NBER recession
          </span>
        )}
      </div>
    </div>
  );
};

const Stat: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="bg-white dark:bg-slate-900 px-3 py-2">
    <div className="text-[10px] uppercase tracking-wider text-slate-500">
      {label}
    </div>
    <div className="text-sm font-semibold tabular-nums text-slate-900 dark:text-white">
      {value}
    </div>
  </div>
);

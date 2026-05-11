"use client";

import React, { useMemo } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { BondChartSeries, MacroPayload } from "@/lib/macroColors";

interface Props {
  data: MacroPayload;
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

function mergeSeriesByMonth(
  monthsWindow: string[],
  series: Array<{ key: string; data: BondChartSeries | undefined }>
): Array<Record<string, number | string | null>> {
  const lookups: Record<string, Map<string, number>> = {};
  for (const s of series) {
    const map = new Map<string, number>();
    s.data?.points.forEach((p) => map.set(p.month, p.value));
    lookups[s.key] = map;
  }
  return monthsWindow.map((m) => {
    const row: Record<string, number | string | null> = { month: m };
    for (const s of series) {
      row[s.key] = lookups[s.key].get(m) ?? null;
    }
    return row;
  });
}

const COLORS = {
  primary: "#2c7bb6", // blue
  secondary: "#d7191c", // red
  tertiary: "#7b3294", // purple
  warn: "#d35400", // burnt orange
};

interface ChartCardProps {
  title: string;
  subtitle: string;
  series: Array<{ key: string; label: string; color: string }>;
  data: Array<Record<string, number | string | null>>;
  recessionMonths?: string[];
  yUnit?: string;
  zeroLine?: boolean;
  latestSummary?: React.ReactNode;
}

const ChartCard: React.FC<ChartCardProps> = ({
  title,
  subtitle,
  series,
  data,
  recessionMonths,
  yUnit = "",
  zeroLine = false,
  latestSummary,
}) => {
  const recessionRanges = useMemo(() => {
    if (!recessionMonths) return [];
    const monthsInChart = new Set(data.map((d) => d.month as string));
    return contiguousRanges(recessionMonths.filter((m) => monthsInChart.has(m)));
  }, [recessionMonths, data]);

  const fmtY = (v: number) =>
    yUnit === "%"
      ? `${v.toFixed(2)}%`
      : v.toFixed(2);

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col">
      <div className="px-3 py-2.5 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-baseline justify-between gap-2 flex-wrap">
          <h4 className="text-[13px] font-bold text-slate-900 dark:text-white">
            {title}
          </h4>
          <span className="text-[10px] uppercase tracking-wider text-slate-400">
            6Y
          </span>
        </div>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
          {subtitle}
        </p>
        {latestSummary && <div className="mt-1.5">{latestSummary}</div>}
      </div>
      <div className="px-1 py-2 flex-1">
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={data} margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid
              strokeDasharray="3 3"
              className="stroke-slate-200 dark:stroke-slate-800"
            />
            <XAxis
              dataKey="month"
              tickFormatter={formatMonthShort}
              minTickGap={40}
              tick={{ fontSize: 10, fill: "currentColor" }}
              className="text-slate-500"
              tickLine={false}
              axisLine={{ className: "stroke-slate-300 dark:stroke-slate-700" }}
            />
            <YAxis
              tickFormatter={fmtY}
              tick={{ fontSize: 10, fill: "currentColor" }}
              className="text-slate-500"
              tickLine={false}
              axisLine={false}
              width={52}
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                return (
                  <div className="rounded-lg border border-slate-700 bg-slate-900/95 backdrop-blur text-white text-[11px] px-3 py-2 shadow-xl">
                    <div className="font-semibold mb-1">
                      {formatMonthLong(label as string)}
                    </div>
                    {payload.map((p) => (
                      <div
                        key={String(p.dataKey)}
                        className="flex items-center gap-2 tabular-nums"
                      >
                        <span
                          className="inline-block w-2 h-2 rounded-full"
                          style={{ backgroundColor: p.color }}
                        />
                        <span className="text-slate-300">{p.name}:</span>
                        <span>{fmtY(p.value as number)}</span>
                      </div>
                    ))}
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
            {zeroLine && (
              <ReferenceLine
                y={0}
                stroke="currentColor"
                strokeDasharray="4 4"
                className="text-slate-400 dark:text-slate-600"
              />
            )}
            {series.map((s) => (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.label}
                stroke={s.color}
                strokeWidth={1.75}
                dot={false}
                isAnimationActive={false}
                connectNulls
              />
            ))}
            {series.length > 1 && (
              <Legend
                verticalAlign="bottom"
                height={20}
                iconType="line"
                wrapperStyle={{ fontSize: 10 }}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

const Pill: React.FC<{ label: string; value: string; color?: string }> = ({
  label,
  value,
  color,
}) => (
  <span className="inline-flex items-center gap-1 text-[10.5px]">
    {color && (
      <span
        className="inline-block w-1.5 h-1.5 rounded-full"
        style={{ backgroundColor: color }}
      />
    )}
    <span className="text-slate-500 dark:text-slate-400">{label}</span>
    <span className="font-semibold text-slate-900 dark:text-white tabular-nums">
      {value}
    </span>
  </span>
);

const lastValue = (s?: BondChartSeries): number | null => {
  if (!s?.points || s.points.length === 0) return null;
  return s.points[s.points.length - 1].value;
};

const fmtPct = (v: number | null) =>
  v === null ? "—" : `${v.toFixed(2)}%`;

export const BondCockpit: React.FC<Props> = ({ data }) => {
  const bc = data.bond_chart;

  // From the heatmap-side cells (T10Y2Y already exists as an indicator).
  const t10y2yIndicator = useMemo(() => {
    for (const s of data.sections) {
      const f = s.indicators.find((i) => i.id === "T10Y2Y");
      if (f) return f;
    }
    return null;
  }, [data]);

  const hyIndicator = useMemo(() => {
    for (const s of data.sections) {
      const f = s.indicators.find((i) => i.id === "BAMLH0A0HYM2");
      if (f) return f;
    }
    return null;
  }, [data]);

  // Synthetic series from cells for the existing indicators.
  const t10y2ySeries: BondChartSeries | undefined = useMemo(() => {
    if (!t10y2yIndicator) return undefined;
    return {
      id: "T10Y2Y",
      name: "10Y-2Y",
      points: t10y2yIndicator.cells
        .filter((c) => c.value !== null)
        .map((c) => ({ month: c.month, value: c.value as number })),
    };
  }, [t10y2yIndicator]);

  const hySeries: BondChartSeries | undefined = useMemo(() => {
    if (!hyIndicator) return undefined;
    return {
      id: "BAMLH0A0HYM2",
      name: "HY OAS",
      points: hyIndicator.cells
        .filter((c) => c.value !== null)
        .map((c) => ({ month: c.month, value: c.value as number })),
    };
  }, [hyIndicator]);

  const ycData = useMemo(
    () =>
      mergeSeriesByMonth(data.months_window, [
        { key: "spread", data: t10y2ySeries },
      ]),
    [data.months_window, t10y2ySeries]
  );

  const creditData = useMemo(
    () =>
      mergeSeriesByMonth(data.months_window, [
        { key: "hy", data: hySeries },
        { key: "ig", data: bc?.BAMLC0A0CM },
      ]),
    [data.months_window, hySeries, bc]
  );

  const ratesData = useMemo(
    () =>
      mergeSeriesByMonth(data.months_window, [
        { key: "ff", data: bc?.FEDFUNDS },
        { key: "n10", data: bc?.DGS10 },
        { key: "r10", data: bc?.DFII10 },
      ]),
    [data.months_window, bc]
  );

  if (!bc) return null;

  const latestCurve = lastValue(t10y2ySeries);
  const latestHY = lastValue(hySeries);
  const latestIG = lastValue(bc.BAMLC0A0CM);
  const latestFF = lastValue(bc.FEDFUNDS);
  const latest10N = lastValue(bc.DGS10);
  const latest10R = lastValue(bc.DFII10);

  return (
    <div className="mb-4 grid grid-cols-1 lg:grid-cols-3 gap-3">
      <ChartCard
        title="US Yield Curve"
        subtitle="10Y minus 2Y Treasury spread. Inversion (< 0) leads recessions."
        series={[
          { key: "spread", label: "10Y-2Y", color: COLORS.primary },
        ]}
        data={ycData}
        recessionMonths={data.recession_months}
        yUnit="%"
        zeroLine
        latestSummary={
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
            <Pill
              label="10Y-2Y"
              value={fmtPct(latestCurve)}
              color={
                latestCurve !== null && latestCurve < 0
                  ? COLORS.secondary
                  : COLORS.primary
              }
            />
            {latestCurve !== null && (
              <span
                className={`text-[10px] font-semibold ${
                  latestCurve < 0
                    ? "text-rose-600 dark:text-rose-400"
                    : "text-sky-600 dark:text-sky-400"
                }`}
              >
                {latestCurve < 0 ? "inverted" : "positive"}
              </span>
            )}
          </div>
        }
      />

      <ChartCard
        title="Credit Spreads"
        subtitle="ICE BofA option-adjusted spreads. Wider = risk-off."
        series={[
          { key: "hy", label: "HY", color: COLORS.secondary },
          { key: "ig", label: "IG", color: COLORS.primary },
        ]}
        data={creditData}
        recessionMonths={data.recession_months}
        yUnit="%"
        latestSummary={
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
            <Pill label="HY" value={fmtPct(latestHY)} color={COLORS.secondary} />
            <Pill label="IG" value={fmtPct(latestIG)} color={COLORS.primary} />
          </div>
        }
      />

      <ChartCard
        title="Policy & Rates"
        subtitle="Fed Funds, 10Y nominal, 10Y real (TIPS)."
        series={[
          { key: "ff", label: "Fed Funds", color: COLORS.warn },
          { key: "n10", label: "10Y", color: COLORS.primary },
          { key: "r10", label: "10Y Real", color: COLORS.tertiary },
        ]}
        data={ratesData}
        recessionMonths={data.recession_months}
        yUnit="%"
        latestSummary={
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
            <Pill label="FF" value={fmtPct(latestFF)} color={COLORS.warn} />
            <Pill label="10Y" value={fmtPct(latest10N)} color={COLORS.primary} />
            <Pill
              label="Real"
              value={fmtPct(latest10R)}
              color={COLORS.tertiary}
            />
          </div>
        }
      />
    </div>
  );
};

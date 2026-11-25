"use client";

import React from "react";

interface Props {
  points: Array<[number, number]>;
  /** Fixed pixel size; omit width to stretch to the container. */
  width?: number;
  height?: number;
  /** Horizontal reference line (e.g. previous close). */
  refValue?: number | null;
  endDot?: boolean;
}

/** Tiny single-series line, no axes. Line in the series blue; text never uses it. */
export const MiniSpark: React.FC<Props> = ({ points, width, height = 28, refValue, endDot = true }) => {
  if (!points || points.length < 2) return null;
  const W = width ?? 100;
  const H = height;
  const p = 3;
  const xs = points.map((q) => q[0]);
  const ys = points.map((q) => q[1]).concat(refValue != null ? [refValue] : []);
  const x0 = xs[0], x1 = xs[xs.length - 1];
  const lo = Math.min(...ys), hi = Math.max(...ys);
  const X = (x: number) => p + ((x - x0) / (x1 - x0 || 1)) * (W - 2 * p);
  const Y = (y: number) => H - p - ((y - lo) / (hi - lo || 1)) * (H - 2 * p);
  const d = points.map((q, i) => `${i ? "L" : "M"}${X(q[0]).toFixed(2)},${Y(q[1]).toFixed(2)}`).join("");
  const last = points[points.length - 1];
  const stretch = width === undefined;
  return (
    <svg
      width={stretch ? "100%" : W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio={stretch ? "none" : undefined}
      aria-hidden="true"
      className="block overflow-visible"
    >
      {refValue != null && (
        <line x1={0} x2={W} y1={Y(refValue)} y2={Y(refValue)}
          className="stroke-slate-300 dark:stroke-slate-700" strokeWidth={1} vectorEffect="non-scaling-stroke" />
      )}
      <path d={d} fill="none" stroke="#2c7bb6" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round"
        vectorEffect="non-scaling-stroke" />
      {endDot && !stretch && (
        <circle cx={X(last[0])} cy={Y(last[1])} r={3} fill="#2c7bb6"
          className="stroke-white dark:stroke-slate-900" strokeWidth={2} />
      )}
    </svg>
  );
};

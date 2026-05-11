"use client";

import React from "react";
import type { Quadrant } from "./regime";

interface Props {
  growthZ: number | null;
  inflationZ: number | null;
  activeQuadrant: Quadrant;
  size?: number;
  axisLimit?: number;
}

const QUADRANT_LABELS: Array<{
  key: Quadrant;
  x: number; // -1 or +1 (relative center of quadrant)
  y: number; // -1 or +1 (in chart coords, positive = up)
  label: string;
}> = [
  { key: "stagflation", x: -1, y: 1, label: "Stagflation" },
  { key: "overheating", x: 1, y: 1, label: "Overheating" },
  { key: "recession", x: -1, y: -1, label: "Slowdown" },
  { key: "goldilocks", x: 1, y: -1, label: "Goldilocks" },
];

const FILL: Record<Quadrant, string> = {
  goldilocks: "rgba(14, 165, 233, 0.10)", // sky
  overheating: "rgba(245, 158, 11, 0.10)", // amber
  stagflation: "rgba(244, 63, 94, 0.14)", // rose darker
  recession: "rgba(244, 63, 94, 0.08)", // rose lighter
};

const FILL_ACTIVE: Record<Quadrant, string> = {
  goldilocks: "rgba(14, 165, 233, 0.25)",
  overheating: "rgba(245, 158, 11, 0.25)",
  stagflation: "rgba(244, 63, 94, 0.30)",
  recession: "rgba(244, 63, 94, 0.22)",
};

const LABEL_COLOR: Record<Quadrant, string> = {
  goldilocks: "#0369a1",
  overheating: "#b45309",
  stagflation: "#9f1239",
  recession: "#9f1239",
};

export const RegimeMatrix: React.FC<Props> = ({
  growthZ,
  inflationZ,
  activeQuadrant,
  size = 220,
  axisLimit = 1.5,
}) => {
  const pad = 28;
  const inner = size - pad * 2;
  const cx = pad + inner / 2;
  const cy = pad + inner / 2;
  const halfW = inner / 2;
  const halfH = inner / 2;

  // Project z to SVG coords. Clamp at axisLimit.
  const project = (z: number | null, axis: "x" | "y") => {
    if (z === null) return null;
    const clamped = Math.max(-axisLimit, Math.min(axisLimit, z));
    const t = clamped / axisLimit; // -1 .. +1
    return axis === "x" ? cx + t * halfW : cy - t * halfH;
  };

  const dotX = project(growthZ, "x");
  const dotY = project(inflationZ, "y");

  const quadrantRect = (qx: number, qy: number) => ({
    x: qx < 0 ? pad : cx,
    y: qy > 0 ? pad : cy,
    width: halfW,
    height: halfH,
  });

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width={size}
      height={size}
      className="select-none"
      aria-label="Regime matrix"
    >
      {/* Quadrant fills */}
      {QUADRANT_LABELS.map((q) => {
        const r = quadrantRect(q.x, q.y);
        const isActive = q.key === activeQuadrant;
        return (
          <rect
            key={q.key}
            x={r.x}
            y={r.y}
            width={r.width}
            height={r.height}
            fill={isActive ? FILL_ACTIVE[q.key] : FILL[q.key]}
            stroke={isActive ? LABEL_COLOR[q.key] : "transparent"}
            strokeWidth={isActive ? 1.2 : 0}
            strokeOpacity={0.6}
          />
        );
      })}

      {/* Axes */}
      <line
        x1={pad}
        x2={size - pad}
        y1={cy}
        y2={cy}
        className="stroke-slate-300 dark:stroke-slate-700"
        strokeDasharray="2 3"
      />
      <line
        x1={cx}
        x2={cx}
        y1={pad}
        y2={size - pad}
        className="stroke-slate-300 dark:stroke-slate-700"
        strokeDasharray="2 3"
      />

      {/* Outer frame */}
      <rect
        x={pad}
        y={pad}
        width={inner}
        height={inner}
        fill="none"
        className="stroke-slate-300 dark:stroke-slate-700"
      />

      {/* Quadrant labels */}
      {QUADRANT_LABELS.map((q) => {
        const labelX = cx + q.x * (halfW * 0.55);
        const labelY = cy - q.y * (halfH * 0.6);
        const isActive = q.key === activeQuadrant;
        return (
          <text
            key={`label-${q.key}`}
            x={labelX}
            y={labelY}
            textAnchor="middle"
            fontSize={10}
            fontWeight={isActive ? 700 : 500}
            fill={LABEL_COLOR[q.key]}
            opacity={isActive ? 1 : 0.7}
          >
            {q.label}
          </text>
        );
      })}

      {/* Axis labels */}
      <text
        x={size - 4}
        y={cy - 4}
        textAnchor="end"
        fontSize={9}
        className="fill-slate-500 dark:fill-slate-400"
      >
        Growth →
      </text>
      <text
        x={4}
        y={cy - 4}
        textAnchor="start"
        fontSize={9}
        className="fill-slate-500 dark:fill-slate-400"
      >
        ← weak
      </text>
      <text
        x={cx + 4}
        y={pad + 9}
        textAnchor="start"
        fontSize={9}
        className="fill-slate-500 dark:fill-slate-400"
      >
        ↑ Inflation
      </text>
      <text
        x={cx + 4}
        y={size - pad + 12}
        textAnchor="start"
        fontSize={9}
        className="fill-slate-500 dark:fill-slate-400"
      >
        ↓ disinflation
      </text>

      {/* Current position dot */}
      {dotX !== null && dotY !== null && (
        <>
          <circle
            cx={dotX}
            cy={dotY}
            r={9}
            className="fill-slate-900 dark:fill-white"
            opacity={0.12}
          />
          <circle
            cx={dotX}
            cy={dotY}
            r={4.5}
            className="fill-slate-900 dark:fill-white"
          />
          <circle
            cx={dotX}
            cy={dotY}
            r={4.5}
            fill="none"
            className="stroke-white dark:stroke-slate-900"
            strokeWidth={1.5}
          />
        </>
      )}
    </svg>
  );
};

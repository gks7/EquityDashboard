import React from "react";

interface Props {
  points: { date: string; value: number }[];
  width?: number;
  height?: number;
  className?: string;
}

export const Sparkline: React.FC<Props> = ({
  points,
  width = 64,
  height = 22,
  className = "text-slate-400 dark:text-slate-500",
}) => {
  if (!points || points.length < 2) {
    return <svg width={width} height={height} className={className} />;
  }
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const step = width / (points.length - 1);
  const coords = points.map((p, i) => ({
    x: i * step,
    y: height - ((p.value - min) / range) * height,
  }));
  const path = coords
    .map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(2)},${c.y.toFixed(2)}`)
    .join(" ");
  const last = coords[coords.length - 1];

  return (
    <svg
      width={width}
      height={height}
      aria-hidden="true"
      className={className}
      style={{ overflow: "visible" }}
    >
      <path d={path} fill="none" stroke="currentColor" strokeWidth={1.25} />
      <circle cx={last.x} cy={last.y} r={1.6} fill="currentColor" />
    </svg>
  );
};

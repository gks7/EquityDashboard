import React from "react";

interface Props {
  points: { date: string; value: number }[];
  width?: number;
  height?: number;
  stroke?: string;
}

// Tiny SVG sparkline. No charting library needed.
export const Sparkline: React.FC<Props> = ({
  points,
  width = 60,
  height = 22,
  stroke = "#f5f5f5",
}) => {
  if (!points || points.length < 2) {
    return <svg width={width} height={height} />;
  }
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const step = width / (points.length - 1);
  const d = points
    .map((p, i) => {
      const x = i * step;
      const y = height - ((p.value - min) / range) * height;
      return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  return (
    <svg width={width} height={height} aria-hidden="true">
      <path d={d} fill="none" stroke={stroke} strokeWidth={1.25} />
    </svg>
  );
};

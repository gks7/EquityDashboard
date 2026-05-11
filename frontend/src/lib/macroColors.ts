// Z-score -> hex color. Mirrors backend logic so cells render identically
// even if a frontend recompute is ever needed. Backend currently provides
// the color in the JSON, but keeping this here makes the data file optional.

export function zToColor(z: number | null, badWhenHigh: boolean): string {
  if (z === null || Number.isNaN(z)) return "#2a2a2a";

  let score = badWhenHigh ? -z : z;
  score = Math.max(-2, Math.min(2, score));

  if (score >= 0) {
    const t = score / 2;
    const r = Math.round(230 + t * (63 - 230));
    const g = Math.round(195 + t * (168 - 195));
    const b = Math.round(74 + t * (99 - 74));
    return `rgb(${r}, ${g}, ${b})`;
  }
  const t = -score / 2;
  const r = Math.round(230 + t * (210 - 230));
  const g = Math.round(195 + t * (69 - 195));
  const b = Math.round(74 + t * (69 - 74));
  return `rgb(${r}, ${g}, ${b})`;
}

export interface MacroCell {
  month: string;
  value: number | null;
  z: number | null;
  color: string;
}

export interface MacroIndicator {
  id: string;
  name: string;
  section: string;
  transform_label: string;
  bad_when_high: boolean;
  latest_value: number | null;
  latest_month: string | null;
  sparkline: { date: string; value: number }[];
  cells: MacroCell[];
}

export interface MacroSection {
  title: string;
  indicators: MacroIndicator[];
}

export interface MacroPayload {
  generated_at: string;
  rolling_window_years: number;
  months_window: string[];
  sections: MacroSection[];
}

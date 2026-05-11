// ColorBrewer RdYlBu — diverging palette safe for red-green colorblindness
// (deuteranopia/protanopia, ~8% of men). The green end is replaced by blue
// so the two poles remain distinguishable under all common color-vision
// deficiencies. Kept in sync with z_color() in fetch_macro_data.py.
const PALETTE: ReadonlyArray<[number, [number, number, number]]> = [
  [-2, [215, 25, 28]],   // #d7191c  red
  [-1, [253, 174, 97]],  // #fdae61  orange
  [0,  [254, 216, 118]], // #fed876  warm amber
  [1,  [116, 173, 209]], // #74add1  medium blue
  [2,  [44, 123, 182]],  // #2c7bb6  deep blue
];

const NO_DATA = "rgb(203, 213, 225)"; // slate-300

export function zToColor(z: number | null, badWhenHigh: boolean): string {
  if (z === null || Number.isNaN(z)) return NO_DATA;

  let score = badWhenHigh ? -z : z;
  score = Math.max(-2, Math.min(2, score));

  for (let i = 0; i < PALETTE.length - 1; i++) {
    const [z0, c0] = PALETTE[i];
    const [z1, c1] = PALETTE[i + 1];
    if (score <= z1) {
      const t = z1 === z0 ? 0 : (score - z0) / (z1 - z0);
      const r = Math.round(c0[0] + t * (c1[0] - c0[0]));
      const g = Math.round(c0[1] + t * (c1[1] - c0[1]));
      const b = Math.round(c0[2] + t * (c1[2] - c0[2]));
      return `rgb(${r}, ${g}, ${b})`;
    }
  }
  const [, last] = PALETTE[PALETTE.length - 1];
  return `rgb(${last[0]}, ${last[1]}, ${last[2]})`;
}

export const PALETTE_GRADIENT_CSS =
  "linear-gradient(to right, #d7191c, #fdae61, #fed876, #74add1, #2c7bb6)";

export interface MacroCell {
  month: string;
  value: number | null;
  z: number | null;
  color: string;
}

export type IndicatorFrequency = "D" | "W" | "M" | "Q";

export interface MacroIndicator {
  id: string;
  name: string;
  section: string;
  transform_label: string;
  bad_when_high: boolean;
  frequency?: IndicatorFrequency;
  latest_value: number | null;
  latest_month: string | null;
  sparkline: { date: string; value: number }[];
  cells: MacroCell[];
}

export interface BondChartSeries {
  id: string;
  name: string;
  points: { month: string; value: number }[];
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
  recession_months?: string[];
  bond_chart?: Record<string, BondChartSeries>;
}

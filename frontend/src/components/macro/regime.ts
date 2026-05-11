import type { MacroPayload, MacroIndicator } from "@/lib/macroColors";

export type RegimeTone = "good" | "neutral" | "warn" | "bad";

export interface Regime {
  label: string;
  tone: RegimeTone;
  reasons: string[];
}

function findIndicator(
  data: MacroPayload,
  name: string
): MacroIndicator | undefined {
  for (const s of data.sections) {
    for (const i of s.indicators) {
      if (i.name === name) return i;
    }
  }
  return undefined;
}

function sectionAvgLatestZ(
  data: MacroPayload,
  sectionTitle: string
): number | null {
  const section = data.sections.find((s) => s.title === sectionTitle);
  if (!section) return null;
  const zs: number[] = [];
  for (const ind of section.indicators) {
    const latest = ind.cells[ind.cells.length - 1];
    if (latest && latest.z !== null && latest.z !== undefined) {
      zs.push(latest.z);
    }
  }
  if (zs.length === 0) return null;
  return zs.reduce((a, b) => a + b, 0) / zs.length;
}

function sahmDelta(data: MacroPayload): number | null {
  const ur = findIndicator(data, "Unemployment Rate");
  if (!ur) return null;
  const cells = ur.cells.filter((c) => c.value !== null);
  if (cells.length < 13) return null;
  const latest = cells[cells.length - 1].value as number;
  const trailing12 = cells
    .slice(-13, -1)
    .map((c) => c.value as number);
  return latest - Math.min(...trailing12);
}

function latestValue(data: MacroPayload, name: string): number | null {
  const ind = findIndicator(data, name);
  if (!ind) return null;
  for (let i = ind.cells.length - 1; i >= 0; i--) {
    if (ind.cells[i].value !== null) return ind.cells[i].value;
  }
  return null;
}

export function classifyRegime(data: MacroPayload): Regime {
  const sahm = sahmDelta(data);
  const ycLatest = latestValue(data, "10Y-2Y Curve");
  const headlineZ = sectionAvgLatestZ(data, "Headline Inflation");
  const persistZ = sectionAvgLatestZ(data, "Inflation Persistence");
  const employmentZ = sectionAvgLatestZ(data, "Employment");
  const activityZ = sectionAvgLatestZ(data, "Activity");
  const creditZ = sectionAvgLatestZ(data, "Credit & Conditions");

  const sahmTriggered = sahm !== null && sahm >= 0.5;
  const ycInverted = ycLatest !== null && ycLatest < 0;
  const inflationHot = (headlineZ ?? 0) > 0.5 || (persistZ ?? 0) > 0.5;
  const employmentWeak = (employmentZ ?? 0) < -0.5;
  const activityWeak = (activityZ ?? 0) < -0.3;
  const activityStrong = (activityZ ?? 0) > 0.3;
  const creditTight = (creditZ ?? 0) > 0.5;

  const reasons: string[] = [];
  if (sahm !== null)
    reasons.push(
      `Sahm: UR +${sahm.toFixed(2)}pp vs 12m min${
        sahmTriggered ? " (triggered)" : ""
      }`
    );
  if (ycLatest !== null)
    reasons.push(
      `10Y-2Y curve: ${ycLatest > 0 ? "+" : ""}${ycLatest.toFixed(2)}%${
        ycInverted ? " (inverted)" : ""
      }`
    );
  if (headlineZ !== null)
    reasons.push(`Inflation avg z: ${headlineZ.toFixed(2)}`);
  if (employmentZ !== null)
    reasons.push(`Employment avg z: ${employmentZ.toFixed(2)}`);
  if (activityZ !== null)
    reasons.push(`Activity avg z: ${activityZ.toFixed(2)}`);
  if (creditZ !== null)
    reasons.push(`Credit/conditions avg z: ${creditZ.toFixed(2)}`);

  if (sahmTriggered || (employmentWeak && (ycInverted || creditTight))) {
    return { label: "Recession risk", tone: "bad", reasons };
  }
  if (inflationHot && !activityWeak) {
    return { label: "Late-cycle / hot", tone: "warn", reasons };
  }
  if (!inflationHot && activityStrong && !employmentWeak) {
    return { label: "Goldilocks", tone: "good", reasons };
  }
  if (activityWeak) {
    return { label: "Slowdown", tone: "warn", reasons };
  }
  return { label: "Mid-cycle expansion", tone: "neutral", reasons };
}

export const TONE_CLASSES: Record<RegimeTone, string> = {
  good: "bg-sky-500/10 text-sky-700 dark:text-sky-300 ring-sky-500/30",
  neutral:
    "bg-slate-500/10 text-slate-700 dark:text-slate-300 ring-slate-500/30",
  warn:
    "bg-amber-500/10 text-amber-700 dark:text-amber-300 ring-amber-500/30",
  bad: "bg-rose-500/10 text-rose-700 dark:text-rose-300 ring-rose-500/30",
};

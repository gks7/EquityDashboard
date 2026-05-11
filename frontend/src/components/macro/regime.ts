import type { MacroPayload, MacroSection } from "@/lib/macroColors";

export type RegimeTone = "good" | "neutral" | "warn" | "bad";

export type Quadrant =
  | "goldilocks"
  | "overheating"
  | "stagflation"
  | "recession";

export interface QuadrantInfo {
  key: Quadrant;
  label: string;
  blurb: string;
  tone: RegimeTone;
}

export const QUADRANTS: Record<Quadrant, QuadrantInfo> = {
  goldilocks: {
    key: "goldilocks",
    label: "Goldilocks",
    blurb: "Growth above trend, inflation below trend — historically the best regime for equities.",
    tone: "good",
  },
  overheating: {
    key: "overheating",
    label: "Overheating",
    blurb: "Growth above trend, inflation above trend — late-cycle; risk of Fed tightening.",
    tone: "warn",
  },
  stagflation: {
    key: "stagflation",
    label: "Stagflation",
    blurb: "Growth below trend, inflation above trend — historically the worst regime for both stocks and bonds.",
    tone: "bad",
  },
  recession: {
    key: "recession",
    label: "Disinflationary slowdown",
    blurb: "Growth below trend, inflation below trend — equities defensive, bonds rally.",
    tone: "bad",
  },
};

export interface RegimeAlert {
  key: "sahm" | "yc" | "credit";
  label: string;
  value: string;
  triggered: boolean;
}

export interface RegimeAssessment {
  growthZ: number | null;
  inflationZ: number | null;
  quadrant: QuadrantInfo;
  // Quadrant-derived label, optionally overridden by an alert (e.g. Sahm-triggered → "Recession risk")
  label: string;
  tone: RegimeTone;
  alerts: RegimeAlert[];
  // For the panel: per-section averages so the user can audit the math
  sectionAverages: Array<{ title: string; rawZ: number | null; signedZ: number | null }>;
}

function sectionRawAvgLatestZ(section: MacroSection): number | null {
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

function sectionSignedAvgLatestZ(section: MacroSection): number | null {
  const zs: number[] = [];
  for (const ind of section.indicators) {
    const latest = ind.cells[ind.cells.length - 1];
    if (latest && latest.z !== null && latest.z !== undefined) {
      zs.push(ind.bad_when_high ? -latest.z : latest.z);
    }
  }
  if (zs.length === 0) return null;
  return zs.reduce((a, b) => a + b, 0) / zs.length;
}

function findSection(
  data: MacroPayload,
  title: string
): MacroSection | undefined {
  return data.sections.find((s) => s.title === title);
}

function findIndicatorLatest(
  data: MacroPayload,
  name: string
): { value: number | null; z: number | null } | null {
  for (const s of data.sections) {
    for (const i of s.indicators) {
      if (i.name === name) {
        const latest = i.cells[i.cells.length - 1];
        if (!latest) return null;
        return { value: latest.value, z: latest.z };
      }
    }
  }
  return null;
}

function sahmDelta(data: MacroPayload): number | null {
  const sec = findSection(data, "Employment");
  if (!sec) return null;
  const ur = sec.indicators.find((i) => i.name === "Unemployment Rate");
  if (!ur) return null;
  const cells = ur.cells.filter((c) => c.value !== null);
  if (cells.length < 13) return null;
  const latest = cells[cells.length - 1].value as number;
  const prior12 = cells.slice(-13, -1).map((c) => c.value as number);
  return latest - Math.min(...prior12);
}

function avg(...vs: Array<number | null>): number | null {
  const filtered = vs.filter((v): v is number => v !== null);
  if (filtered.length === 0) return null;
  return filtered.reduce((a, b) => a + b, 0) / filtered.length;
}

export function classifyRegime(data: MacroPayload): RegimeAssessment {
  const headline = findSection(data, "Headline Inflation");
  const persist = findSection(data, "Inflation Persistence");
  const activity = findSection(data, "Activity");
  const employment = findSection(data, "Employment");
  const credit = findSection(data, "Credit & Conditions");

  // Growth axis: signed (higher = better) across Activity + Employment
  const activitySigned = activity ? sectionSignedAvgLatestZ(activity) : null;
  const employmentSigned = employment ? sectionSignedAvgLatestZ(employment) : null;
  const growthZ = avg(activitySigned, employmentSigned);

  // Inflation axis: raw z (higher = hotter inflation) across Headline + Persistence
  const headlineRaw = headline ? sectionRawAvgLatestZ(headline) : null;
  const persistRaw = persist ? sectionRawAvgLatestZ(persist) : null;
  const inflationZ = avg(headlineRaw, persistRaw);

  let quadrantKey: Quadrant;
  if (growthZ === null || inflationZ === null) {
    quadrantKey = "goldilocks";
  } else if (growthZ >= 0 && inflationZ < 0) {
    quadrantKey = "goldilocks";
  } else if (growthZ >= 0 && inflationZ >= 0) {
    quadrantKey = "overheating";
  } else if (growthZ < 0 && inflationZ >= 0) {
    quadrantKey = "stagflation";
  } else {
    quadrantKey = "recession";
  }
  const quadrant = QUADRANTS[quadrantKey];

  // Alerts (risk overlays)
  const sahm = sahmDelta(data);
  const yc = findIndicatorLatest(data, "10Y-2Y Curve");
  const creditSigned = credit ? sectionSignedAvgLatestZ(credit) : null;

  const sahmTriggered = sahm !== null && sahm >= 0.5;
  const ycInverted = yc?.value !== null && yc?.value !== undefined && yc.value < 0;
  const creditTight = (creditSigned ?? 0) < -0.5;

  const alerts: RegimeAlert[] = [
    {
      key: "sahm",
      label: "Sahm rule",
      value: sahm === null ? "—" : `+${sahm.toFixed(2)}pp`,
      triggered: sahmTriggered,
    },
    {
      key: "yc",
      label: "10Y-2Y curve",
      value:
        yc?.value === null || yc?.value === undefined
          ? "—"
          : `${yc.value > 0 ? "+" : ""}${yc.value.toFixed(2)}%`,
      triggered: !!ycInverted,
    },
    {
      key: "credit",
      label: "Credit/Conditions",
      value:
        creditSigned === null
          ? "—"
          : `signed z ${creditSigned > 0 ? "+" : ""}${creditSigned.toFixed(2)}`,
      triggered: creditTight,
    },
  ];

  // If Sahm triggered, override quadrant label with explicit recession risk.
  let label = quadrant.label;
  let tone = quadrant.tone;
  if (sahmTriggered) {
    label = "Recession risk";
    tone = "bad";
  }

  return {
    growthZ,
    inflationZ,
    quadrant,
    label,
    tone,
    alerts,
    sectionAverages: [
      {
        title: "Headline Inflation",
        rawZ: headlineRaw,
        signedZ: headline ? sectionSignedAvgLatestZ(headline) : null,
      },
      {
        title: "Inflation Persistence",
        rawZ: persistRaw,
        signedZ: persist ? sectionSignedAvgLatestZ(persist) : null,
      },
      {
        title: "Employment",
        rawZ: employment ? sectionRawAvgLatestZ(employment) : null,
        signedZ: employmentSigned,
      },
      {
        title: "Activity",
        rawZ: activity ? sectionRawAvgLatestZ(activity) : null,
        signedZ: activitySigned,
      },
      {
        title: "Credit & Conditions",
        rawZ: credit ? sectionRawAvgLatestZ(credit) : null,
        signedZ: creditSigned,
      },
    ],
  };
}

export const TONE_CLASSES: Record<RegimeTone, string> = {
  good: "bg-sky-500/10 text-sky-700 dark:text-sky-300 ring-sky-500/30",
  neutral:
    "bg-slate-500/10 text-slate-700 dark:text-slate-300 ring-slate-500/30",
  warn:
    "bg-amber-500/10 text-amber-700 dark:text-amber-300 ring-amber-500/30",
  bad: "bg-rose-500/10 text-rose-700 dark:text-rose-300 ring-rose-500/30",
};

export const QUADRANT_FILLS: Record<Quadrant, string> = {
  goldilocks: "fill-sky-500/10",
  overheating: "fill-amber-500/10",
  stagflation: "fill-rose-500/15",
  recession: "fill-rose-500/10",
};

export const QUADRANT_TEXT: Record<Quadrant, string> = {
  goldilocks: "text-sky-700 dark:text-sky-300",
  overheating: "text-amber-700 dark:text-amber-300",
  stagflation: "text-rose-700 dark:text-rose-300",
  recession: "text-rose-700 dark:text-rose-400",
};

"use client";

import React from "react";
import type { MacroSection } from "@/lib/macroColors";
import { HeatmapRow } from "./HeatmapRow";

interface Props {
  section: MacroSection;
  monthsWindow: string[];
}

export const HeatmapSection: React.FC<Props> = ({ section, monthsWindow }) => {
  return (
    <section className="mb-6 last:mb-0">
      <h3 className="text-white text-[15px] font-bold tracking-tight mb-2">
        {section.title}
      </h3>
      <div>
        {section.indicators.map((ind) => (
          <HeatmapRow
            key={ind.id}
            indicator={ind}
            monthsWindow={monthsWindow}
          />
        ))}
      </div>
    </section>
  );
};

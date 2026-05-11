"use client";

import React, { createContext, useContext, useMemo, useState } from "react";

interface MacroHoverState {
  hoveredMonth: string | null;
  hoveredIndex: number | null;
  setHovered: (month: string | null, index: number | null) => void;
}

const Ctx = createContext<MacroHoverState>({
  hoveredMonth: null,
  hoveredIndex: null,
  setHovered: () => {},
});

export const useMacroHover = () => useContext(Ctx);

export function MacroHoverProvider({ children }: { children: React.ReactNode }) {
  const [month, setMonth] = useState<string | null>(null);
  const [index, setIndex] = useState<number | null>(null);
  const value = useMemo<MacroHoverState>(
    () => ({
      hoveredMonth: month,
      hoveredIndex: index,
      setHovered: (m, i) => {
        setMonth(m);
        setIndex(i);
      },
    }),
    [month, index]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

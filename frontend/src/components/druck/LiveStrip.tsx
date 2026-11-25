"use client";

import React from "react";
import { Info } from "lucide-react";
import { type LivePayload, type LiveSpec, liveChg, liveVal } from "@/lib/druck";
import { MiniSpark } from "./MiniSpark";

const hhmm = (s: number) =>
  new Date(s * 1000).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

const UP = "#10b981"; // emerald-500
const DOWN = "#f43f5e"; // rose-500
const FLAT = "#94a3b8"; // slate-400

const ROW = "grid grid-cols-[minmax(0,1fr)_64px_auto_68px] items-center gap-3 px-3 py-1.5";

interface Props {
  live: LivePayload | null;
  error: string | null;
}

/**
 * Intraday quote board. Colour follows the day's price move (green up, red down),
 * on the change pill and the intraday line; the grey hairline is the previous close.
 */
export const LiveStrip: React.FC<Props> = ({ live, error }) => {
  const groups: Array<{ name: string; items: LiveSpec[] }> = [];
  live?.spec.forEach((s) => {
    let g = groups.find((x) => x.name === s.grp);
    if (!g) groups.push((g = { name: s.grp, items: [] }));
    g.items.push(s);
  });
  const now = live?.asof ?? 0; // server time of the snapshot
  const on = !!live && !error;

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm mb-6">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-200 dark:border-slate-800">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
          <span className="relative flex w-2 h-2">
            {on && <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60 animate-ping" />}
            <span className={`relative inline-flex w-2 h-2 rounded-full ${on ? "bg-emerald-500" : "bg-slate-400"}`} />
          </span>
          Ao vivo
        </h2>
        <span
          className="inline-flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400"
          title="Yahoo Finance, atualiza a cada 60 s. Alguns ativos têm até 15 min de atraso. Variação contra o fechamento anterior (linha cinza no gráfico)."
        >
          {error
            ? `Indisponível agora (${error})`
            : live
              ? `Atualizado às ${hhmm(live.asof)}`
              : "Carregando…"}
          <Info className="w-3.5 h-3.5" />
        </span>
      </div>

      {!live && !error && (
        <div className="p-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3 animate-pulse">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-24 rounded-lg bg-slate-100 dark:bg-slate-800" />
          ))}
        </div>
      )}

      {live && (
        <div className="p-4 columns-1 md:columns-2 xl:columns-3 gap-4">
          {groups.map((g) => (
            <div key={g.name}
              className="break-inside-avoid mb-4 rounded-lg ring-1 ring-slate-200 dark:ring-slate-800 overflow-hidden">
              <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                {g.name}
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800/70">
                {g.items.map((s) => {
                  const q = live.quotes[s.id];
                  if (!q) {
                    return (
                      <div key={s.id} className={ROW}>
                        <span className="truncate text-[12.5px] text-slate-500">{s.name}</span>
                        <span />
                        <span className="text-[12.5px] text-slate-400">—</span>
                        <span className="text-[11px] text-slate-400 text-right">sem dados</span>
                      </div>
                    );
                  }
                  const ch = liveChg(s, q);
                  const dir = ch.c == null || Math.abs(ch.c) < 1e-4 ? 0 : Math.sign(ch.c);
                  const color = dir > 0 ? UP : dir < 0 ? DOWN : FLAT;
                  const closed = now - q.time > 3 * 3600;
                  return (
                    <div key={s.id} className={`${ROW} hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors`}
                      title={q.time ? `Último negócio às ${hhmm(q.time)}` : undefined}>
                      <span className="min-w-0">
                        <span className="block truncate text-[12.5px] text-slate-700 dark:text-slate-300">{s.name}</span>
                        {closed && <span className="block text-[10px] text-slate-400">fechado · {hhmm(q.time)}</span>}
                      </span>
                      <MiniSpark points={q.intraday} width={64} height={24} refValue={q.prev} color={color} endDot={false} area />
                      <span className="text-[13px] font-semibold tabular-nums text-right text-slate-900 dark:text-white">
                        {liveVal(s, q.last)}
                      </span>
                      <span
                        className={`justify-self-end inline-flex justify-center min-w-[64px] rounded-md px-1.5 py-0.5 text-[11.5px] font-semibold tabular-nums ${
                          dir > 0
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                            : dir < 0
                              ? "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                              : "bg-slate-500/10 text-slate-500 dark:text-slate-400"
                        }`}
                      >
                        {ch.txt}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

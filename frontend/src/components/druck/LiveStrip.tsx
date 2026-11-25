"use client";

import React from "react";
import { type LivePayload, type LiveSpec, chgTone, liveChg, liveVal } from "@/lib/druck";
import { MiniSpark } from "./MiniSpark";

const hhmm = (s: number) =>
  new Date(s * 1000).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

interface Props {
  live: LivePayload | null;
  error: string | null;
}

/** Intraday quotes grouped by theme; previous close is the grey reference line. */
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
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3 border-b border-slate-200 dark:border-slate-800">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
          <span className={`inline-block w-2 h-2 rounded-full ${on ? "bg-emerald-500" : "bg-slate-400"}`} />
          Ao vivo
        </h2>
        <span className="text-[11px] text-slate-500 dark:text-slate-400">
          {error
            ? `Indisponível agora (${error}). Tenta de novo em 1 min.`
            : live
              ? `Atualizado às ${hhmm(live.asof)} · a cada 60 s · Yahoo Finance, alguns ativos com até 15 min de atraso · variação contra o fechamento anterior`
              : "Carregando cotações…"}
        </span>
      </div>
      {live && (
        <div className="flex flex-wrap gap-x-6 gap-y-4 px-4 py-4">
          {groups.map((g) => (
            <div key={g.name} className="w-full sm:w-auto">
              <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1.5">{g.name}</div>
              <div
                className="grid grid-cols-2 sm:grid-cols-[repeat(var(--n),150px)] gap-2"
                style={{ ["--n" as string]: g.items.length }}
              >
                {g.items.map((s) => {
                  const q = live.quotes[s.id];
                  if (!q) {
                    return (
                      <div key={s.id} className="rounded-lg ring-1 ring-slate-200 dark:ring-slate-800 px-2.5 py-2">
                        <div className="text-[11px] text-slate-500 truncate">{s.name}</div>
                        <div className="text-base font-semibold text-slate-400">—</div>
                        <div className="text-[11px] text-slate-400">sem dados</div>
                      </div>
                    );
                  }
                  const ch = liveChg(s, q);
                  const closed = now - q.time > 3 * 3600;
                  return (
                    <div key={s.id} title="Linha cinza = fechamento anterior"
                      className="rounded-lg ring-1 ring-slate-200 dark:ring-slate-800 px-2.5 pt-2 pb-1.5 min-w-0">
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{s.name}</div>
                      <div className="text-base font-semibold text-slate-900 dark:text-white">{liveVal(s, q.last)}</div>
                      <div className="flex justify-between gap-2 text-[11px] tabular-nums">
                        <span className={chgTone(s.pol, ch.c)}>{ch.txt}</span>
                        <span className="text-slate-400 dark:text-slate-500">
                          {closed ? "fechado " : ""}{q.time ? hhmm(q.time) : ""}
                        </span>
                      </div>
                      <div className="mt-1">
                        <MiniSpark points={q.intraday} height={28} refValue={q.prev} />
                      </div>
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

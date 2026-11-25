"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronRight, Droplets, Info, RefreshCcw, TriangleAlert } from "lucide-react";
import { authFetch } from "@/lib/authFetch";
import {
  type BlockTone,
  type DruckBlock,
  type DruckPayload,
  type DruckRow,
  type LivePayload,
  blockTone,
  chgTone,
  fmtChg,
  fmtIso,
  fmtVal,
  liveRowValue,
  nf,
} from "@/lib/druck";
import { DruckChart } from "@/components/druck/DruckChart";
import { LiveStrip } from "@/components/druck/LiveStrip";
import { MiniSpark } from "@/components/druck/MiniSpark";

const API = `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/druck`;
const LIVE_MS = 60_000;

const TONE: Record<BlockTone, { label: string; icon: string; pill: string }> = {
  good: { label: "Favorável", icon: "▲", pill: "bg-sky-500/10 text-sky-700 dark:text-sky-300 ring-sky-500/30" },
  bad: { label: "Desfavorável", icon: "▼", pill: "bg-rose-500/10 text-rose-700 dark:text-rose-300 ring-rose-500/30" },
  mixed: { label: "Misto", icon: "◆", pill: "bg-slate-500/10 text-slate-700 dark:text-slate-300 ring-slate-500/30" },
  info: { label: "Só contexto", icon: "○", pill: "bg-slate-500/10 text-slate-600 dark:text-slate-400 ring-slate-500/20" },
};

const ToneBadge: React.FC<{ b: DruckBlock }> = ({ b }) => {
  const t = TONE[blockTone(b)];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11.5px] font-semibold ring-1 ${t.pill}`}>
      <span aria-hidden="true" className="text-[9px]">{t.icon}</span>
      {t.label}
    </span>
  );
};

const SignalBadge: React.FC<{ r: DruckRow }> = ({ r }) => {
  let icon = "○", label: string, cls = "text-slate-400";
  if (r.signal === 1) { icon = "▲"; label = "A favor"; cls = "text-sky-600 dark:text-sky-400"; }
  else if (r.signal === -1) { icon = "▼"; label = "Contra"; cls = "text-rose-600 dark:text-rose-400"; }
  else if (r.signal === 0) { icon = "●"; label = "Estável"; }
  else label = `Info · ${r.dir > 0 ? "subindo" : r.dir < 0 ? "caindo" : "estável"}`;
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span aria-hidden="true" className={`text-[10px] ${cls}`}>{icon}</span>
      <span className="text-slate-700 dark:text-slate-300">{label}</span>
      {r.inflex && (
        <span title="Último mês contra a tendência de 6 meses"
          className="ml-1 px-1.5 py-px rounded-full text-[10px] ring-1 ring-slate-300 dark:ring-slate-700 text-slate-600 dark:text-slate-400">
          ↻ virando
        </span>
      )}
    </span>
  );
};

const formatRelative = (iso: string) => {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "agora";
  if (mins < 60) return `há ${mins} min`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `há ${hrs} h`;
  const days = Math.round(hrs / 24);
  return `há ${days} dia${days === 1 ? "" : "s"}`;
};

export default function DruckPage() {
  const [data, setData] = useState<DruckPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [live, setLive] = useState<LivePayload | null>(null);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const r = await fetch(`/data/druck.json?ts=${Date.now()}`, { cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setData(await r.json());
    } catch (e) {
      setError(String(e));
    } finally {
      setRefreshing(false);
    }
  }, []);

  const loadLive = useCallback(async () => {
    try {
      const r = await authFetch(`${API}/live/`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setLive(await r.json());
      setLiveError(null);
    } catch (e) {
      setLiveError(String(e).replace(/^Error: /, ""));
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    loadLive();
    const id = setInterval(() => { if (!document.hidden) loadLive(); }, LIVE_MS);
    const onVis = () => { if (!document.hidden) loadLive(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", onVis); };
  }, [loadLive]);

  const toggle = useCallback((id: string) => {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const summary = useMemo(() => {
    if (!data) return null;
    const scored = data.blocks.filter((b) => b.n);
    const fav = scored.filter((b) => blockTone(b) === "good").length;
    const unf = scored.filter((b) => blockTone(b) === "bad").length;
    const latest = data.rows.map((r) => r.date).sort().pop() ?? "";
    return { scored: scored.length, fav, unf, mixed: scored.length - fav - unf, latest };
  }, [data]);

  if (error) {
    return (
      <div className="max-w-7xl mx-auto pb-12">
        <div className="p-4 rounded-lg border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-900/20 text-sm text-rose-700 dark:text-rose-300">
          Falha ao carregar os dados do painel: {error}
        </div>
      </div>
    );
  }
  if (!data || !summary) {
    return (
      <div className="max-w-7xl mx-auto pb-12 animate-pulse">
        <div className="h-7 w-48 bg-slate-200 dark:bg-slate-800 rounded mb-2" />
        <div className="h-4 w-96 bg-slate-200 dark:bg-slate-800 rounded mb-6" />
        <div className="h-40 bg-slate-200 dark:bg-slate-800 rounded-xl mb-6" />
        <div className="h-[420px] bg-slate-200 dark:bg-slate-800 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto pb-12">
      {/* header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-blue-500/10 text-blue-500">
              <Droplets className="w-4 h-4" />
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Druck</h1>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-3xl">
            Os indicadores que Stanley Druckenmiller acompanha: liquidez primeiro, direção mais que nível.
            Sinal = tendência de 3 meses ajustada pelo efeito no risco. Leitura mecânica, não recomendação.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden sm:flex flex-col items-end text-[11px] leading-tight">
            <span className="text-slate-400 dark:text-slate-500">Dados diários até {fmtIso(summary.latest)}</span>
            <span className="text-slate-700 dark:text-slate-300 font-medium"
              title={new Date(data.generated_at).toLocaleString("pt-BR")}>
              gerado {formatRelative(data.generated_at)}
            </span>
          </div>
          <button
            onClick={() => { load(); loadLive(); }}
            disabled={refreshing}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"
          >
            <RefreshCcw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      <LiveStrip live={live} error={liveError} />

      {/* regime */}
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-3">
        <span className="text-5xl font-bold tracking-tight text-slate-900 dark:text-white">
          {summary.fav} de {summary.scored}
        </span>
        <span className="text-sm text-slate-500 dark:text-slate-400">
          blocos a favor do risco · {summary.unf} contra · {summary.mixed} mistos
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {data.blocks.map((b) => {
          const sigs = data.rows.filter((r) => r.block === b.id && r.signal != null);
          return (
            <a key={b.id} href={`#b-${b.id}`}
              className="block bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-sm font-semibold text-slate-900 dark:text-white">{b.name}</span>
                <ToneBadge b={b} />
              </div>
              {b.n ? (
                <>
                  <div className="flex gap-0.5 h-2" aria-hidden="true">
                    {sigs.map((r) => (
                      <span key={r.id} title={r.name}
                        className={`flex-1 rounded-full ${r.signal! > 0 ? "bg-sky-600" : r.signal! < 0 ? "bg-rose-500" : "bg-slate-200 dark:bg-slate-700"}`} />
                    ))}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">
                    {b.pos} a favor · {b.neg} contra · {b.n - b.pos - b.neg} estáveis
                  </div>
                </>
              ) : (
                <div className="text-[11px] text-slate-500 dark:text-slate-400">Indicadores de contexto, sem placar</div>
              )}
            </a>
          );
        })}
      </div>

      <details className="mb-6 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm px-4 py-3 text-[12.5px] text-slate-600 dark:text-slate-400">
        <summary className="cursor-pointer font-medium text-slate-800 dark:text-slate-200 inline-flex items-center gap-2">
          <Info className="w-3.5 h-3.5" /> Como ler
        </summary>
        <ul className="list-disc pl-5 mt-2 space-y-1">
          <li><b>Sinal</b> = direção dos últimos 3 meses (12 para séries anuais), ajustada pelo efeito no risco. Ex.: spread de high yield caindo conta como &ldquo;a favor&rdquo;.</li>
          <li>Variações menores que ¼ do desvio-padrão histórico daquele prazo contam como <b>estável</b>.</li>
          <li><b>↻ virando</b> = o último mês vai contra a tendência de 6 meses. É a mudança de direção que ele procura.</li>
          <li><b>Pctl 10a</b> = percentil do valor atual nos últimos 10 anos (100 = máxima). Um número pequeno ao lado indica histórico mais curto na fonte; os spreads ICE BofA no FRED só têm ~3 anos.</li>
          <li><b>Info</b> = a direção não é boa nem ruim por si só; fica fora do placar.</li>
          <li>O ● na coluna Último marca cotação ao vivo; variações e sinal usam o fechamento diário.</li>
        </ul>
      </details>

      {data.blocks.map((b) => {
        const rows = data.rows.filter((r) => r.block === b.id);
        if (!rows.length) return null;
        return (
          <section key={b.id} id={`b-${b.id}`} className="mb-6 scroll-mt-6">
            <div className="flex items-center gap-2 flex-wrap mb-0.5">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{b.name}</h2>
              <ToneBadge b={b} />
            </div>
            <p className="text-[12.5px] text-slate-500 dark:text-slate-400 mb-2">{b.desc}</p>
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-x-auto">
              <table className="w-full min-w-[880px] text-[12.5px]">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-200 dark:border-slate-800">
                    <th className="text-left font-medium px-4 py-2">Indicador</th>
                    <th className="text-right font-medium px-3 py-2">Último</th>
                    <th className="text-right font-medium px-3 py-2">2 anos</th>
                    <th className="text-right font-medium px-3 py-2">1m</th>
                    <th className="text-right font-medium px-3 py-2">3m</th>
                    <th className="text-right font-medium px-3 py-2">6m</th>
                    <th className="text-right font-medium px-3 py-2">12m</th>
                    <th className="text-right font-medium px-3 py-2" title="Percentil nos últimos 10 anos">Pctl 10a</th>
                    <th className="text-left font-medium px-3 py-2">Sinal</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const isOpen = open.has(r.id);
                    const liveV = liveRowValue(r, live?.quotes);
                    const end = r.series[r.series.length - 1][0];
                    return (
                      <React.Fragment key={r.id}>
                        <tr
                          tabIndex={0}
                          aria-expanded={isOpen}
                          onClick={() => toggle(r.id)}
                          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(r.id); } }}
                          className="cursor-pointer border-b border-slate-100 dark:border-slate-800/70 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800/40 focus-visible:outline-none focus-visible:bg-slate-50 dark:focus-visible:bg-slate-800/40"
                        >
                          <td className="px-4 py-2">
                            <div className="flex items-start gap-1.5">
                              <ChevronRight className={`w-3.5 h-3.5 mt-0.5 shrink-0 text-slate-400 transition-transform ${isOpen ? "rotate-90" : ""}`} />
                              <div>
                                <div className="font-medium text-slate-900 dark:text-slate-100">{r.name}</div>
                                <div className="text-[11px] text-slate-400 dark:text-slate-500">
                                  {fmtIso(r.date)}
                                  {r.stale && (
                                    <span className="ml-1.5 inline-flex items-center gap-0.5 text-rose-600 dark:text-rose-400">
                                      <TriangleAlert className="w-3 h-3" /> desatualizado
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap text-slate-900 dark:text-slate-100">
                            {fmtVal(r, liveV ?? r.last)}
                            {liveV != null && (
                              <span className="ml-1 text-[8px] align-middle text-emerald-500"
                                title="Cotação ao vivo; variações e sinal usam o fechamento diário">●</span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex justify-end">
                              <MiniSpark points={r.series.filter(([d]) => d >= end - 730)} width={112} height={28} />
                            </div>
                          </td>
                          {(["1", "3", "6", "12"] as const).map((h) => (
                            <td key={h} className={`px-3 py-2 text-right tabular-nums whitespace-nowrap ${chgTone(r.pol, r.chg[h])}`}>
                              {fmtChg(r, r.chg[h])}
                            </td>
                          ))}
                          <td className="px-3 py-2 text-right tabular-nums text-slate-700 dark:text-slate-300"
                            title={r.histY < 9.5 ? `Percentil sobre só ${nf(r.histY, 1)} anos de histórico` : undefined}>
                            {Math.round(r.pctl)}
                            {r.histY < 9.5 && <sup className="ml-0.5 text-slate-400">{Math.round(r.histY)}a</sup>}
                          </td>
                          <td className="px-3 py-2"><SignalBadge r={r} /></td>
                        </tr>
                        {isOpen && (
                          <tr className="border-b border-slate-100 dark:border-slate-800/70">
                            <td colSpan={9} className="p-0">
                              <DruckChart row={r} />
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}

      <footer className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
        <span>Fontes: FRED (St. Louis Fed) e Yahoo Finance</span>
        <span className="text-slate-300 dark:text-slate-700">·</span>
        <span>Séries diárias aparecem semanais antes dos últimos 2 anos</span>
        {data.missing.length > 0 && (
          <>
            <span className="text-slate-300 dark:text-slate-700">·</span>
            <span>Sem dados nesta rodada: {data.missing.join(", ")}</span>
          </>
        )}
      </footer>
    </div>
  );
}

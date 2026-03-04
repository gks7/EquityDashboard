import React from 'react';

interface CleanSummaryProps {
    totalValue: number;
    totalDailyPL: number;
    totalDailyPLPct: number;
}

export const CleanSummary: React.FC<CleanSummaryProps> = ({ totalValue, totalDailyPL, totalDailyPLPct }) => {
    const formattedValue = `$${totalValue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
    const formattedPL = `${totalDailyPL >= 0 ? '+' : ''}${totalDailyPL.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const formattedPct = `${totalDailyPLPct >= 0 ? '+' : ''}${totalDailyPLPct.toFixed(2)}%`;

    const plColor = totalDailyPL >= 0 ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400' : 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400';

    return (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-8 bg-white dark:bg-[#111827] shadow-sm flex flex-col justify-center">
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-2">Total Value</h2>
            <div className="text-4xl sm:text-5xl font-bold tracking-tight text-slate-900 dark:text-white mb-4">{formattedValue}</div>
            <div className="flex items-center gap-2">
                <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold ${plColor}`}>
                    {totalDailyPL >= 0 ? <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7" /></svg> : <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12l-5 5L4 7" /></svg>}
                    {formattedPL} <span className="opacity-70 font-medium ml-1">({formattedPct})</span>
                </div>
                <span className="text-sm font-medium text-slate-400">Past 24h</span>
            </div>
        </div>
    );
};

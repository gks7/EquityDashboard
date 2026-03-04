import React from 'react';
import { PortfolioHolding } from '../page'; // Adjust import path if needed

interface AllocationPieChartProps {
    holdings: PortfolioHolding[];
    totalValue: number;
}

export const AllocationPieChart: React.FC<AllocationPieChartProps> = ({ holdings, totalValue }) => {
    const buckets = {
        eqSingle: 0,
        eqIndex: 0,
        fiCorp: 0,
        fiIndex: 0,
        fiEM: 0,
        fiTreasury: 0,
        other: 0,
    };

    holdings.forEach(h => {
        const isEquity = h.asset_type === 'Equity' || (!h.asset_type && h.stock_details);
        const specific = (h.specific_type || '').toLowerCase();
        if (isEquity) {
            if (specific.includes('index') || specific.includes('etf')) buckets.eqIndex += h.current_value;
            else buckets.eqSingle += h.current_value;
        } else if (h.asset_type === 'Fixed Income' || h.asset_type === 'Treasury' || h.asset_type === 'EM Sovereign') {
            if (specific.includes('corp')) buckets.fiCorp += h.current_value;
            else if (specific.includes('index') || specific.includes('etf')) buckets.fiIndex += h.current_value;
            else if (specific.includes('em') || h.asset_type === 'EM Sovereign') buckets.fiEM += h.current_value;
            else if (specific.includes('treasury') || h.asset_type === 'Treasury') buckets.fiTreasury += h.current_value;
            else buckets.other += h.current_value;
        } else {
            buckets.other += h.current_value;
        }
    });

    const segments = [
        { label: 'Equities (Single)', value: buckets.eqSingle, color: '#3b82f6' }, // blue-500
        { label: 'Equities (Index)', value: buckets.eqIndex, color: '#94a3b8' }, // slate-400
        { label: 'Corporate Bonds', value: buckets.fiCorp, color: '#14b8a6' }, // teal-500
        { label: 'FI Index', value: buckets.fiIndex, color: '#8b5cf6' }, // violet-500
        { label: 'EM Sovereign', value: buckets.fiEM, color: '#f97316' }, // orange-500
        { label: 'Treasury', value: buckets.fiTreasury, color: '#f43f5e' }, // rose-500
        { label: 'Other', value: buckets.other, color: '#64748b' }, // slate-500
    ].filter(s => s.value > 0);

    let cumulative = 0;
    const arcs = segments.map(seg => {
        const percent = seg.value / totalValue;
        const startAngle = cumulative * 360;
        const endAngle = (cumulative + percent) * 360;
        cumulative += percent;
        const largeArc = percent > 0.5 ? 1 : 0;
        const radius = 100;
        const x1 = Math.cos((startAngle - 90) * Math.PI / 180) * radius;
        const y1 = Math.sin((startAngle - 90) * Math.PI / 180) * radius;
        const x2 = Math.cos((endAngle - 90) * Math.PI / 180) * radius;
        const y2 = Math.sin((endAngle - 90) * Math.PI / 180) * radius;
        if (percent === 1) {
            return (
                <circle key={seg.label} cx="0" cy="0" r={radius} fill="none" stroke={seg.color} strokeWidth="40" />
            );
        }
        const d = `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`;
        return (
            <path key={seg.label} d={d} fill="none" stroke={seg.color} strokeWidth="40" className="transition-all duration-300 hover:stroke-[45] hover:opacity-90 cursor-pointer" />
        );
    });

    return (
        <div className="flex flex-col md:flex-row items-center gap-6">
            <div className="relative w-48 h-48">
                <svg viewBox="-120 -120 240 240" className="w-full h-full -rotate-90 origin-center drop-shadow-sm">
                    {arcs}
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-xl font-bold text-slate-900 dark:text-white">{((segments.reduce((a, s) => a + s.value, 0) / totalValue) * 100).toFixed(0)}%</span>
                    <span className="text-sm text-slate-500">Allocated</span>
                </div>
            </div>
            <div className="grid grid-cols-1 gap-2">
                {segments.map(seg => (
                    <div key={seg.label} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: seg.color }}></span>
                            <span className="text-slate-600 dark:text-slate-400">{seg.label}</span>
                        </div>
                        <div className="font-medium text-slate-900 dark:text-white">
                            ${seg.value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                            <span className="text-xs text-slate-400 ml-1">({((seg.value / totalValue) * 100).toFixed(1)}%)</span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

"use client";

import { useEffect, useState } from "react";
import { authFetch } from "@/lib/authFetch";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { Activity, AlertTriangle, CheckCircle, Clock, Database, RefreshCw, XCircle } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface FreshnessItem {
  asset_group: string;
  field_name: string;
  method: string;
  frequency: string;
  last_date: string | null;
  last_fetched: string | null;
  total_points: number;
  active_assets: number;
}

interface QuotaItem {
  date: string;
  calls_ref: number;
  calls_bdh: number;
  calls_total: number;
  limit_daily: number;
  usage_pct: number;
}

interface FetchLog {
  id: number;
  asset_group: string;
  field_name: string;
  date_requested: string;
  status: string;
  assets_requested: number;
  assets_succeeded: number;
  assets_failed: number;
  error_message: string;
  failed_assets: string[];
  api_calls_used: number;
  terminal_used: string;
  started_at: string;
  completed_at: string | null;
}

interface GapItem {
  asset_group: string;
  field_name: string;
  date: string;
  method: string;
  is_recoverable: boolean;
}

function statusColor(status: string) {
  switch (status) {
    case "success": return "text-emerald-400";
    case "partial": return "text-amber-400";
    case "error": return "text-red-400";
    case "skipped": return "text-slate-500";
    default: return "text-slate-400";
  }
}

function statusIcon(status: string) {
  switch (status) {
    case "success": return <CheckCircle className="w-4 h-4 text-emerald-400" />;
    case "partial": return <AlertTriangle className="w-4 h-4 text-amber-400" />;
    case "error": return <XCircle className="w-4 h-4 text-red-400" />;
    default: return <Clock className="w-4 h-4 text-slate-500" />;
  }
}

function freshnessColor(lastDate: string | null): string {
  if (!lastDate) return "text-slate-500";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const last = new Date(lastDate + "T00:00:00");
  const diffDays = Math.floor((today.getTime() - last.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return "text-emerald-400";
  if (diffDays <= 1) return "text-amber-400";
  return "text-red-400";
}

export default function BbgMonitorPage() {
  const [freshness, setFreshness] = useState<FreshnessItem[]>([]);
  const [quotas, setQuotas] = useState<QuotaItem[]>([]);
  const [logs, setLogs] = useState<FetchLog[]>([]);
  const [gaps, setGaps] = useState<GapItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedLog, setExpandedLog] = useState<number | null>(null);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [freshnessRes, quotaRes, logsRes, gapsRes] = await Promise.all([
        authFetch(`${API}/api/bbg/status/`),
        authFetch(`${API}/api/bbg/quota/?days=30`),
        authFetch(`${API}/api/bbg/fetch-logs/?limit=50`),
        authFetch(`${API}/api/bbg/gaps/?max_age_days=14`),
      ]);

      if (freshnessRes.ok) setFreshness(await freshnessRes.json());
      if (quotaRes.ok) setQuotas(await quotaRes.json());
      if (logsRes.ok) {
        const data = await logsRes.json();
        setLogs(data.results || []);
      }
      if (gapsRes.ok) setGaps(await gapsRes.json());
    } catch (e) {
      console.error("Failed to fetch BBG monitor data:", e);
    }
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  // Summary stats
  const todayQuota = quotas.length > 0 ? quotas[0] : null;
  const totalDataPoints = freshness.reduce((sum, f) => sum + f.total_points, 0);
  const recoverableGaps = gaps.filter(g => g.is_recoverable).length;
  const unrecoverableGaps = gaps.filter(g => !g.is_recoverable).length;

  // Chart data (reverse so oldest is first)
  const chartData = [...quotas].reverse().map(q => ({
    date: q.date.slice(5), // "MM-DD"
    ref: q.calls_ref,
    bdh: q.calls_bdh,
    total: q.calls_total,
    limit: q.limit_daily,
  }));

  return (
    <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Bloomberg Monitor</h1>
          <p className="text-sm text-slate-500 mt-1">Data freshness, API usage, and fetch history</p>
        </div>
        <button
          onClick={fetchAll}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5">
          <div className="flex items-center gap-3 mb-2">
            <Activity className="w-5 h-5 text-blue-500" />
            <span className="text-sm font-medium text-slate-500">API Calls Today</span>
          </div>
          <p className="text-2xl font-bold text-slate-900 dark:text-white">
            {todayQuota ? todayQuota.calls_total.toLocaleString() : "—"}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            {todayQuota ? `${todayQuota.usage_pct.toFixed(1)}% of ${todayQuota.limit_daily.toLocaleString()} limit` : "No data"}
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5">
          <div className="flex items-center gap-3 mb-2">
            <Database className="w-5 h-5 text-emerald-500" />
            <span className="text-sm font-medium text-slate-500">Total Data Points</span>
          </div>
          <p className="text-2xl font-bold text-slate-900 dark:text-white">
            {totalDataPoints.toLocaleString()}
          </p>
          <p className="text-xs text-slate-500 mt-1">{freshness.length} field/group combos tracked</p>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5">
          <div className="flex items-center gap-3 mb-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            <span className="text-sm font-medium text-slate-500">Gaps (Recoverable)</span>
          </div>
          <p className="text-2xl font-bold text-slate-900 dark:text-white">{recoverableGaps}</p>
          <p className="text-xs text-slate-500 mt-1">Can be backfilled via bdh</p>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5">
          <div className="flex items-center gap-3 mb-2">
            <XCircle className="w-5 h-5 text-red-500" />
            <span className="text-sm font-medium text-slate-500">Gaps (Lost)</span>
          </div>
          <p className="text-2xl font-bold text-slate-900 dark:text-white">{unrecoverableGaps}</p>
          <p className="text-xs text-slate-500 mt-1">ref fields — data irrecoverable</p>
        </div>
      </div>

      {/* API Usage Chart */}
      {chartData.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">API Usage (Last 30 Days)</h2>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} />
              <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 12 }} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} />
              <Tooltip
                contentStyle={{ background: '#1e293b', border: 'none', borderRadius: '8px', color: '#e2e8f0' }}
              />
              <Bar dataKey="ref" stackId="a" fill="#3b82f6" name="REF calls" />
              <Bar dataKey="bdh" stackId="a" fill="#8b5cf6" name="BDH calls" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Data Freshness Table */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Data Freshness</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800">
                <th className="text-left py-2 px-3 text-slate-500 font-medium">Asset Group</th>
                <th className="text-left py-2 px-3 text-slate-500 font-medium">Field</th>
                <th className="text-left py-2 px-3 text-slate-500 font-medium">Method</th>
                <th className="text-left py-2 px-3 text-slate-500 font-medium">Frequency</th>
                <th className="text-left py-2 px-3 text-slate-500 font-medium">Last Date</th>
                <th className="text-right py-2 px-3 text-slate-500 font-medium">Assets</th>
                <th className="text-right py-2 px-3 text-slate-500 font-medium">Points</th>
              </tr>
            </thead>
            <tbody>
              {freshness.map((f, i) => (
                <tr key={i} className="border-b border-slate-100 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/30">
                  <td className="py-2 px-3 text-slate-900 dark:text-slate-200">{f.asset_group}</td>
                  <td className="py-2 px-3 text-slate-900 dark:text-slate-200">{f.field_name}</td>
                  <td className="py-2 px-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      f.method === 'bdh' ? 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300'
                        : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                    }`}>{f.method}</span>
                  </td>
                  <td className="py-2 px-3 text-slate-500">{f.frequency}</td>
                  <td className={`py-2 px-3 font-medium ${freshnessColor(f.last_date)}`}>
                    {f.last_date || "Never"}
                  </td>
                  <td className="py-2 px-3 text-right text-slate-500">{f.active_assets}</td>
                  <td className="py-2 px-3 text-right text-slate-500">{f.total_points.toLocaleString()}</td>
                </tr>
              ))}
              {freshness.length === 0 && (
                <tr><td colSpan={7} className="py-8 text-center text-slate-500">No field groups configured yet. Add them in Django Admin.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Gaps */}
      {gaps.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
            Data Gaps ({gaps.length})
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800">
                  <th className="text-left py-2 px-3 text-slate-500 font-medium">Asset Group</th>
                  <th className="text-left py-2 px-3 text-slate-500 font-medium">Field</th>
                  <th className="text-left py-2 px-3 text-slate-500 font-medium">Date</th>
                  <th className="text-left py-2 px-3 text-slate-500 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {gaps.slice(0, 50).map((g, i) => (
                  <tr key={i} className="border-b border-slate-100 dark:border-slate-800/50">
                    <td className="py-2 px-3 text-slate-900 dark:text-slate-200">{g.asset_group}</td>
                    <td className="py-2 px-3 text-slate-900 dark:text-slate-200">{g.field_name}</td>
                    <td className="py-2 px-3 text-slate-500">{g.date}</td>
                    <td className="py-2 px-3">
                      {g.is_recoverable ? (
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">
                          Recoverable
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300">
                          Lost
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Fetch Logs */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Recent Fetch Logs</h2>
        <div className="space-y-1">
          {logs.map((log) => (
            <div key={log.id}>
              <button
                onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}
                className="w-full flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/30 transition text-left"
              >
                {statusIcon(log.status)}
                <span className="text-sm text-slate-900 dark:text-slate-200 font-medium w-32 shrink-0">
                  {log.asset_group}
                </span>
                <span className="text-sm text-slate-500 w-40 shrink-0">{log.field_name}</span>
                <span className="text-sm text-slate-500 w-24 shrink-0">{log.date_requested}</span>
                <span className="text-xs text-slate-500">{log.terminal_used}</span>
                <span className="ml-auto text-xs text-slate-500">
                  {log.assets_succeeded}/{log.assets_requested} ok
                </span>
              </button>
              {expandedLog === log.id && (
                <div className="ml-10 mb-2 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 text-xs text-slate-600 dark:text-slate-400 space-y-1">
                  <p>Started: {log.started_at}</p>
                  <p>Completed: {log.completed_at || "—"}</p>
                  <p>API calls: {log.api_calls_used}</p>
                  {log.assets_failed > 0 && (
                    <p className="text-red-500">
                      Failed ({log.assets_failed}): {log.failed_assets.join(", ")}
                    </p>
                  )}
                  {log.error_message && (
                    <p className="text-red-500">Error: {log.error_message}</p>
                  )}
                </div>
              )}
            </div>
          ))}
          {logs.length === 0 && (
            <p className="py-8 text-center text-slate-500">No fetch logs yet. Run the BBG Agent to see activity here.</p>
          )}
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import {
  Users, Activity, LogIn, Eye, Clock, Globe,
  TrendingUp, ChevronRight, RefreshCw,
} from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const ADMIN_EMAIL = "gabriel@igfwm.com";

// ── helpers ──────────────────────────────────────────────────────────────────

function relTime(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "agora mesmo";
  if (mins < 60) return `${mins}m atrás`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h atrás`;
  const days = Math.floor(hrs / 24);
  return `${days}d atrás`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-PT", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function pageLabel(page: string): string {
  const map: Record<string, string> = {
    "/": "Dashboard",
    "/watchlist": "Watchlist",
    "/portfolio": "Portfolio",
    "/igf-tr": "IGF TR",
    "/moats": "Moats",
    "/analysts": "Analysts",
    "/admin": "Admin",
  };
  return map[page] ?? page;
}

function initials(name: string): string {
  return name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

const ACTION_COLORS: Record<string, string> = {
  login: "text-emerald-400 bg-emerald-400/10",
  page_view: "text-blue-400 bg-blue-400/10",
};

// ── types ─────────────────────────────────────────────────────────────────────

interface UserStat {
  id: number;
  username: string;
  email: string;
  full_name: string;
  is_active: boolean;
  date_joined: string | null;
  last_activity: string | null;
  last_action: string | null;
  last_page: string | null;
  login_count: number;
  page_view_count: number;
  page_counts: Record<string, number>;
}

interface ActivityEvent {
  user: string;
  full_name: string;
  action: string;
  page: string;
  timestamp: string;
  ip_address: string | null;
}

interface OverviewData {
  users: UserStat[];
  recent_activity: ActivityEvent[];
}

// ── sub-components ────────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, sub, color }: {
  icon: React.ElementType; label: string; value: string | number;
  sub?: string; color: string;
}) {
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 flex items-start gap-4">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-0.5">{label}</p>
        <p className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums">{value}</p>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ── main page ─────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const { user, authFetch } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserStat | null>(null);

  // Gate: only ADMIN_EMAIL
  useEffect(() => {
    if (user && user.email !== ADMIN_EMAIL) {
      router.replace("/");
    }
  }, [user, router]);

  const fetchData = async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await authFetch(`${API_BASE}/api/admin/overview/`);
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  if (!user || user.email !== ADMIN_EMAIL) return null;

  // ── summary stats ──────────────────────────────────────────────────────────
  const totalUsers = data?.users.length ?? 0;
  const activeUsers = data?.users.filter((u) => {
    if (!u.last_activity) return false;
    return Date.now() - new Date(u.last_activity).getTime() < 7 * 24 * 3_600_000;
  }).length ?? 0;
  const totalLogins = data?.users.reduce((s, u) => s + u.login_count, 0) ?? 0;
  const totalPVs = data?.users.reduce((s, u) => s + u.page_view_count, 0) ?? 0;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Admin Overview</h1>
          <p className="text-sm text-slate-500 mt-0.5">Actividade de utilizadores e métricas do site</p>
        </div>
        <button
          onClick={() => fetchData(true)}
          disabled={refreshing}
          className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
          Atualizar
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="w-8 h-8 rounded-full border-2 border-violet-500 border-t-transparent animate-spin" />
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
            <StatCard icon={Users} label="Total utilizadores" value={totalUsers}
              color="bg-blue-500/10 text-blue-500" />
            <StatCard icon={Activity} label="Activos (7 dias)" value={activeUsers}
              sub={`${totalUsers ? Math.round(activeUsers / totalUsers * 100) : 0}% do total`}
              color="bg-emerald-500/10 text-emerald-500" />
            <StatCard icon={LogIn} label="Logins registados" value={totalLogins}
              color="bg-violet-500/10 text-violet-500" />
            <StatCard icon={Eye} label="Page views" value={totalPVs}
              color="bg-orange-500/10 text-orange-500" />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            {/* User table */}
            <div className="xl:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Utilizadores</h2>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {(data?.users ?? []).map((u) => (
                  <button
                    key={u.id}
                    onClick={() => setSelectedUser(selectedUser?.id === u.id ? null : u)}
                    className="w-full text-left px-6 py-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      {/* Avatar */}
                      <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                        style={{ background: "linear-gradient(135deg,#6366f1,#3b82f6)" }}>
                        {initials(u.full_name || u.username)}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                            {u.full_name || u.username}
                          </span>
                          {!u.is_active && (
                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400">
                              inactivo
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-400 truncate">{u.email}</p>
                      </div>

                      {/* Stats */}
                      <div className="hidden sm:flex items-center gap-6 flex-shrink-0 text-right">
                        <div>
                          <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 tabular-nums">{u.login_count}</p>
                          <p className="text-[10px] text-slate-400">logins</p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 tabular-nums">{u.page_view_count}</p>
                          <p className="text-[10px] text-slate-400">page views</p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">{relTime(u.last_activity)}</p>
                          <p className="text-[10px] text-slate-400">última actividade</p>
                        </div>
                        <ChevronRight className={`w-4 h-4 text-slate-300 transition-transform ${selectedUser?.id === u.id ? "rotate-90" : ""}`} />
                      </div>
                    </div>

                    {/* Expanded detail */}
                    {selectedUser?.id === u.id && (
                      <div className="mt-4 ml-13 grid grid-cols-2 sm:grid-cols-3 gap-3" onClick={(e) => e.stopPropagation()}>
                        <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3">
                          <p className="text-[10px] text-slate-400 mb-1 uppercase tracking-wide">Última página</p>
                          <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                            {u.last_page ? pageLabel(u.last_page) : "—"}
                          </p>
                        </div>
                        <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3">
                          <p className="text-[10px] text-slate-400 mb-1 uppercase tracking-wide">Membro desde</p>
                          <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">{fmtDate(u.date_joined)}</p>
                        </div>
                        <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3 col-span-2 sm:col-span-1">
                          <p className="text-[10px] text-slate-400 mb-2 uppercase tracking-wide">Páginas visitadas</p>
                          <div className="space-y-1">
                            {Object.entries(u.page_counts)
                              .sort(([, a], [, b]) => b - a)
                              .slice(0, 5)
                              .map(([pg, cnt]) => (
                                <div key={pg} className="flex items-center justify-between">
                                  <span className="text-xs text-slate-500">{pageLabel(pg)}</span>
                                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 tabular-nums">{cnt}×</span>
                                </div>
                              ))}
                            {Object.keys(u.page_counts).length === 0 && (
                              <p className="text-xs text-slate-400">Sem dados</p>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </button>
                ))}
                {(data?.users ?? []).length === 0 && (
                  <p className="px-6 py-8 text-sm text-slate-400 text-center">Sem utilizadores registados.</p>
                )}
              </div>
            </div>

            {/* Activity feed */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden flex flex-col">
              <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Actividade Recente</h2>
              </div>
              <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 max-h-[540px]">
                {(data?.recent_activity ?? []).map((ev, i) => (
                  <div key={i} className="px-5 py-3 flex items-start gap-3">
                    <div className={`mt-0.5 flex-shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full ${ACTION_COLORS[ev.action] ?? "text-slate-400 bg-slate-100"}`}>
                      {ev.action === "login" ? <LogIn className="w-3 h-3 inline mr-0.5" /> : <Eye className="w-3 h-3 inline mr-0.5" />}
                      {ev.action === "login" ? "login" : "view"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate">
                        {ev.full_name || ev.user}
                      </p>
                      <p className="text-[11px] text-slate-400 truncate">
                        {ev.action === "page_view" ? pageLabel(ev.page) : "Login"}
                      </p>
                    </div>
                    <div className="flex-shrink-0 text-right">
                      <p className="text-[10px] text-slate-400">{relTime(ev.timestamp)}</p>
                      {ev.ip_address && (
                        <p className="text-[10px] text-slate-300 dark:text-slate-600 flex items-center gap-0.5 justify-end">
                          <Globe className="w-2.5 h-2.5" />{ev.ip_address}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
                {(data?.recent_activity ?? []).length === 0 && (
                  <p className="px-6 py-8 text-sm text-slate-400 text-center">Sem actividade registada.</p>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

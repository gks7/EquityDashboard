"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { LayoutDashboard, List, LineChart, Users, Settings, Sun, Moon, Shield, LogOut, TrendingUp, Activity, Handshake, Database, ArrowLeftRight, ClipboardList, Wallet, Menu, X } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

const ADMIN_EMAIL = "gabriel@igfwm.com";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/watchlist", label: "Watchlist", icon: List },
  { href: "/portfolio", label: "Portfolio", icon: LineChart },
  { href: "/igf-tr", label: "IGF TR", icon: TrendingUp },
  { href: "/moats", label: "Moats", icon: Shield },
  { href: "/crm", label: "CRM", icon: Handshake },
  { href: "/analysts", label: "Analysts", icon: Users },
  { href: "/bbg-monitor", label: "BBG Monitor", icon: Database },
  { href: "/trades", label: "Trades", icon: ArrowLeftRight },
  { href: "/positions", label: "Positions", icon: Wallet },
  { href: "/asset-register", label: "Asset Register", icon: ClipboardList },
];

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export function Sidebar() {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const { user, logout } = useAuth();
  const [pendingCount, setPendingCount] = useState(0);
  const [mobileOpen, setMobileOpen] = useState(false);

  const fetchPendingCount = useCallback(async () => {
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("access") : null;
      if (!token) return;
      const res = await fetch(`${API}/api/bbg/asset-requests/pending_count/`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setPendingCount(data.count || 0);
      }
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    fetchPendingCount();
    const interval = setInterval(fetchPendingCount, 60_000);
    return () => clearInterval(interval);
  }, [fetchPendingCount]);

  useEffect(() => { fetchPendingCount(); }, [pathname, fetchPendingCount]);
  useEffect(() => { setMobileOpen(false); }, [pathname]);
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);

  const getInitials = () => {
    if (!user) return "??";
    if (user.first_name && user.last_name) return `${user.first_name[0]}${user.last_name[0]}`.toUpperCase();
    return user.username.slice(0, 2).toUpperCase();
  };

  const getDisplayName = () => {
    if (!user) return "Loading...";
    if (user.first_name && user.last_name) return `${user.first_name} ${user.last_name[0]}.`;
    return user.username;
  };

  const sidebarContent = (
    <>
      <div className="px-6 py-6 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center font-black text-sm text-white" style={{ background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)' }}>α</div>
          <div>
            <h1 className="text-base font-bold tracking-tight text-slate-900 dark:text-white">Alpha<span className="text-blue-500 dark:text-blue-400">Dash</span></h1>
            <p className="text-[10px] font-medium text-slate-500 tracking-wider uppercase">Family Office</p>
          </div>
        </div>
        <button onClick={() => setMobileOpen(false)} className="md:hidden p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"><X className="w-5 h-5" /></button>
      </div>
      <div className="mx-4 border-t border-slate-200 dark:border-slate-800/80" />
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {navItems.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href;
          return (
            <Link key={href} href={href}
              className={`flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 ${isActive ? "bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400" : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/[0.03]"}`}
              style={isActive ? { borderLeft: '2px solid #3b82f6', paddingLeft: '10px' } : {}}>
              <Icon className={`w-4 h-4 ${isActive ? "text-blue-600 dark:text-blue-400" : ""}`} />
              {label}
              {href === "/asset-register" && pendingCount > 0 && (
                <span className="ml-auto inline-flex items-center justify-center w-5 h-5 text-[10px] font-bold text-white bg-red-500 rounded-full">{pendingCount > 99 ? "99+" : pendingCount}</span>
              )}
            </Link>
          );
        })}
        {user?.email === ADMIN_EMAIL && (() => {
          const isActive = pathname === "/admin";
          return (
            <Link href="/admin"
              className={`flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 ${isActive ? "bg-violet-50 dark:bg-violet-500/10 text-violet-600 dark:text-violet-400" : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/[0.03]"}`}
              style={isActive ? { borderLeft: '2px solid #8b5cf6', paddingLeft: '10px' } : {}}>
              <Activity className={`w-4 h-4 ${isActive ? "text-violet-600 dark:text-violet-400" : ""}`} />Admin
            </Link>
          );
        })()}
      </nav>
      <div className="px-3 py-4 border-t border-slate-200 dark:border-slate-800/60 space-y-1">
        <button onClick={() => setTheme(theme === "dark" ? "light" : "dark")} className="w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium rounded-lg text-slate-600 dark:text-slate-500 hover:text-slate-900 dark:hover:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-all duration-200">
          <div className="flex items-center gap-3">{theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}<span>{theme === "dark" ? "Light Mode" : "Dark Mode"}</span></div>
        </button>
        <Link href="/settings" className="flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg text-slate-600 dark:text-slate-500 hover:text-slate-900 dark:hover:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-all duration-200"><Settings className="w-4 h-4" />Settings</Link>
        <div className="mt-4 flex items-center justify-between px-3 py-2">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ background: 'linear-gradient(135deg, #6366f1, #3b82f6)' }}>{getInitials()}</div>
            <div><p className="text-xs font-semibold text-slate-900 dark:text-slate-300">{getDisplayName()}</p><p className="text-[10px] text-slate-500">Analyst</p></div>
          </div>
          <button onClick={logout} title="Sign out" className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-all"><LogOut className="w-3.5 h-3.5" /></button>
        </div>
      </div>
    </>
  );

  return (
    <>
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 h-14 bg-white/80 dark:bg-[#0a0e1a]/80 backdrop-blur-xl border-b border-slate-200 dark:border-slate-800/60 flex items-center justify-between px-4">
        <button onClick={() => setMobileOpen(true)} className="p-2 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"><Menu className="w-5 h-5" /></button>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md flex items-center justify-center font-black text-[10px] text-white" style={{ background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)' }}>α</div>
          <span className="text-sm font-bold text-slate-900 dark:text-white">Alpha<span className="text-blue-500 dark:text-blue-400">Dash</span></span>
        </div>
        <div className="w-9" />
      </div>
      {mobileOpen && <div className="md:hidden fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />}
      <aside className={`md:hidden fixed inset-y-0 left-0 z-50 w-72 flex flex-col bg-white dark:bg-[#0a0e1a] border-r border-slate-200 dark:border-slate-800/60 transition-transform duration-300 ease-out ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}>
        {sidebarContent}
      </aside>
      <aside className="w-64 h-screen hidden md:flex flex-col fixed left-0 top-0 z-40 bg-white dark:bg-[#0a0e1a] border-r border-slate-200 dark:border-slate-800/60 transition-colors duration-300">
        {sidebarContent}
      </aside>
    </>
  );
}
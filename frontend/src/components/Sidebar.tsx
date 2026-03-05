"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { LayoutDashboard, List, LineChart, Users, Settings, Sun, Moon, Shield } from "lucide-react";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/watchlist", label: "Watchlist", icon: List },
  { href: "/portfolio", label: "Portfolio", icon: LineChart },
  { href: "/moats", label: "Moats", icon: Shield },
  { href: "/analysts", label: "Analysts", icon: Users },
];

export function Sidebar() {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();

  return (
    <aside className="w-64 h-screen hidden md:flex flex-col fixed left-0 top-0 z-40 bg-white dark:bg-[#0a0e1a] border-r border-slate-200 dark:border-slate-800/60 transition-colors duration-300">
      {/* Brand */}
      <div className="px-6 py-6">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center font-black text-sm text-white"
            style={{ background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)' }}
          >
            α
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight text-slate-900 dark:text-white">
              Alpha<span className="text-blue-500 dark:text-blue-400">Dash</span>
            </h1>
            <p className="text-[10px] font-medium text-slate-500 tracking-wider uppercase">Family Office</p>
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="mx-4 border-t border-slate-200 dark:border-slate-800/80" />

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {navItems.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 ${isActive
                ? "bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/[0.03]"
                }`}
              style={isActive ? { borderLeft: '2px solid #3b82f6', paddingLeft: '10px' } : {}}
            >
              <Icon className={`w-4 h-4 ${isActive ? "text-blue-600 dark:text-blue-400" : ""}`} />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Bottom */}
      <div className="px-3 py-4 border-t border-slate-200 dark:border-slate-800/60 space-y-1">

        {/* Theme Toggle */}
        <button
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium rounded-lg text-slate-600 dark:text-slate-500 hover:text-slate-900 dark:hover:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-all duration-200"
        >
          <div className="flex items-center gap-3">
            {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            <span>{theme === "dark" ? "Light Mode" : "Dark Mode"}</span>
          </div>
        </button>

        <Link
          href="/settings"
          className="flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg text-slate-600 dark:text-slate-500 hover:text-slate-900 dark:hover:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-all duration-200"
        >
          <Settings className="w-4 h-4" />
          Settings
        </Link>

        {/* User pill */}
        <div className="mt-4 flex items-center gap-3 px-3 py-2">
          <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white"
            style={{ background: 'linear-gradient(135deg, #6366f1, #3b82f6)' }}
          >
            GS
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-900 dark:text-slate-300">Gabriel S.</p>
            <p className="text-[10px] text-slate-500">Analyst</p>
          </div>
        </div>
      </div>
    </aside>
  );
}

"use client";

import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { Sidebar } from "@/components/Sidebar";
import { useEffect, useRef, useState } from "react";
import { Menu } from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export function AppShell({ children }: { children: React.ReactNode }) {
    const { user, loading, authFetch } = useAuth();
    const pathname = usePathname();
    const router = useRouter();
    const isLoginPage = pathname === "/login";
    const lastTrackedPath = useRef<string | null>(null);
    const [sidebarOpen, setSidebarOpen] = useState(false);

    useEffect(() => {
        if (!loading && !user && !isLoginPage) {
            router.push("/login");
        }
    }, [loading, user, isLoginPage, router]);

    // Close sidebar on navigation
    useEffect(() => {
        setSidebarOpen(false);
    }, [pathname]);

    // Track page views for authenticated users (fire-and-forget)
    useEffect(() => {
        if (!user || isLoginPage || pathname === lastTrackedPath.current) return;
        lastTrackedPath.current = pathname;
        authFetch(`${API_BASE}/api/admin/track/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ page: pathname }),
        }).catch(() => { /* silent — tracking is best-effort */ });
    }, [pathname, user, isLoginPage, authFetch]);

    // Login page — no sidebar, no loading gate
    if (isLoginPage) {
        return <>{children}</>;
    }

    // Loading state
    if (loading) {
        return (
            <div className="flex h-screen items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center font-black text-sm text-white animate-pulse"
                        style={{ background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)' }}>
                        α
                    </div>
                    <p className="text-sm text-slate-500">Loading...</p>
                </div>
            </div>
        );
    }

    // Not authenticated — redirect happening via useEffect
    if (!user) {
        return null;
    }

    // Authenticated — show sidebar + content
    return (
        <div className="flex h-screen overflow-hidden">
            {/* Mobile overlay backdrop */}
            {sidebarOpen && (
                <div
                    className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm md:hidden"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            <Sidebar mobileOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

            <main className="flex-1 md:ml-64 overflow-y-auto">
                {/* Mobile top bar */}
                <div className="sticky top-0 z-30 flex items-center gap-3 px-4 py-3 bg-white/80 dark:bg-[#0a0e1a]/80 backdrop-blur-md border-b border-slate-200/60 dark:border-slate-800/60 md:hidden">
                    <button
                        onClick={() => setSidebarOpen(true)}
                        className="p-2 -ml-1 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    >
                        <Menu className="w-5 h-5" />
                    </button>
                    <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-md flex items-center justify-center font-black text-[10px] text-white"
                            style={{ background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)' }}>
                            α
                        </div>
                        <span className="text-sm font-bold text-slate-900 dark:text-white">
                            Alpha<span className="text-blue-500">Dash</span>
                        </span>
                    </div>
                </div>

                <div className="px-4 py-6 sm:px-6 md:px-8 max-w-7xl mx-auto">
                    {children}
                </div>
            </main>
        </div>
    );
}

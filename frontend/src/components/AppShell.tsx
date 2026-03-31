"use client";

import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { Sidebar } from "@/components/Sidebar";
import { useEffect, useRef } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export function AppShell({ children }: { children: React.ReactNode }) {
    const { user, loading, authFetch } = useAuth();
    const pathname = usePathname();
    const router = useRouter();
    const isLoginPage = pathname === "/login";
    const lastTrackedPath = useRef<string | null>(null);

    useEffect(() => {
        if (!loading && !user && !isLoginPage) {
            router.push("/login");
        }
    }, [loading, user, isLoginPage, router]);

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

    // Authenticated — Sidebar renders its own mobile top bar (h-14) and drawer
    return (
        <div className="flex h-screen overflow-hidden">
            <Sidebar />

            <main className="flex-1 md:ml-64 overflow-y-auto mt-14 md:mt-0">
                <div className="px-4 py-6 sm:px-6 md:px-8 max-w-7xl mx-auto">
                    {children}
                </div>
            </main>
        </div>
    );
}

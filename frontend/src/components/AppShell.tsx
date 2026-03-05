"use client";

import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { Sidebar } from "@/components/Sidebar";
import { useEffect } from "react";

export function AppShell({ children }: { children: React.ReactNode }) {
    const { user, loading } = useAuth();
    const pathname = usePathname();
    const router = useRouter();
    const isLoginPage = pathname === "/login";

    useEffect(() => {
        if (!loading && !user && !isLoginPage) {
            router.push("/login");
        }
    }, [loading, user, isLoginPage, router]);

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
            <Sidebar />
            <main className="flex-1 md:ml-64 overflow-y-auto">
                <div className="p-8 max-w-7xl mx-auto">
                    {children}
                </div>
            </main>
        </div>
    );
}

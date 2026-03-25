"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { useRouter } from "next/navigation";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface User {
    id: number;
    username: string;
    first_name: string;
    last_name: string;
    email: string;
    is_staff: boolean;
}

interface AuthContextType {
    user: User | null;
    loading: boolean;
    login: (username: string, password: string) => Promise<{ ok: boolean; error?: string }>;
    logout: () => void;
    authFetch: (url: string, opts?: RequestInit) => Promise<Response>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error("useAuth must be used within AuthProvider");
    return ctx;
}

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const router = useRouter();

    // Helper: get stored tokens
    const getTokens = () => ({
        access: typeof window !== "undefined" ? localStorage.getItem("access_token") : null,
        refresh: typeof window !== "undefined" ? localStorage.getItem("refresh_token") : null,
    });

    // Helper: store tokens
    const setTokens = (access: string, refresh: string) => {
        localStorage.setItem("access_token", access);
        localStorage.setItem("refresh_token", refresh);
    };

    const clearTokens = () => {
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
    };

    // Refresh the access token
    const refreshAccessToken = useCallback(async (): Promise<string | null> => {
        const { refresh } = getTokens();
        if (!refresh) return null;
        try {
            const res = await fetch(`${API_BASE}/api/token/refresh/`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ refresh }),
            });
            if (!res.ok) return null;
            const data = await res.json();
            localStorage.setItem("access_token", data.access);
            if (data.refresh) localStorage.setItem("refresh_token", data.refresh);
            return data.access;
        } catch {
            return null;
        }
    }, []);

    // Authenticated fetch wrapper
    const authFetch = useCallback(async (url: string, opts: RequestInit = {}): Promise<Response> => {
        let { access } = getTokens();

        const doFetch = (token: string | null) => {
            const headers = new Headers(opts.headers || {});
            if (token) headers.set("Authorization", `Bearer ${token}`);
            return fetch(url, { ...opts, headers });
        };

        let res = await doFetch(access);

        // If 401, try refreshing
        if (res.status === 401) {
            const newAccess = await refreshAccessToken();
            if (newAccess) {
                res = await doFetch(newAccess);
            } else {
                // Refresh failed — log out
                clearTokens();
                setUser(null);
                router.push("/login");
            }
        }
        return res;
    }, [refreshAccessToken, router]);

    // Fetch user info
    const fetchUser = useCallback(async () => {
        const { access } = getTokens();
        if (!access) {
            setLoading(false);
            return;
        }
        try {
            const res = await authFetch(`${API_BASE}/api/auth/me/`);
            if (res.ok) {
                const data = await res.json();
                setUser(data);
            } else {
                clearTokens();
                setUser(null);
            }
        } catch {
            clearTokens();
            setUser(null);
        } finally {
            setLoading(false);
        }
    }, [authFetch]);

    useEffect(() => {
        fetchUser();
    }, [fetchUser]);

    const login = async (username: string, password: string) => {
        try {
            const res = await fetch(`${API_BASE}/api/token/`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username, password }),
            });
            if (!res.ok) {
                return { ok: false, error: "Invalid credentials" };
            }
            const data = await res.json();
            setTokens(data.access, data.refresh);
            // Fetch user profile
            const meRes = await fetch(`${API_BASE}/api/auth/me/`, {
                headers: { Authorization: `Bearer ${data.access}` },
            });
            if (meRes.ok) {
                setUser(await meRes.json());
            }
            return { ok: true };
        } catch {
            return { ok: false, error: "Network error" };
        }
    };

    const logout = () => {
        clearTokens();
        setUser(null);
        router.push("/login");
    };

    return (
        <AuthContext.Provider value={{ user, loading, login, logout, authFetch }}>
            {children}
        </AuthContext.Provider>
    );
}

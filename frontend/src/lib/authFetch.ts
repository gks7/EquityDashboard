/**
 * Authenticated fetch utility.
 * Reads JWT from localStorage and injects Authorization header.
 * Auto-refreshes on 401 and retries once.
 */
const API_BASE = typeof window !== "undefined"
    ? (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000")
    : "http://localhost:8000";

export async function authFetch(url: string, opts: RequestInit = {}): Promise<Response> {
    const doFetch = (token: string | null) => {
        // If opts.headers is already a Headers object, spreading it might lose data or boundaries.
        // It's safer to clone the headers carefully or just inject auth.
        const reqHeaders: Record<string, string> = {};

        // Copy existing headers safely if they exist as a plain object
        if (opts.headers && !(opts.headers instanceof Headers)) {
            Object.assign(reqHeaders, opts.headers);
        } else if (opts.headers instanceof Headers) {
            opts.headers.forEach((val, key) => reqHeaders[key] = val);
        }

        if (token) {
            reqHeaders["Authorization"] = `Bearer ${token}`;
        }

        return fetch(url, { ...opts, headers: reqHeaders });
    };

    let access = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
    let res = await doFetch(access);

    if (res.status === 401 && typeof window !== "undefined") {
        const refresh = localStorage.getItem("refresh_token");
        if (refresh) {
            try {
                const refreshRes = await fetch(`${API_BASE}/api/token/refresh/`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ refresh }),
                });
                if (refreshRes.ok) {
                    const data = await refreshRes.json();
                    localStorage.setItem("access_token", data.access);
                    if (data.refresh) localStorage.setItem("refresh_token", data.refresh);
                    res = await doFetch(data.access);
                } else {
                    // Refresh failed — redirect to login
                    localStorage.removeItem("access_token");
                    localStorage.removeItem("refresh_token");
                    window.location.href = "/login";
                }
            } catch {
                localStorage.removeItem("access_token");
                localStorage.removeItem("refresh_token");
                window.location.href = "/login";
            }
        }
    }

    return res;
}

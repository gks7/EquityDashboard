"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
    AlertTriangle,
    CalendarDays,
    Check,
    ClipboardList,
    Copy,
    Loader2,
    Plus,
    Save,
    Search,
    Trash2,
    Users,
} from "lucide-react";
import { authFetch } from "@/lib/authFetch";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// ── Types ────────────────────────────────────────────────────────────────────

type MeetingStatus = "draft" | "final";
type Stance = "" | "risk_on" | "neutral" | "risk_off";
type DecisionAction = "buy" | "add" | "trim" | "sell" | "hold" | "hedge" | "watch" | "research";
type DecisionStatus = "pending" | "partial" | "executed" | "cancelled";

interface Decision {
    asset: string;
    asset_class: string;
    action: DecisionAction;
    target_weight_pct: number | null;
    limit_price: number | null;
    rationale: string;
    owner: string;
    due_date: string | null;
    status: DecisionStatus;
}

interface ActionItem {
    task: string;
    owner: string;
    due_date: string | null;
    done: boolean;
}

interface Meeting {
    id: number;
    date: string;
    title: string;
    attendees: string;
    status: MeetingStatus;
    stance: Stance;
    macro_view: string;
    portfolio_view: string;
    risks: string;
    notes: string;
    target_allocation: Record<string, number | null> | null;
    author_name: string;
    pending_count: number;
    decisions: Decision[];
    action_items: ActionItem[];
    updated_at: string;
}

type Draft = Omit<Meeting, "id" | "author_name" | "pending_count" | "updated_at"> & { id: number | null };

// ── Constants ────────────────────────────────────────────────────────────────

const ACTIONS: { value: DecisionAction; label: string }[] = [
    { value: "buy", label: "Buy" },
    { value: "add", label: "Add" },
    { value: "trim", label: "Trim" },
    { value: "sell", label: "Sell" },
    { value: "hold", label: "Hold" },
    { value: "hedge", label: "Hedge" },
    { value: "watch", label: "Watch" },
    { value: "research", label: "Research" },
];

const DECISION_STATUSES: { value: DecisionStatus; label: string }[] = [
    { value: "pending", label: "Pending" },
    { value: "partial", label: "Partial" },
    { value: "executed", label: "Executed" },
    { value: "cancelled", label: "Cancelled" },
];

const STANCES: { value: Stance; label: string }[] = [
    { value: "", label: "—" },
    { value: "risk_on", label: "Risk On" },
    { value: "neutral", label: "Neutral" },
    { value: "risk_off", label: "Risk Off" },
];

const SLEEVES: { key: string; label: string }[] = [
    { key: "equities", label: "Equities" },
    { key: "fixed_income", label: "Fixed Income" },
    { key: "cash", label: "Cash" },
    { key: "alternatives", label: "Alternatives" },
];

const ACTION_TONE: Record<DecisionAction, string> = {
    buy: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400",
    add: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400",
    trim: "bg-rose-50 text-rose-700 dark:bg-rose-900/20 dark:text-rose-400",
    sell: "bg-rose-50 text-rose-700 dark:bg-rose-900/20 dark:text-rose-400",
    hold: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
    hedge: "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400",
    watch: "bg-sky-50 text-sky-700 dark:bg-sky-900/20 dark:text-sky-400",
    research: "bg-violet-50 text-violet-700 dark:bg-violet-900/20 dark:text-violet-400",
};

const STATUS_TONE: Record<DecisionStatus, string> = {
    pending: "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400",
    partial: "bg-sky-50 text-sky-700 dark:bg-sky-900/20 dark:text-sky-400",
    executed: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400",
    cancelled: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-500",
};

const STANCE_TONE: Record<Exclude<Stance, "">, string> = {
    risk_on: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400",
    neutral: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
    risk_off: "bg-rose-50 text-rose-700 dark:bg-rose-900/20 dark:text-rose-400",
};

// ── Helpers ──────────────────────────────────────────────────────────────────

const todayISO = () => new Date().toISOString().slice(0, 10);

function fmtDate(iso: string): string {
    if (!iso) return "—";
    return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
        day: "2-digit", month: "short", year: "numeric",
    });
}

function emptyDecision(): Decision {
    return {
        asset: "", asset_class: "", action: "buy", target_weight_pct: null,
        limit_price: null, rationale: "", owner: "", due_date: null, status: "pending",
    };
}

function emptyActionItem(): ActionItem {
    return { task: "", owner: "", due_date: null, done: false };
}

function newDraft(): Draft {
    return {
        id: null, date: todayISO(), title: "", attendees: "", status: "draft", stance: "",
        macro_view: "", portfolio_view: "", risks: "", notes: "",
        target_allocation: null, decisions: [], action_items: [],
    };
}

function toDraft(m: Meeting): Draft {
    return {
        id: m.id, date: m.date, title: m.title, attendees: m.attendees, status: m.status,
        stance: m.stance, macro_view: m.macro_view, portfolio_view: m.portfolio_view,
        risks: m.risks, notes: m.notes,
        target_allocation: m.target_allocation ? { ...m.target_allocation } : null,
        decisions: m.decisions.map(d => ({ ...d })),
        action_items: m.action_items.map(a => ({ ...a })),
    };
}

function numOrNull(raw: string): number | null {
    if (raw.trim() === "") return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
}

// ── Small building blocks ────────────────────────────────────────────────────

const INPUT = "w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40";
const CELL_INPUT = "w-full px-2 py-1.5 text-xs rounded-md border border-transparent hover:border-slate-200 dark:hover:border-slate-700 bg-transparent text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-blue-400 focus:bg-white dark:focus:bg-slate-900";

function Card({ title, icon: Icon, children, right }: {
    title: string;
    icon?: React.ComponentType<{ className?: string }>;
    children: React.ReactNode;
    right?: React.ReactNode;
}) {
    return (
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] shadow-sm">
            <header className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800">
                <h2 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    {Icon && <Icon className="w-3.5 h-3.5" />}
                    {title}
                </h2>
                {right}
            </header>
            <div className="p-4">{children}</div>
        </section>
    );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <label className="block">
            <span className="block mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</span>
            {children}
        </label>
    );
}

function Badge({ label, tone }: { label: string; tone: string }) {
    return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap ${tone}`}>
            {label}
        </span>
    );
}

function NotesField({ label, value, placeholder, onChange }: {
    label: string; value: string; placeholder: string; onChange: (v: string) => void;
}) {
    return (
        <Field label={label}>
            <textarea
                rows={4}
                value={value}
                placeholder={placeholder}
                onChange={e => onChange(e.target.value)}
                className={`${INPUT} resize-y leading-relaxed`}
            />
        </Field>
    );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function CommitteePage() {
    const [meetings, setMeetings] = useState<Meeting[]>([]);
    const [draft, setDraft] = useState<Draft | null>(null);
    const [search, setSearch] = useState("");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [dirty, setDirty] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [savedAt, setSavedAt] = useState<string | null>(null);

    const load = useCallback(async (selectId?: number | null) => {
        try {
            const res = await authFetch(`${API}/api/committee/meetings/`);
            if (!res.ok) throw new Error(`Failed to load meetings (${res.status})`);
            const data: Meeting[] = await res.json();
            setMeetings(data);
            setDraft(prev => {
                const wanted = selectId ?? prev?.id ?? data[0]?.id ?? null;
                const found = data.find(m => m.id === wanted);
                return found ? toDraft(found) : prev?.id === null ? prev : null;
            });
            setError(null);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to load meetings");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const patch = useCallback((changes: Partial<Draft>) => {
        setDraft(d => (d ? { ...d, ...changes } : d));
        setDirty(true);
    }, []);

    const selectMeeting = (m: Meeting) => {
        if (dirty && !confirm("Discard unsaved changes?")) return;
        setDraft(toDraft(m));
        setDirty(false);
        setError(null);
    };

    const startNew = () => {
        if (dirty && !confirm("Discard unsaved changes?")) return;
        setDraft(newDraft());
        setDirty(false);
        setError(null);
    };

    // Decisions the previous meeting left open — the committee usually revisits them.
    const previousOpen = useMemo(() => {
        if (!draft) return [];
        const earlier = meetings.filter(m => m.id !== draft.id && m.date <= draft.date);
        const prev = earlier[0];
        if (!prev) return [];
        return prev.decisions.filter(d => d.status === "pending" || d.status === "partial");
    }, [meetings, draft]);

    const carryOver = () => {
        if (!draft) return;
        const known = new Set(draft.decisions.map(d => `${d.asset}|${d.action}`));
        const fresh = previousOpen
            .filter(d => !known.has(`${d.asset}|${d.action}`))
            .map(d => ({ ...d, status: "pending" as DecisionStatus }));
        if (!fresh.length) return;
        patch({ decisions: [...draft.decisions, ...fresh] });
    };

    const save = async () => {
        if (!draft) return;
        if (!draft.date) { setError("Pick a meeting date before saving."); return; }

        // Half-typed rows are dropped rather than persisted as blanks.
        const decisions = draft.decisions.filter(d => d.asset.trim() !== "");
        const action_items = draft.action_items.filter(a => a.task.trim() !== "");
        const body = {
            ...draft,
            title: draft.title.trim() || `Committee ${fmtDate(draft.date)}`,
            decisions,
            action_items,
        };

        setSaving(true);
        setError(null);
        try {
            const isNew = draft.id === null;
            const res = await authFetch(
                isNew ? `${API}/api/committee/meetings/` : `${API}/api/committee/meetings/${draft.id}/`,
                {
                    method: isNew ? "POST" : "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(body),
                },
            );
            if (!res.ok) throw new Error(`Save failed (${res.status}): ${await res.text()}`);
            const saved: Meeting = await res.json();
            setDirty(false);
            setSavedAt(new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }));
            await load(saved.id);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Save failed");
        } finally {
            setSaving(false);
        }
    };

    const remove = async () => {
        if (!draft?.id) { setDraft(null); setDirty(false); return; }
        if (!confirm("Delete these minutes for good?")) return;
        try {
            const res = await authFetch(`${API}/api/committee/meetings/${draft.id}/`, { method: "DELETE" });
            if (!res.ok && res.status !== 204) throw new Error(`Delete failed (${res.status})`);
            setDraft(null);
            setDirty(false);
            await load(null);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Delete failed");
        }
    };

    const visible = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return meetings;
        return meetings.filter(m =>
            [m.title, m.attendees, m.macro_view, m.portfolio_view, m.risks, m.notes]
                .some(t => t?.toLowerCase().includes(q))
            || m.decisions.some(d => d.asset.toLowerCase().includes(q) || d.rationale.toLowerCase().includes(q))
        );
    }, [meetings, search]);

    const allocationTotal = useMemo(() => {
        if (!draft?.target_allocation) return null;
        const vals = Object.values(draft.target_allocation).filter((v): v is number => typeof v === "number");
        return vals.length ? vals.reduce((s, v) => s + v, 0) : null;
    }, [draft]);

    const openInDraft = draft?.decisions.filter(d => d.status === "pending" || d.status === "partial").length ?? 0;

    // ── Row editors ──────────────────────────────────────────────────────────

    const setDecision = (i: number, changes: Partial<Decision>) => {
        if (!draft) return;
        patch({ decisions: draft.decisions.map((d, j) => (j === i ? { ...d, ...changes } : d)) });
    };

    const setItem = (i: number, changes: Partial<ActionItem>) => {
        if (!draft) return;
        patch({ action_items: draft.action_items.map((a, j) => (j === i ? { ...a, ...changes } : a)) });
    };

    if (loading) {
        return (
            <div className="flex items-center gap-2 py-20 justify-center text-sm text-slate-500">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading committee minutes…
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900 dark:text-white">
                        <ClipboardList className="w-5 h-5 text-blue-500" />
                        Investment Committee
                    </h1>
                    <p className="text-xs text-slate-500 mt-0.5">
                        Weekly minutes: the view, what was decided, and who owes what.
                    </p>
                </div>
                <button
                    onClick={startNew}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors"
                >
                    <Plus className="w-4 h-4" /> New meeting
                </button>
            </div>

            {error && (
                <div className="flex items-start gap-2 px-4 py-3 rounded-lg bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-900/40 text-sm text-rose-700 dark:text-rose-400">
                    <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                    <span className="break-all">{error}</span>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6 items-start">
                {/* ── Meeting list ── */}
                <div className="space-y-3">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                        <input
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Search minutes"
                            className={`${INPUT} pl-9`}
                        />
                    </div>

                    <div className="space-y-2 max-h-[70vh] overflow-y-auto pr-0.5">
                        {draft?.id === null && (
                            <div className="px-3 py-2.5 rounded-lg border-2 border-dashed border-blue-300 dark:border-blue-800 text-xs font-semibold text-blue-600 dark:text-blue-400">
                                Unsaved new meeting
                            </div>
                        )}
                        {visible.map(m => {
                            const active = draft?.id === m.id;
                            return (
                                <button
                                    key={m.id}
                                    onClick={() => selectMeeting(m)}
                                    className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors ${active
                                        ? "border-blue-400 bg-blue-50/60 dark:bg-blue-500/10 dark:border-blue-700"
                                        : "border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] hover:bg-slate-50 dark:hover:bg-slate-800/40"}`}
                                >
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="text-sm font-semibold text-slate-900 dark:text-white">{fmtDate(m.date)}</span>
                                        <Badge
                                            label={m.status === "final" ? "Final" : "Draft"}
                                            tone={m.status === "final"
                                                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400"
                                                : "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400"}
                                        />
                                    </div>
                                    <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-500">
                                        <span>{m.decisions.length} decision{m.decisions.length === 1 ? "" : "s"}</span>
                                        {m.pending_count > 0 && (
                                            <span className="text-amber-600 dark:text-amber-400 font-semibold">
                                                {m.pending_count} open
                                            </span>
                                        )}
                                    </div>
                                </button>
                            );
                        })}
                        {!visible.length && draft?.id !== null && (
                            <p className="px-3 py-6 text-xs text-slate-400 text-center">
                                {meetings.length ? "Nothing matches that search." : "No minutes yet — start with New meeting."}
                            </p>
                        )}
                    </div>
                </div>

                {/* ── Editor ── */}
                {!draft ? (
                    <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-800 p-12 text-center">
                        <ClipboardList className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-700" />
                        <p className="mt-3 text-sm text-slate-500">Pick a meeting on the left, or start a new one.</p>
                    </div>
                ) : (
                    <div className="space-y-5">
                        {/* Sticky save bar */}
                        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] shadow-sm">
                            <div className="flex items-center gap-3 text-xs text-slate-500">
                                {dirty
                                    ? <span className="font-semibold text-amber-600 dark:text-amber-400">Unsaved changes</span>
                                    : savedAt
                                        ? <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400"><Check className="w-3.5 h-3.5" /> Saved {savedAt}</span>
                                        : <span>{openInDraft} open decision{openInDraft === 1 ? "" : "s"}</span>}
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={remove}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors"
                                >
                                    <Trash2 className="w-3.5 h-3.5" /> {draft.id === null ? "Discard" : "Delete"}
                                </button>
                                <button
                                    onClick={save}
                                    disabled={saving}
                                    className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white transition-colors"
                                >
                                    {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                                    Save
                                </button>
                            </div>
                        </div>

                        {/* Header fields */}
                        <Card title="Meeting" icon={CalendarDays}>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                <Field label="Date">
                                    <input type="date" value={draft.date} onChange={e => patch({ date: e.target.value })} className={INPUT} />
                                </Field>
                                <Field label="Title">
                                    <input
                                        value={draft.title}
                                        placeholder={`Committee ${fmtDate(draft.date)}`}
                                        onChange={e => patch({ title: e.target.value })}
                                        className={INPUT}
                                    />
                                </Field>
                                <Field label="Status">
                                    <select value={draft.status} onChange={e => patch({ status: e.target.value as MeetingStatus })} className={INPUT}>
                                        <option value="draft">Draft</option>
                                        <option value="final">Final</option>
                                    </select>
                                </Field>
                                <Field label="Stance">
                                    <select value={draft.stance} onChange={e => patch({ stance: e.target.value as Stance })} className={INPUT}>
                                        {STANCES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                                    </select>
                                </Field>
                                <div className="sm:col-span-2 lg:col-span-4">
                                    <Field label="Attendees">
                                        <div className="relative">
                                            <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                                            <input
                                                value={draft.attendees}
                                                placeholder="Who was in the room"
                                                onChange={e => patch({ attendees: e.target.value })}
                                                className={`${INPUT} pl-9`}
                                            />
                                        </div>
                                    </Field>
                                </div>
                            </div>
                            {draft.stance && (
                                <div className="mt-3">
                                    <Badge
                                        label={STANCES.find(s => s.value === draft.stance)?.label ?? ""}
                                        tone={STANCE_TONE[draft.stance as Exclude<Stance, "">]}
                                    />
                                </div>
                            )}
                        </Card>

                        {/* Decisions */}
                        <Card
                            title="Decisions"
                            icon={ClipboardList}
                            right={
                                <div className="flex items-center gap-2">
                                    {previousOpen.length > 0 && (
                                        <button
                                            onClick={carryOver}
                                            title="Copy the open decisions from the previous meeting"
                                            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold rounded-md text-slate-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                                        >
                                            <Copy className="w-3 h-3" /> Carry over {previousOpen.length}
                                        </button>
                                    )}
                                    <button
                                        onClick={() => patch({ decisions: [...draft.decisions, emptyDecision()] })}
                                        className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold rounded-md text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                                    >
                                        <Plus className="w-3 h-3" /> Add
                                    </button>
                                </div>
                            }
                        >
                            {!draft.decisions.length ? (
                                <p className="py-6 text-center text-xs text-slate-400">
                                    Nothing recorded yet. Add a line for each name the committee touched.
                                </p>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left">
                                        <thead>
                                            <tr className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-100 dark:border-slate-800">
                                                <th className="px-2 py-2 min-w-[140px]">Asset</th>
                                                <th className="px-2 py-2">Action</th>
                                                <th className="px-2 py-2 text-right">Target %</th>
                                                <th className="px-2 py-2 text-right">Limit px</th>
                                                <th className="px-2 py-2">Owner</th>
                                                <th className="px-2 py-2">Due</th>
                                                <th className="px-2 py-2">Status</th>
                                                <th className="px-2 py-2 w-8" />
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                            {draft.decisions.map((d, i) => (
                                                <tr key={i} className="align-top">
                                                    <td className="px-2 py-2">
                                                        <input
                                                            value={d.asset}
                                                            placeholder="NVDA US"
                                                            onChange={e => setDecision(i, { asset: e.target.value })}
                                                            className={`${CELL_INPUT} font-semibold`}
                                                        />
                                                        <input
                                                            value={d.asset_class}
                                                            placeholder="Equity / Credit / FX…"
                                                            onChange={e => setDecision(i, { asset_class: e.target.value })}
                                                            className={`${CELL_INPUT} text-[10px] text-slate-500`}
                                                        />
                                                        <textarea
                                                            rows={1}
                                                            value={d.rationale}
                                                            placeholder="Rationale — why the committee decided this"
                                                            onChange={e => setDecision(i, { rationale: e.target.value })}
                                                            className={`${CELL_INPUT} mt-1 resize-y text-[11px] text-slate-600 dark:text-slate-400`}
                                                        />
                                                    </td>
                                                    <td className="px-2 py-2">
                                                        <select
                                                            value={d.action}
                                                            onChange={e => setDecision(i, { action: e.target.value as DecisionAction })}
                                                            className={`${CELL_INPUT} font-semibold`}
                                                        >
                                                            {ACTIONS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                                                        </select>
                                                        <div className="px-2 pt-1">
                                                            <Badge label={ACTIONS.find(a => a.value === d.action)?.label ?? ""} tone={ACTION_TONE[d.action]} />
                                                        </div>
                                                    </td>
                                                    <td className="px-2 py-2">
                                                        <input
                                                            type="number" step="0.1" inputMode="decimal"
                                                            value={d.target_weight_pct ?? ""}
                                                            onChange={e => setDecision(i, { target_weight_pct: numOrNull(e.target.value) })}
                                                            className={`${CELL_INPUT} text-right tabular-nums`}
                                                        />
                                                    </td>
                                                    <td className="px-2 py-2">
                                                        <input
                                                            type="number" step="0.01" inputMode="decimal"
                                                            value={d.limit_price ?? ""}
                                                            onChange={e => setDecision(i, { limit_price: numOrNull(e.target.value) })}
                                                            className={`${CELL_INPUT} text-right tabular-nums`}
                                                        />
                                                    </td>
                                                    <td className="px-2 py-2">
                                                        <input
                                                            value={d.owner}
                                                            placeholder="Who"
                                                            onChange={e => setDecision(i, { owner: e.target.value })}
                                                            className={CELL_INPUT}
                                                        />
                                                    </td>
                                                    <td className="px-2 py-2">
                                                        <input
                                                            type="date"
                                                            value={d.due_date ?? ""}
                                                            onChange={e => setDecision(i, { due_date: e.target.value || null })}
                                                            className={`${CELL_INPUT} text-[11px]`}
                                                        />
                                                    </td>
                                                    <td className="px-2 py-2">
                                                        <select
                                                            value={d.status}
                                                            onChange={e => setDecision(i, { status: e.target.value as DecisionStatus })}
                                                            className={CELL_INPUT}
                                                        >
                                                            {DECISION_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                                                        </select>
                                                        <div className="px-2 pt-1">
                                                            <Badge label={DECISION_STATUSES.find(s => s.value === d.status)?.label ?? ""} tone={STATUS_TONE[d.status]} />
                                                        </div>
                                                    </td>
                                                    <td className="px-2 py-2">
                                                        <button
                                                            onClick={() => patch({ decisions: draft.decisions.filter((_, j) => j !== i) })}
                                                            title="Remove line"
                                                            className="p-1 rounded text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors"
                                                        >
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </Card>

                        {/* Target allocation */}
                        <Card
                            title="Target allocation"
                            right={allocationTotal !== null && (
                                <span className={`text-[11px] font-semibold tabular-nums ${Math.abs(allocationTotal - 100) < 0.01 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
                                    {allocationTotal.toFixed(1)}%{Math.abs(allocationTotal - 100) < 0.01 ? "" : " — does not add to 100"}
                                </span>
                            )}
                        >
                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                                {SLEEVES.map(s => (
                                    <Field key={s.key} label={s.label}>
                                        <input
                                            type="number" step="0.5" inputMode="decimal"
                                            value={draft.target_allocation?.[s.key] ?? ""}
                                            onChange={e => patch({
                                                target_allocation: {
                                                    ...(draft.target_allocation ?? {}),
                                                    [s.key]: numOrNull(e.target.value),
                                                },
                                            })}
                                            className={`${INPUT} text-right tabular-nums`}
                                        />
                                    </Field>
                                ))}
                            </div>
                        </Card>

                        {/* Narrative */}
                        <Card title="View & risks">
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                <NotesField
                                    label="Macro view"
                                    value={draft.macro_view}
                                    placeholder="Rates, inflation, FX, what the committee expects from here."
                                    onChange={v => patch({ macro_view: v })}
                                />
                                <NotesField
                                    label="Portfolio view"
                                    value={draft.portfolio_view}
                                    placeholder="How the book is positioned and what should change."
                                    onChange={v => patch({ portfolio_view: v })}
                                />
                                <NotesField
                                    label="Risks to monitor"
                                    value={draft.risks}
                                    placeholder="What would make the committee change its mind."
                                    onChange={v => patch({ risks: v })}
                                />
                                <NotesField
                                    label="Free notes"
                                    value={draft.notes}
                                    placeholder="Anything else worth recording from the discussion."
                                    onChange={v => patch({ notes: v })}
                                />
                            </div>
                        </Card>

                        {/* Follow-ups */}
                        <Card
                            title="Follow-ups"
                            right={
                                <button
                                    onClick={() => patch({ action_items: [...draft.action_items, emptyActionItem()] })}
                                    className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold rounded-md text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                                >
                                    <Plus className="w-3 h-3" /> Add
                                </button>
                            }
                        >
                            {!draft.action_items.length ? (
                                <p className="py-6 text-center text-xs text-slate-400">
                                    Tasks that are not portfolio decisions — a study, a call, a document.
                                </p>
                            ) : (
                                <ul className="space-y-2">
                                    {draft.action_items.map((a, i) => (
                                        <li key={i} className="flex flex-wrap items-center gap-2">
                                            <input
                                                type="checkbox"
                                                checked={a.done}
                                                onChange={e => setItem(i, { done: e.target.checked })}
                                                className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500/40"
                                            />
                                            <input
                                                value={a.task}
                                                placeholder="What needs doing"
                                                onChange={e => setItem(i, { task: e.target.value })}
                                                className={`${CELL_INPUT} flex-1 min-w-[180px] text-sm ${a.done ? "line-through text-slate-400" : ""}`}
                                            />
                                            <input
                                                value={a.owner}
                                                placeholder="Owner"
                                                onChange={e => setItem(i, { owner: e.target.value })}
                                                className={`${CELL_INPUT} w-28`}
                                            />
                                            <input
                                                type="date"
                                                value={a.due_date ?? ""}
                                                onChange={e => setItem(i, { due_date: e.target.value || null })}
                                                className={`${CELL_INPUT} w-36 text-[11px]`}
                                            />
                                            <button
                                                onClick={() => patch({ action_items: draft.action_items.filter((_, j) => j !== i) })}
                                                className="p-1 rounded text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </Card>
                    </div>
                )}
            </div>
        </div>
    );
}

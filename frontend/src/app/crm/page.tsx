"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Search,
  Users,
  CalendarDays,
  Filter,
  Flame,
  Sparkles,
  Trash2,
  X,
  UserPlus,
  CalendarPlus,
  ChevronDown,
  RefreshCcw,
} from "lucide-react";
import { authFetch } from "@/lib/authFetch";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// ── Types ────────────────────────────────────────────────────────────────────

type ContactType = "client" | "prospect";
type ProspectStage = "lead" | "qualified" | "proposal" | "closing";
type ProspectTemp = "hot" | "warm" | "new" | "";
type MeetingType = "group" | "one-on-one" | "follow-up";

interface Contact {
  id: number;
  name: string;
  role: string;
  company: string;
  contact_type: ContactType;
  stage: ProspectStage | "";
  temperature: ProspectTemp;
  value: string;
  health: number | null;
  last_meeting: string | null;
  next_meeting: string | null;
}

interface Meeting {
  id: number;
  title: string;
  description: string;
  date: string;
  time: string;
  meeting_type: MeetingType;
  attendees_detail: Contact[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(name: string) {
  return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

const today = new Date().toISOString().slice(0, 10);

function formatDateLabel(iso: string | null): string {
  if (!iso) return "Never";
  if (iso === today) return "Today";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function daysSince(iso: string | null): number {
  if (!iso) return 9999;
  const then = new Date(iso + "T00:00:00").getTime();
  const now = new Date(today + "T00:00:00").getTime();
  return Math.floor((now - then) / 86400000);
}

function isFutureOrToday(iso: string): boolean {
  return iso >= today;
}

const AVATAR_COLORS = [
  { bg: "bg-emerald-100 dark:bg-emerald-900/30", text: "text-emerald-700 dark:text-emerald-400" },
  { bg: "bg-amber-100 dark:bg-amber-900/30", text: "text-amber-700 dark:text-amber-400" },
  { bg: "bg-pink-100 dark:bg-pink-900/30", text: "text-pink-700 dark:text-pink-400" },
  { bg: "bg-teal-100 dark:bg-teal-900/30", text: "text-teal-700 dark:text-teal-400" },
  { bg: "bg-violet-100 dark:bg-violet-900/30", text: "text-violet-700 dark:text-violet-400" },
  { bg: "bg-sky-100 dark:bg-sky-900/30", text: "text-sky-700 dark:text-sky-400" },
  { bg: "bg-blue-100 dark:bg-blue-900/30", text: "text-blue-700 dark:text-blue-400" },
  { bg: "bg-indigo-100 dark:bg-indigo-900/30", text: "text-indigo-700 dark:text-indigo-400" },
  { bg: "bg-rose-100 dark:bg-rose-900/30", text: "text-rose-700 dark:text-rose-400" },
];

function getAvatarColor(id: number) {
  return AVATAR_COLORS[id % AVATAR_COLORS.length];
}

// ── Components ───────────────────────────────────────────────────────────────

function TagBadge({ label, variant }: { label: string; variant: string }) {
  const styles: Record<string, string> = {
    client: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400",
    prospect: "bg-indigo-50 text-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-400",
    hot: "bg-rose-50 text-rose-700 dark:bg-rose-900/20 dark:text-rose-400",
    warm: "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400",
    new: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400",
    closing: "bg-rose-50 text-rose-700 dark:bg-rose-900/20 dark:text-rose-400",
    group: "bg-indigo-50 text-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-400",
    "one-on-one": "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400",
    "follow-up": "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${styles[variant] || styles.client}`}>
      {label}
    </span>
  );
}

function HealthBar({ value }: { value: number }) {
  const color = value >= 75 ? "bg-emerald-500" : value >= 50 ? "bg-amber-500" : "bg-rose-500";
  return (
    <div className="w-14 h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${value}%` }} />
    </div>
  );
}

// ── Add Contact Modal ────────────────────────────────────────────────────────

function AddContactModal({ onClose, onSave }: { onClose: () => void; onSave: (data: Record<string, unknown>) => void }) {
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [company, setCompany] = useState("");
  const [type, setType] = useState<ContactType>("prospect");
  const [stage, setStage] = useState<ProspectStage>("lead");
  const [temp, setTemp] = useState<ProspectTemp>("");
  const [value, setValue] = useState("");
  const [health, setHealth] = useState("80");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim() || !company.trim()) return;
    setSaving(true);
    await onSave({
      name: name.trim(),
      role: role.trim(),
      company: company.trim(),
      contact_type: type,
      stage: type === "prospect" ? stage : "",
      temperature: type === "prospect" ? temp : "",
      value: Number(value) || 0,
      health: type === "client" ? Number(health) || 80 : null,
    });
    setSaving(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xl w-full max-w-lg mx-4 p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Add contact</h2>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"><X className="w-5 h-5" /></button>
        </div>
        <div className="space-y-4">
          <div className="flex gap-3">
            <button onClick={() => setType("client")} className={`flex-1 py-2 text-sm font-medium rounded-lg border transition-colors ${type === "client" ? "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-400" : "border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800"}`}>Client</button>
            <button onClick={() => setType("prospect")} className={`flex-1 py-2 text-sm font-medium rounded-lg border transition-colors ${type === "prospect" ? "bg-indigo-50 dark:bg-indigo-900/20 border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-400" : "border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800"}`}>Prospect</button>
          </div>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Full name" className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 dark:text-white" />
          <div className="grid grid-cols-2 gap-3">
            <input value={role} onChange={e => setRole(e.target.value)} placeholder="Role" className="px-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 dark:text-white" />
            <input value={company} onChange={e => setCompany(e.target.value)} placeholder="Company" className="px-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 dark:text-white" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <input value={value} onChange={e => setValue(e.target.value.replace(/[^\d.]/g, ""))} placeholder={type === "client" ? "MRR ($)" : "Pipeline value ($)"} className="px-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 dark:text-white" />
            {type === "client" && (
              <input value={health} onChange={e => setHealth(e.target.value.replace(/\D/g, ""))} placeholder="Health (0-100)" className="px-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 dark:text-white" />
            )}
            {type === "prospect" && (
              <select value={stage} onChange={e => setStage(e.target.value as ProspectStage)} className="px-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 dark:text-white">
                <option value="lead">Lead</option>
                <option value="qualified">Qualified</option>
                <option value="proposal">Proposal</option>
                <option value="closing">Closing</option>
              </select>
            )}
          </div>
          {type === "prospect" && (
            <div className="flex gap-2">
              {(["", "new", "warm", "hot"] as ProspectTemp[]).map(t => (
                <button key={t} onClick={() => setTemp(t)} className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${temp === t ? "bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-400" : "border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800"}`}>
                  {t || "None"}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">Cancel</button>
          <button onClick={handleSubmit} disabled={!name.trim() || !company.trim() || saving} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-40">
            {saving ? "Adding..." : "Add contact"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Add Meeting Modal ────────────────────────────────────────────────────────

function AddMeetingModal({ contacts, onClose, onSave }: { contacts: Contact[]; onClose: () => void; onSave: (data: Record<string, unknown>) => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(today);
  const [time, setTime] = useState("10:00");
  const [type, setType] = useState<MeetingType>("one-on-one");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [saving, setSaving] = useState(false);

  const toggleAttendee = (id: number) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleSubmit = async () => {
    if (!title.trim() || selectedIds.length === 0) return;
    setSaving(true);
    await onSave({
      title: title.trim(),
      description: description.trim(),
      date,
      time: time + ":00",
      meeting_type: type,
      attendee_ids: selectedIds,
    });
    setSaving(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xl w-full max-w-lg mx-4 p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Schedule meeting</h2>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"><X className="w-5 h-5" /></button>
        </div>
        <div className="space-y-4">
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Meeting title" className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 dark:text-white" />
          <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Description (optional)" className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 dark:text-white" />
          <div className="grid grid-cols-2 gap-3">
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className="px-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 dark:text-white" />
            <input type="time" value={time} onChange={e => setTime(e.target.value)} className="px-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 dark:text-white" />
          </div>
          <div className="flex gap-2">
            {(["one-on-one", "group", "follow-up"] as MeetingType[]).map(t => (
              <button key={t} onClick={() => setType(t)} className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${type === t ? "bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-400" : "border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800"}`}>
                {t}
              </button>
            ))}
          </div>
          <div className="relative">
            <button onClick={() => setShowDropdown(!showDropdown)} className="w-full flex items-center justify-between px-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-500 dark:text-slate-400">
              <span>{selectedIds.length === 0 ? "Select attendees..." : `${selectedIds.length} selected`}</span>
              <ChevronDown className="w-4 h-4" />
            </button>
            {showDropdown && (
              <div className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg">
                {contacts.map(c => (
                  <button key={c.id} onClick={() => toggleAttendee(c.id)} className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors ${selectedIds.includes(c.id) ? "bg-blue-50 dark:bg-blue-900/20" : ""}`}>
                    <div className={`w-2 h-2 rounded-full ${selectedIds.includes(c.id) ? "bg-blue-500" : "bg-slate-300 dark:bg-slate-600"}`} />
                    <span className="font-medium text-slate-900 dark:text-white">{c.name}</span>
                    <span className="text-slate-400 text-xs">{c.company}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {selectedIds.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {selectedIds.map(id => {
                const c = contacts.find(x => x.id === id);
                if (!c) return null;
                return (
                  <span key={id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                    {c.name}
                    <button onClick={() => toggleAttendee(id)} className="text-slate-400 hover:text-slate-600"><X className="w-3 h-3" /></button>
                  </span>
                );
              })}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">Cancel</button>
          <button onClick={handleSubmit} disabled={!title.trim() || selectedIds.length === 0 || saving} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-40">
            {saving ? "Scheduling..." : "Schedule"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

type Tab = "contacts" | "meetings";
type ContactFilter = "all" | "client" | "prospect" | "hot";
type MeetingFilter = "all" | "group" | "one-on-one" | "follow-up";

export default function CRMPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("contacts");
  const [search, setSearch] = useState("");
  const [contactFilter, setContactFilter] = useState<ContactFilter>("all");
  const [meetingFilter, setMeetingFilter] = useState<MeetingFilter>("all");
  const [showAddContact, setShowAddContact] = useState(false);
  const [showAddMeeting, setShowAddMeeting] = useState(false);

  const fetchContacts = useCallback(async () => {
    try {
      const res = await authFetch(`${API}/api/crm/contacts/`);
      if (res.ok) setContacts(await res.json());
    } catch (e) { console.error("Failed to fetch contacts:", e); }
  }, []);

  const fetchMeetings = useCallback(async () => {
    try {
      const res = await authFetch(`${API}/api/crm/meetings/`);
      if (res.ok) setMeetings(await res.json());
    } catch (e) { console.error("Failed to fetch meetings:", e); }
  }, []);

  useEffect(() => {
    Promise.all([fetchContacts(), fetchMeetings()]).finally(() => setLoading(false));
  }, [fetchContacts, fetchMeetings]);

  // ── Filtered data ──

  const filteredContacts = useMemo(() => {
    let list = contacts;
    if (contactFilter === "client") list = list.filter(c => c.contact_type === "client");
    else if (contactFilter === "prospect") list = list.filter(c => c.contact_type === "prospect");
    else if (contactFilter === "hot") list = list.filter(c => c.temperature === "hot");
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(c => c.name.toLowerCase().includes(q) || c.company.toLowerCase().includes(q) || c.role.toLowerCase().includes(q));
    }
    return list;
  }, [contacts, contactFilter, search]);

  const filteredMeetings = useMemo(() => {
    let list = [...meetings].sort((a, b) => {
      const aF = isFutureOrToday(a.date), bF = isFutureOrToday(b.date);
      if (aF && !bF) return -1;
      if (!aF && bF) return 1;
      if (aF && bF) return a.date.localeCompare(b.date) || a.time.localeCompare(b.time);
      return b.date.localeCompare(a.date) || b.time.localeCompare(a.time);
    });
    if (meetingFilter !== "all") list = list.filter(m => m.meeting_type === meetingFilter);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(m =>
        m.title.toLowerCase().includes(q) ||
        m.description.toLowerCase().includes(q) ||
        m.attendees_detail?.some(a => a.name.toLowerCase().includes(q))
      );
    }
    return list;
  }, [meetings, meetingFilter, search]);

  // ── CRUD ──

  const handleAddContact = async (data: Record<string, unknown>) => {
    try {
      const res = await authFetch(`${API}/api/crm/contacts/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (res.ok) await fetchContacts();
      else alert("Failed to add contact");
    } catch (e) { console.error(e); }
  };

  const handleDeleteContact = async (id: number) => {
    if (!confirm("Remove this contact?")) return;
    try {
      const res = await authFetch(`${API}/api/crm/contacts/${id}/`, { method: "DELETE" });
      if (res.ok) setContacts(prev => prev.filter(c => c.id !== id));
    } catch (e) { console.error(e); }
  };

  const handleAddMeeting = async (data: Record<string, unknown>) => {
    try {
      const res = await authFetch(`${API}/api/crm/meetings/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        await fetchMeetings();
        await fetchContacts();
      } else alert("Failed to schedule meeting");
    } catch (e) { console.error(e); }
  };

  const handleDeleteMeeting = async (id: number) => {
    if (!confirm("Delete this meeting?")) return;
    try {
      const res = await authFetch(`${API}/api/crm/meetings/${id}/`, { method: "DELETE" });
      if (res.ok) {
        setMeetings(prev => prev.filter(m => m.id !== id));
        await fetchContacts();
      }
    } catch (e) { console.error(e); }
  };

  const totalClients = contacts.filter(c => c.contact_type === "client").length;
  const totalProspects = contacts.filter(c => c.contact_type === "prospect").length;
  const upcomingMeetings = meetings.filter(m => isFutureOrToday(m.date)).length;

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">CRM</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {totalClients} clients · {totalProspects} prospects · {upcomingMeetings} upcoming meetings
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowAddMeeting(true)} className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shadow-sm">
            <CalendarPlus className="w-4 h-4" /> Meeting
          </button>
          <button onClick={() => setShowAddContact(true)} className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-sm">
            <UserPlus className="w-4 h-4" /> Contact
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-0 border-b border-slate-200 dark:border-slate-800 mb-5">
        <button onClick={() => { setTab("contacts"); setSearch(""); }} className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${tab === "contacts" ? "border-blue-500 text-blue-600 dark:text-blue-400" : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"}`}>
          <Users className="w-4 h-4" /> Contacts
          <span className="text-[11px] px-1.5 py-0 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">{contacts.length}</span>
        </button>
        <button onClick={() => { setTab("meetings"); setSearch(""); }} className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${tab === "meetings" ? "border-blue-500 text-blue-600 dark:text-blue-400" : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"}`}>
          <CalendarDays className="w-4 h-4" /> Meetings
          <span className="text-[11px] px-1.5 py-0 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">{meetings.length}</span>
        </button>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap mb-4">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={tab === "contacts" ? "Search contacts..." : "Search meetings..."} className="w-full pl-9 pr-4 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:text-white outline-none transition-all" />
        </div>
        {tab === "contacts" && (
          <>
            {(["all", "client", "prospect", "hot"] as ContactFilter[]).map(f => (
              <button key={f} onClick={() => setContactFilter(f)} className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border transition-colors ${contactFilter === f ? "bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-400" : "border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800"}`}>
                {f === "all" && <Filter className="w-3 h-3" />}
                {f === "hot" && <Flame className="w-3 h-3" />}
                {f === "client" && <Users className="w-3 h-3" />}
                {f === "prospect" && <Sparkles className="w-3 h-3" />}
                {f === "all" ? "All" : f === "client" ? "Clients" : f === "prospect" ? "Prospects" : "Hot leads"}
              </button>
            ))}
          </>
        )}
        {tab === "meetings" && (
          <>
            {(["all", "group", "one-on-one", "follow-up"] as MeetingFilter[]).map(f => (
              <button key={f} onClick={() => setMeetingFilter(f)} className={`px-3 py-2 text-xs font-medium rounded-lg border transition-colors ${meetingFilter === f ? "bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-400" : "border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800"}`}>
                {f === "all" ? "All" : f}
              </button>
            ))}
          </>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm p-12 text-center">
          <RefreshCcw className="w-6 h-6 animate-spin mx-auto mb-2 text-slate-400" />
          <p className="text-sm text-slate-500">Loading CRM data...</p>
        </div>
      )}

      {/* ── CONTACTS TABLE ── */}
      {!loading && tab === "contacts" && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 font-medium">
                <tr>
                  <th className="px-5 py-3">Contact</th>
                  <th className="px-5 py-3">Type</th>
                  <th className="px-5 py-3">Stage / status</th>
                  <th className="px-5 py-3 text-right">Value</th>
                  <th className="px-5 py-3">Health</th>
                  <th className="px-5 py-3">Last meeting</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {filteredContacts.map(c => {
                  const ds = daysSince(c.last_meeting);
                  const staleClass = ds > 21 ? "text-rose-600 dark:text-rose-400 font-semibold" : ds > 10 ? "text-amber-600 dark:text-amber-400 font-medium" : "text-slate-500 dark:text-slate-400";
                  const color = getAvatarColor(c.id);
                  return (
                    <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${color.bg} ${color.text}`}>
                            {getInitials(c.name)}
                          </div>
                          <div>
                            <div className="font-semibold text-slate-900 dark:text-white">{c.name}</div>
                            <div className="text-xs text-slate-500 dark:text-slate-400">{c.role} · {c.company}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <TagBadge label={c.contact_type} variant={c.contact_type} />
                          {c.temperature && <TagBadge label={c.temperature} variant={c.temperature} />}
                        </div>
                      </td>
                      <td className="px-5 py-3 text-xs text-slate-500 dark:text-slate-400">
                        {c.contact_type === "client"
                          ? (c.health !== null && c.health < 50 ? <span className="text-rose-600 dark:text-rose-400 font-medium">At risk</span> : "Active")
                          : c.stage ? c.stage.charAt(0).toUpperCase() + c.stage.slice(1) : "—"
                        }
                      </td>
                      <td className="px-5 py-3 text-right font-medium text-slate-900 dark:text-white">
                        <span className={c.contact_type === "prospect" ? "text-indigo-600 dark:text-indigo-400" : ""}>
                          ${Number(c.value).toLocaleString()}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        {c.contact_type === "client" && c.health != null ? <HealthBar value={c.health} /> : <span className="text-xs text-slate-400">—</span>}
                      </td>
                      <td className="px-5 py-3">
                        <div className={`text-xs ${staleClass}`}>
                          {c.last_meeting ? formatDateLabel(c.last_meeting) : "Never"}
                        </div>
                        {!c.last_meeting && c.next_meeting && (
                          <div className="text-[10px] text-slate-400">sched {formatDateLabel(c.next_meeting)}</div>
                        )}
                        {c.last_meeting && c.next_meeting && (
                          <div className="text-[10px] text-slate-400">next {formatDateLabel(c.next_meeting)}</div>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <button onClick={() => handleDeleteContact(c.id)} className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition-all rounded hover:bg-rose-50 dark:hover:bg-rose-900/20" title="Remove contact">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {filteredContacts.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-slate-500 dark:text-slate-400">
                      No contacts found. {contactFilter !== "all" && "Try a different filter."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── MEETINGS TABLE ── */}
      {!loading && tab === "meetings" && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 font-medium">
                <tr>
                  <th className="px-5 py-3 w-24">Date</th>
                  <th className="px-5 py-3">Meeting</th>
                  <th className="px-5 py-3">Attendees</th>
                  <th className="px-5 py-3 w-24">Type</th>
                  <th className="px-5 py-3 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {filteredMeetings.map(m => {
                  const isUpcoming = isFutureOrToday(m.date);
                  const isToday = m.date === today;
                  return (
                    <tr key={m.id} className={`transition-colors group ${isToday ? "bg-indigo-50/50 dark:bg-indigo-900/10" : ""} ${!isUpcoming ? "opacity-55" : ""} hover:bg-slate-50 dark:hover:bg-slate-800/50`}>
                      <td className="px-5 py-3">
                        <div className={`text-xs font-medium ${isToday ? "text-indigo-600 dark:text-indigo-400" : "text-slate-500 dark:text-slate-400"}`}>
                          {isToday ? "Today" : formatDateLabel(m.date)}
                        </div>
                        <div className="text-[11px] text-slate-400">{m.time?.slice(0, 5)}</div>
                      </td>
                      <td className="px-5 py-3">
                        <div className="font-medium text-slate-900 dark:text-white">{m.title}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-xs">{m.description}</div>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center">
                          {(m.attendees_detail || []).slice(0, 4).map((a, i) => {
                            const color = getAvatarColor(a.id);
                            return (
                              <div key={a.id} className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold border-2 border-white dark:border-slate-900 ${color.bg} ${color.text}`} style={{ marginLeft: i > 0 ? "-6px" : "0", zIndex: 10 - i }}>
                                {getInitials(a.name)}
                              </div>
                            );
                          })}
                          {(m.attendees_detail || []).length > 4 && (
                            <span className="ml-1.5 text-[11px] text-slate-400">+{m.attendees_detail.length - 4}</span>
                          )}
                          {(m.attendees_detail || []).length <= 2 && (
                            <span className="ml-2 text-[11px] text-slate-400">{m.attendees_detail?.map(a => a.name.split(" ")[0]).join(", ")}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <TagBadge label={m.meeting_type} variant={m.meeting_type} />
                      </td>
                      <td className="px-5 py-3">
                        <button onClick={() => handleDeleteMeeting(m.id)} className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition-all rounded hover:bg-rose-50 dark:hover:bg-rose-900/20" title="Delete meeting">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {filteredMeetings.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-slate-500 dark:text-slate-400">
                      No meetings found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modals */}
      {showAddContact && <AddContactModal onClose={() => setShowAddContact(false)} onSave={handleAddContact} />}
      {showAddMeeting && <AddMeetingModal contacts={contacts} onClose={() => setShowAddMeeting(false)} onSave={handleAddMeeting} />}
    </div>
  );
}

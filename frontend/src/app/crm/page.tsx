"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Search,
  Plus,
  Users,
  CalendarDays,
  Filter,
  Flame,
  Sparkles,
  Clock,
  ArrowUpDown,
  Trash2,
  X,
  UserPlus,
  CalendarPlus,
  ChevronDown,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

type ContactType = "client" | "prospect";
type ProspectStage = "lead" | "qualified" | "proposal" | "closing";
type ProspectTemp = "hot" | "warm" | "new" | "";
type MeetingType = "group" | "one-on-one" | "follow-up";

interface Contact {
  id: string;
  name: string;
  role: string;
  company: string;
  type: ContactType;
  stage?: ProspectStage;
  temperature?: ProspectTemp;
  value: number;
  health?: number; // 0–100, only for clients
  lastMeeting?: string; // ISO date string
}

interface Meeting {
  id: string;
  title: string;
  description: string;
  date: string; // ISO date string
  time: string;
  type: MeetingType;
  attendeeIds: string[];
}

// ── Seed data ────────────────────────────────────────────────────────────────

const SEED_CONTACTS: Contact[] = [
  { id: "c1", name: "Sarah Mitchell", role: "VP Product", company: "Helix Corp", type: "client", value: 8200, health: 92, lastMeeting: "2026-03-20" },
  { id: "c2", name: "Laura Chen", role: "Dir. Eng", company: "Stratos Inc", type: "client", value: 12000, health: 64, lastMeeting: "2026-03-17" },
  { id: "c3", name: "Karen Wu", role: "Partner", company: "Orbit Ventures", type: "client", value: 9800, health: 88, lastMeeting: "2026-03-18" },
  { id: "c4", name: "Diana Reeves", role: "COO", company: "Apex Solutions", type: "client", value: 6300, health: 90, lastMeeting: "2026-03-20" },
  { id: "c5", name: "Tom Harris", role: "CEO", company: "Prism Digital", type: "client", value: 4500, health: 85, lastMeeting: "2026-03-12" },
  { id: "c6", name: "Alex Petrov", role: "VP Eng", company: "Nimbus Cloud", type: "client", value: 4600, health: 70, lastMeeting: "2026-03-12" },
  { id: "c7", name: "Mike Yoon", role: "CTO", company: "Quantum Labs", type: "client", value: 1800, health: 38, lastMeeting: "2026-02-28" },
  { id: "p1", name: "David Kim", role: "CEO", company: "Evergreen Systems", type: "prospect", stage: "closing", temperature: "hot", value: 30000, lastMeeting: "2026-03-22" },
  { id: "p2", name: "Marco Ruiz", role: "VP Ops", company: "Atlas Logistics", type: "prospect", stage: "proposal", temperature: "hot", value: 18000, lastMeeting: "2026-03-10" },
  { id: "p3", name: "Aisha Okafor", role: "COO", company: "Northstar Robotics", type: "prospect", stage: "qualified", temperature: "hot", value: 22000, lastMeeting: "2026-03-21" },
  { id: "p4", name: "Yuki Tanaka", role: "CTO", company: "Pinnacle AI", type: "prospect", stage: "proposal", temperature: "", value: 25000, lastMeeting: "2026-03-07" },
  { id: "p5", name: "Elena Vogt", role: "CPO", company: "Solstice Energy", type: "prospect", stage: "qualified", temperature: "warm", value: 15000, lastMeeting: "2026-03-27" },
  { id: "p6", name: "Anna Lindqvist", role: "CRO", company: "Coastal Dynamics", type: "prospect", stage: "closing", temperature: "", value: 14000, lastMeeting: "2026-02-05" },
  { id: "p7", name: "Sofia Chen", role: "Head of Ops", company: "Meridian Analytics", type: "prospect", stage: "lead", temperature: "new", value: 8000, lastMeeting: "2026-03-14" },
  { id: "p8", name: "Leo Brunetti", role: "Dir. Marketing", company: "Tidewater Media", type: "prospect", stage: "qualified", temperature: "", value: 7000, lastMeeting: "2026-02-28" },
  { id: "p9", name: "James Park", role: "CTO", company: "Vortex Labs", type: "prospect", stage: "lead", temperature: "warm", value: 5000 },
  { id: "p10", name: "Nina Torres", role: "CEO", company: "Bloom Health", type: "prospect", stage: "lead", temperature: "", value: 12000 },
  { id: "p11", name: "Raj Malhotra", role: "VP Eng", company: "Canopy Finance", type: "prospect", stage: "lead", temperature: "", value: 3000 },
  { id: "p12", name: "Claire Dupont", role: "MD", company: "Redwood Partners", type: "prospect", stage: "proposal", temperature: "", value: 10000, lastMeeting: "2026-02-15" },
];

const SEED_MEETINGS: Meeting[] = [
  { id: "m1", title: "Q2 planning alignment", description: "Roadmap priorities across key accounts", date: "2026-03-20", time: "14:00", type: "group", attendeeIds: ["c1", "c2", "c4"] },
  { id: "m2", title: "Product demo — Northstar Robotics", description: "Demo automation features for Aisha", date: "2026-03-21", time: "10:30", type: "one-on-one", attendeeIds: ["p3"] },
  { id: "m3", title: "Contract review — Evergreen Systems", description: "Final terms before signing", date: "2026-03-22", time: "15:00", type: "one-on-one", attendeeIds: ["p1"] },
  { id: "m4", title: "New feature onboarding v3.2", description: "Enterprise client walkthrough", date: "2026-03-24", time: "11:00", type: "group", attendeeIds: ["c1", "c5", "c6", "c3", "c4"] },
  { id: "m5", title: "Health check — Quantum Labs", description: "Churn risk, review support tickets", date: "2026-03-25", time: "09:00", type: "follow-up", attendeeIds: ["c7"] },
  { id: "m6", title: "Scoping call — Solstice Energy", description: "Technical requirements deep-dive", date: "2026-03-27", time: "14:00", type: "one-on-one", attendeeIds: ["p5"] },
  { id: "m7", title: "Quarterly business review", description: "APAC expansion discussion", date: "2026-03-18", time: "10:00", type: "group", attendeeIds: ["c1", "c3", "c4"] },
  { id: "m8", title: "Renewal discussion — Stratos Inc", description: "Laura flagged pricing concerns", date: "2026-03-17", time: "16:00", type: "one-on-one", attendeeIds: ["c2"] },
  { id: "m9", title: "Intro call — Meridian Analytics", description: "Strong interest in ops platform", date: "2026-03-14", time: "11:00", type: "one-on-one", attendeeIds: ["p7"] },
  { id: "m10", title: "Product feedback roundtable", description: "Feature requests for v3.2", date: "2026-03-12", time: "14:00", type: "group", attendeeIds: ["c5", "c6"] },
  { id: "m11", title: "Proposal walkthrough — Atlas Logistics", description: "Positive reception, sent revised SOW", date: "2026-03-10", time: "13:00", type: "one-on-one", attendeeIds: ["p2"] },
  { id: "m12", title: "Technical deep-dive — Pinnacle AI", description: "API integration requirements", date: "2026-03-07", time: "15:30", type: "one-on-one", attendeeIds: ["p4"] },
  { id: "m13", title: "Escalation call — Quantum Labs", description: "Discussed downgrade vs. remediation plan", date: "2026-02-28", time: "10:00", type: "follow-up", attendeeIds: ["c7"] },
  { id: "m14", title: "Q1 wrap-up & Q2 kickoff", description: "All-hands with enterprise clients", date: "2026-02-20", time: "11:00", type: "group", attendeeIds: ["c1", "c2", "c3", "c4", "c5", "c6"] },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

const LS_CONTACTS = "crm_contacts";
const LS_MEETINGS = "crm_meetings";

function loadState<T>(key: string, seed: T): T {
  if (typeof window === "undefined") return seed;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : seed;
  } catch {
    return seed;
  }
}
function saveState<T>(key: string, data: T) {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, JSON.stringify(data));
}

function getInitials(name: string) {
  return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

const today = new Date().toISOString().slice(0, 10);

function formatDateLabel(iso?: string): string {
  if (!iso) return "Never";
  if (iso === today) return "Today";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function daysSince(iso?: string): number {
  if (!iso) return 9999;
  const then = new Date(iso + "T00:00:00").getTime();
  const now = new Date(today + "T00:00:00").getTime();
  return Math.floor((now - then) / 86400000);
}

function isFutureOrToday(iso: string): boolean {
  return iso >= today;
}

const avatarColors: Record<string, { bg: string; text: string }> = {
  c1: { bg: "bg-emerald-100 dark:bg-emerald-900/30", text: "text-emerald-700 dark:text-emerald-400" },
  c2: { bg: "bg-amber-100 dark:bg-amber-900/30", text: "text-amber-700 dark:text-amber-400" },
  c3: { bg: "bg-pink-100 dark:bg-pink-900/30", text: "text-pink-700 dark:text-pink-400" },
  c4: { bg: "bg-teal-100 dark:bg-teal-900/30", text: "text-teal-700 dark:text-teal-400" },
  c5: { bg: "bg-violet-100 dark:bg-violet-900/30", text: "text-violet-700 dark:text-violet-400" },
  c6: { bg: "bg-sky-100 dark:bg-sky-900/30", text: "text-sky-700 dark:text-sky-400" },
  c7: { bg: "bg-blue-100 dark:bg-blue-900/30", text: "text-blue-700 dark:text-blue-400" },
};
function getAvatarColor(id: string) {
  if (avatarColors[id]) return avatarColors[id];
  return { bg: "bg-indigo-100 dark:bg-indigo-900/30", text: "text-indigo-700 dark:text-indigo-400" };
}

// ── Components ───────────────────────────────────────────────────────────────

function TagBadge({ label, variant }: { label: string; variant: "client" | "prospect" | "hot" | "warm" | "new" | "closing" | "group" | "one-on-one" | "follow-up" }) {
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

function AddContactModal({ onClose, onSave }: { onClose: () => void; onSave: (c: Contact) => void }) {
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [company, setCompany] = useState("");
  const [type, setType] = useState<ContactType>("prospect");
  const [stage, setStage] = useState<ProspectStage>("lead");
  const [temp, setTemp] = useState<ProspectTemp>("");
  const [value, setValue] = useState("");
  const [health, setHealth] = useState("80");

  const handleSubmit = () => {
    if (!name.trim() || !company.trim()) return;
    onSave({
      id: "c_" + Date.now(),
      name: name.trim(),
      role: role.trim(),
      company: company.trim(),
      type,
      stage: type === "prospect" ? stage : undefined,
      temperature: type === "prospect" ? temp : undefined,
      value: Number(value) || 0,
      health: type === "client" ? Number(health) || 80 : undefined,
    });
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
            <input value={value} onChange={e => setValue(e.target.value.replace(/\D/g, ""))} placeholder={type === "client" ? "MRR ($)" : "Pipeline value ($)"} className="px-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 dark:text-white" />
            {type === "client" && (
              <input value={health} onChange={e => setHealth(e.target.value.replace(/\D/g, ""))} placeholder="Health (0–100)" className="px-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 dark:text-white" />
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
          <button onClick={handleSubmit} disabled={!name.trim() || !company.trim()} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-40">Add contact</button>
        </div>
      </div>
    </div>
  );
}

// ── Add Meeting Modal ────────────────────────────────────────────────────────

function AddMeetingModal({ contacts, onClose, onSave }: { contacts: Contact[]; onClose: () => void; onSave: (m: Meeting) => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(today);
  const [time, setTime] = useState("10:00");
  const [type, setType] = useState<MeetingType>("one-on-one");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);

  const toggleAttendee = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleSubmit = () => {
    if (!title.trim() || selectedIds.length === 0) return;
    onSave({
      id: "m_" + Date.now(),
      title: title.trim(),
      description: description.trim(),
      date,
      time,
      type,
      attendeeIds: selectedIds,
    });
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
          {/* Attendee picker */}
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
          <button onClick={handleSubmit} disabled={!title.trim() || selectedIds.length === 0} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-40">Schedule</button>
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
  const [tab, setTab] = useState<Tab>("contacts");
  const [search, setSearch] = useState("");
  const [contactFilter, setContactFilter] = useState<ContactFilter>("all");
  const [meetingFilter, setMeetingFilter] = useState<MeetingFilter>("all");
  const [showAddContact, setShowAddContact] = useState(false);
  const [showAddMeeting, setShowAddMeeting] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setContacts(loadState(LS_CONTACTS, SEED_CONTACTS));
    setMeetings(loadState(LS_MEETINGS, SEED_MEETINGS));
    setLoaded(true);
  }, []);

  useEffect(() => { if (loaded) saveState(LS_CONTACTS, contacts); }, [contacts, loaded]);
  useEffect(() => { if (loaded) saveState(LS_MEETINGS, meetings); }, [meetings, loaded]);

  const contactMap = useMemo(() => Object.fromEntries(contacts.map(c => [c.id, c])), [contacts]);

  // Compute last meeting per contact from meetings data
  const lastMeetingMap = useMemo(() => {
    const map: Record<string, string> = {};
    const pastMeetings = meetings.filter(m => m.date <= today).sort((a, b) => b.date.localeCompare(a.date));
    for (const m of pastMeetings) {
      for (const id of m.attendeeIds) {
        if (!map[id]) map[id] = m.date;
      }
    }
    return map;
  }, [meetings]);

  // Next scheduled meeting per contact
  const nextMeetingMap = useMemo(() => {
    const map: Record<string, string> = {};
    const futureMeetings = meetings.filter(m => m.date > today).sort((a, b) => a.date.localeCompare(b.date));
    for (const m of futureMeetings) {
      for (const id of m.attendeeIds) {
        if (!map[id]) map[id] = m.date;
      }
    }
    return map;
  }, [meetings]);

  const filteredContacts = useMemo(() => {
    let list = contacts;
    if (contactFilter === "client") list = list.filter(c => c.type === "client");
    else if (contactFilter === "prospect") list = list.filter(c => c.type === "prospect");
    else if (contactFilter === "hot") list = list.filter(c => c.temperature === "hot");
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(c => c.name.toLowerCase().includes(q) || c.company.toLowerCase().includes(q) || c.role.toLowerCase().includes(q));
    }
    return list;
  }, [contacts, contactFilter, search]);

  const filteredMeetings = useMemo(() => {
    let list = [...meetings].sort((a, b) => {
      const aFuture = isFutureOrToday(a.date);
      const bFuture = isFutureOrToday(b.date);
      if (aFuture && !bFuture) return -1;
      if (!aFuture && bFuture) return 1;
      if (aFuture && bFuture) return a.date.localeCompare(b.date) || a.time.localeCompare(b.time);
      return b.date.localeCompare(a.date) || b.time.localeCompare(a.time);
    });
    if (meetingFilter !== "all") list = list.filter(m => m.type === meetingFilter);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(m => m.title.toLowerCase().includes(q) || m.description.toLowerCase().includes(q) || m.attendeeIds.some(id => contactMap[id]?.name.toLowerCase().includes(q)));
    }
    return list;
  }, [meetings, meetingFilter, search, contactMap]);

  const handleDeleteContact = (id: string) => {
    if (!confirm("Remove this contact?")) return;
    setContacts(prev => prev.filter(c => c.id !== id));
  };
  const handleDeleteMeeting = (id: string) => {
    if (!confirm("Delete this meeting?")) return;
    setMeetings(prev => prev.filter(m => m.id !== id));
  };

  const totalClients = contacts.filter(c => c.type === "client").length;
  const totalProspects = contacts.filter(c => c.type === "prospect").length;

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">CRM</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {totalClients} clients · {totalProspects} prospects · {meetings.filter(m => isFutureOrToday(m.date)).length} upcoming meetings
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

      {/* ── CONTACTS TABLE ──────────────────────────────────────────────── */}
      {tab === "contacts" && (
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
                  const lastMet = lastMeetingMap[c.id];
                  const nextMet = nextMeetingMap[c.id];
                  const ds = daysSince(lastMet);
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
                          <TagBadge label={c.type} variant={c.type} />
                          {c.temperature && <TagBadge label={c.temperature} variant={c.temperature} />}
                        </div>
                      </td>
                      <td className="px-5 py-3 text-xs text-slate-500 dark:text-slate-400">
                        {c.type === "client"
                          ? (c.health && c.health < 50 ? <span className="text-rose-600 dark:text-rose-400 font-medium">At risk</span> : "Active")
                          : c.stage ? c.stage.charAt(0).toUpperCase() + c.stage.slice(1) : "—"
                        }
                      </td>
                      <td className="px-5 py-3 text-right font-medium text-slate-900 dark:text-white">
                        <span className={c.type === "prospect" ? "text-indigo-600 dark:text-indigo-400" : ""}>
                          ${c.value.toLocaleString()}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        {c.type === "client" && c.health != null ? <HealthBar value={c.health} /> : <span className="text-xs text-slate-400">—</span>}
                      </td>
                      <td className="px-5 py-3">
                        <div className={`text-xs ${staleClass}`}>
                          {lastMet ? formatDateLabel(lastMet) : "Never"}
                        </div>
                        {!lastMet && nextMet && (
                          <div className="text-[10px] text-slate-400">sched {formatDateLabel(nextMet)}</div>
                        )}
                        {lastMet && nextMet && (
                          <div className="text-[10px] text-slate-400">next {formatDateLabel(nextMet)}</div>
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

      {/* ── MEETINGS TABLE ──────────────────────────────────────────────── */}
      {tab === "meetings" && (
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
                        <div className="text-[11px] text-slate-400">{m.time}</div>
                      </td>
                      <td className="px-5 py-3">
                        <div className="font-medium text-slate-900 dark:text-white">{m.title}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-xs">{m.description}</div>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center">
                          {m.attendeeIds.slice(0, 4).map((id, i) => {
                            const c = contactMap[id];
                            if (!c) return null;
                            const color = getAvatarColor(id);
                            return (
                              <div key={id} className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold border-2 border-white dark:border-slate-900 ${color.bg} ${color.text}`} style={{ marginLeft: i > 0 ? "-6px" : "0", zIndex: 10 - i }}>
                                {getInitials(c.name)}
                              </div>
                            );
                          })}
                          {m.attendeeIds.length > 4 && (
                            <span className="ml-1.5 text-[11px] text-slate-400">+{m.attendeeIds.length - 4}</span>
                          )}
                          {m.attendeeIds.length <= 2 && (
                            <span className="ml-2 text-[11px] text-slate-400">{m.attendeeIds.map(id => contactMap[id]?.name.split(" ")[0]).filter(Boolean).join(", ")}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <TagBadge label={m.type} variant={m.type} />
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
      {showAddContact && <AddContactModal onClose={() => setShowAddContact(false)} onSave={c => setContacts(prev => [...prev, c])} />}
      {showAddMeeting && <AddMeetingModal contacts={contacts} onClose={() => setShowAddMeeting(false)} onSave={m => setMeetings(prev => [...prev, m])} />}
    </div>
  );
}

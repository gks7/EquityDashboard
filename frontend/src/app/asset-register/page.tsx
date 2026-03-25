"use client";

import { useEffect, useState, FormEvent, useCallback } from "react";
import { authFetch } from "@/lib/authFetch";
import { useAuth } from "@/context/AuthContext";
import {
  Search, Plus, X, ChevronDown, ChevronRight, Save, Check, Pencil, Trash2,
} from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const ADMIN_EMAIL = "gabriel@igfwm.com";

/* ---------- Types ---------- */
interface RiskProxy {
  id?: number;
  asset: number;
  proxy_type: string;
  ticker_proxy: string;
  weight_or_beta: number;
}

interface Asset {
  id: number;
  code_bbg: string;
  name: string;
  asset_group: string;
  code_id: string;
  is_active: boolean;
  request_bbg_data: boolean;
  is_vintage: boolean;
  obs: string;
  currency: string;
  asset_market: string;
  calendar: string;
  contract_size: number;
  asset_origin: string;
  option_type: string;
  option_style: string;
  option_strike: number | null;
  option_expiration: string | null;
  option_underlying: number | null;
  settle_cdays_out: number;
  settle_bdays_out: number;
  settle_cdays_in: number;
  settle_bdays_in: number;
  quote_cdays_out: number;
  quote_bdays_out: number;
  quote_cdays_in: number;
  quote_bdays_in: number;
  security_type: string;
  investment_strategy: string;
  liquidity: string;
  risk_weight: number;
  asset_class: string;
  country: string;
  risk_currency: string;
  sector: string;
  risk_level: number | null;
  is_discretionary: boolean;
  risk_proxies: RiskProxy[];
}

interface RegistrationRequest {
  id: number;
  ticker_raw: string;
  asset: number | null;
  asset_code_bbg: string | null;
  status: string;
  requested_by_name: string | null;
  completed_by_name: string | null;
  trade_display: string | null;
  notes: string;
  created_at: string;
  completed_at: string | null;
}

/* ---------- Helpers ---------- */
const inputCls = "w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none";
const labelCls = "block text-xs font-medium text-slate-500 mb-1";
const sectionBtnCls = "flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 transition";

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300",
  in_progress: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300",
  completed: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300",
  rejected: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300",
};

/* ---------- Component ---------- */
export default function AssetRegisterPage() {
  const { user } = useAuth();
  const isAdmin = user?.email === ADMIN_EMAIL || user?.is_staff;
  const [tab, setTab] = useState<"assets" | "requests">("assets");

  // Assets tab state
  const [assets, setAssets] = useState<Asset[]>([]);
  const [assetsLoading, setAssetsLoading] = useState(true);
  const [assetQuery, setAssetQuery] = useState("");
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [showAssetForm, setShowAssetForm] = useState(false);
  const [isNewAsset, setIsNewAsset] = useState(false);

  // Requests tab state
  const [requests, setRequests] = useState<RegistrationRequest[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(true);
  const [requestStatusFilter, setRequestStatusFilter] = useState("");

  // Form section collapse
  const [openSections, setOpenSections] = useState({ global: true, control: false, risk: false });
  const toggleSection = (key: keyof typeof openSections) =>
    setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));

  /* ---------- Data fetching ---------- */
  const fetchAssets = useCallback(async () => {
    setAssetsLoading(true);
    try {
      const params = new URLSearchParams();
      if (assetQuery.length >= 2) params.set("q", assetQuery);
      const res = await authFetch(`${API}/api/bbg/assets/?${params}`);
      if (res.ok) setAssets(await res.json());
    } catch (e) { console.error("Failed to fetch assets:", e); }
    setAssetsLoading(false);
  }, [assetQuery]);

  const fetchRequests = useCallback(async () => {
    setRequestsLoading(true);
    try {
      const params = new URLSearchParams();
      if (requestStatusFilter) params.set("status", requestStatusFilter);
      const res = await authFetch(`${API}/api/bbg/asset-requests/?${params}`);
      if (res.ok) setRequests(await res.json());
    } catch (e) { console.error("Failed to fetch requests:", e); }
    setRequestsLoading(false);
  }, [requestStatusFilter]);

  useEffect(() => { fetchAssets(); }, [fetchAssets]);
  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  /* ---------- Asset CRUD ---------- */
  const openNewAssetForm = (prefill?: string) => {
    setSelectedAsset(null);
    setIsNewAsset(true);
    setShowAssetForm(true);
    setOpenSections({ global: true, control: true, risk: false });
    if (prefill) {
      // Will be handled by the form's defaultValues via the prefillCode prop
      setTimeout(() => {
        const el = document.getElementById("form-code-bbg") as HTMLInputElement;
        if (el) el.value = prefill;
      }, 50);
    }
  };

  const openEditAssetForm = (asset: Asset) => {
    setSelectedAsset(asset);
    setIsNewAsset(false);
    setShowAssetForm(true);
    setOpenSections({ global: true, control: false, risk: false });
  };

  const saveAsset = async (e: FormEvent) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const fd = new FormData(form);
    const body: Record<string, unknown> = {};

    // String fields
    for (const key of [
      "code_bbg", "name", "asset_group", "code_id", "obs",
      "asset_origin", "currency", "asset_market", "calendar",
      "option_type", "option_style",
      "security_type", "investment_strategy", "liquidity",
      "asset_class", "country", "risk_currency", "sector",
    ]) {
      body[key] = fd.get(key) || "";
    }

    // Booleans
    body.is_active = fd.get("is_active") === "on";
    body.request_bbg_data = fd.get("request_bbg_data") === "on";
    body.is_vintage = fd.get("is_vintage") === "on";
    body.is_discretionary = fd.get("is_discretionary") === "on";

    // Floats
    for (const key of ["contract_size", "risk_weight"]) {
      body[key] = parseFloat(fd.get(key) as string) || (key === "contract_size" ? 1 : 100);
    }
    body.option_strike = fd.get("option_strike") ? parseFloat(fd.get("option_strike") as string) : null;

    // Ints
    for (const key of [
      "settle_cdays_out", "settle_bdays_out", "settle_cdays_in", "settle_bdays_in",
      "quote_cdays_out", "quote_bdays_out", "quote_cdays_in", "quote_bdays_in",
    ]) {
      body[key] = parseInt(fd.get(key) as string) || 0;
    }
    body.risk_level = fd.get("risk_level") ? parseInt(fd.get("risk_level") as string) : null;

    // Date
    body.option_expiration = fd.get("option_expiration") || null;
    body.option_underlying = fd.get("option_underlying") ? parseInt(fd.get("option_underlying") as string) : null;

    try {
      const url = isNewAsset
        ? `${API}/api/bbg/assets/`
        : `${API}/api/bbg/assets/${selectedAsset!.id}/`;
      const res = await authFetch(url, {
        method: isNewAsset ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setShowAssetForm(false);
        fetchAssets();
        return await res.json();
      }
    } catch (e) {
      console.error("Failed to save asset:", e);
    }
    return null;
  };

  const deleteAsset = async (id: number) => {
    if (!confirm("Delete this asset? This cannot be undone.")) return;
    try {
      await authFetch(`${API}/api/bbg/assets/${id}/`, { method: "DELETE" });
      fetchAssets();
      if (selectedAsset?.id === id) setShowAssetForm(false);
    } catch (e) { console.error("Failed to delete asset:", e); }
  };

  /* ---------- Registration Request actions ---------- */
  const registerFromRequest = (req: RegistrationRequest) => {
    setTab("assets");
    openNewAssetForm(req.ticker_raw);
    // After save, we'll complete the request
    (window as unknown as Record<string, unknown>).__pendingRegistrationRequest = req.id;
  };

  const completeRequest = async (requestId: number, assetId: number) => {
    try {
      const res = await authFetch(`${API}/api/bbg/asset-requests/${requestId}/complete/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ asset_id: assetId }),
      });
      if (res.ok) {
        fetchRequests();
        fetchAssets();
      }
    } catch (e) { console.error("Failed to complete request:", e); }
  };

  // Override saveAsset to also complete pending registration
  const saveAssetAndComplete = async (e: FormEvent) => {
    const saved = await saveAsset(e);
    const pendingReqId = (window as unknown as Record<string, unknown>).__pendingRegistrationRequest as number | undefined;
    if (saved && pendingReqId) {
      await completeRequest(pendingReqId, saved.id);
      delete (window as unknown as Record<string, unknown>).__pendingRegistrationRequest;
    }
  };

  /* ---------- Form value helper ---------- */
  const v = (key: keyof Asset) => (selectedAsset && !isNewAsset ? selectedAsset[key] : undefined);

  const pendingCount = requests.filter(r => r.status === "pending").length;

  /* ---------- Render ---------- */
  return (
    <div className="max-w-[1600px] mx-auto px-6 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Asset Register</h1>
          <p className="text-sm text-slate-500 mt-1">Manage Bloomberg assets and registration requests</p>
        </div>
        {isAdmin && tab === "assets" && (
          <button onClick={() => openNewAssetForm()}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition">
            <Plus className="w-4 h-4" /> New Asset
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-800">
        <button onClick={() => setTab("assets")}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition ${
            tab === "assets"
              ? "border-blue-500 text-blue-600 dark:text-blue-400"
              : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
          }`}>Assets</button>
        <button onClick={() => setTab("requests")}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition flex items-center gap-2 ${
            tab === "requests"
              ? "border-blue-500 text-blue-600 dark:text-blue-400"
              : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
          }`}>
          Registration Requests
          {pendingCount > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">
              {pendingCount}
            </span>
          )}
        </button>
      </div>

      {/* ==================== ASSETS TAB ==================== */}
      {tab === "assets" && !showAssetForm && (
        <>
          {/* Search */}
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
            <input type="text" value={assetQuery} onChange={e => setAssetQuery(e.target.value)}
              placeholder="Search by ticker or name..." className={`${inputCls} pl-9`} />
          </div>

          {/* Assets table */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                    <th className="text-left py-2.5 px-4 text-slate-500 font-medium">Code BBG</th>
                    <th className="text-left py-2.5 px-4 text-slate-500 font-medium">Name</th>
                    <th className="text-left py-2.5 px-4 text-slate-500 font-medium">Group</th>
                    <th className="text-left py-2.5 px-4 text-slate-500 font-medium">Currency</th>
                    <th className="text-left py-2.5 px-4 text-slate-500 font-medium">Market</th>
                    <th className="text-center py-2.5 px-4 text-slate-500 font-medium">Active</th>
                    <th className="text-center py-2.5 px-4 text-slate-500 font-medium">Vintage</th>
                    <th className="text-center py-2.5 px-4 text-slate-500 font-medium">BBG Data</th>
                    {isAdmin && <th className="py-2.5 px-4"></th>}
                  </tr>
                </thead>
                <tbody>
                  {assets.map(a => (
                    <tr key={a.id} className="border-b border-slate-100 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/30 cursor-pointer"
                      onClick={() => isAdmin ? openEditAssetForm(a) : undefined}>
                      <td className="py-2 px-4 font-medium text-slate-900 dark:text-white">{a.code_bbg}</td>
                      <td className="py-2 px-4 text-slate-600 dark:text-slate-300">{a.name}</td>
                      <td className="py-2 px-4 text-slate-500">{a.asset_group}</td>
                      <td className="py-2 px-4 text-slate-500">{a.currency}</td>
                      <td className="py-2 px-4 text-slate-500">{a.asset_market || "—"}</td>
                      <td className="py-2 px-4 text-center">{a.is_active ? <Check className="w-4 h-4 text-emerald-500 mx-auto" /> : "—"}</td>
                      <td className="py-2 px-4 text-center">{a.is_vintage ? <Check className="w-4 h-4 text-blue-500 mx-auto" /> : "—"}</td>
                      <td className="py-2 px-4 text-center">{a.request_bbg_data ? <Check className="w-4 h-4 text-emerald-500 mx-auto" /> : "—"}</td>
                      {isAdmin && (
                        <td className="py-2 px-4">
                          <div className="flex items-center gap-1">
                            <button onClick={e => { e.stopPropagation(); openEditAssetForm(a); }}
                              className="p-1 rounded text-slate-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition">
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={e => { e.stopPropagation(); deleteAsset(a.id); }}
                              className="p-1 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                  {assets.length === 0 && (
                    <tr><td colSpan={9} className="py-8 text-center text-slate-500">
                      {assetsLoading ? "Loading..." : "No assets found."}
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ==================== ASSET FORM ==================== */}
      {tab === "assets" && showAssetForm && (
        <form onSubmit={saveAssetAndComplete} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              {isNewAsset ? "New Asset" : `Edit: ${selectedAsset?.code_bbg}`}
            </h2>
            <button type="button" onClick={() => setShowAssetForm(false)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Section 1: Global.Asset */}
          <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
            <button type="button" onClick={() => toggleSection("global")} className={`${sectionBtnCls} w-full px-4 py-3 bg-slate-50 dark:bg-slate-800/50`}>
              {openSections.global ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              Global.Asset
            </button>
            {openSections.global && (
              <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className={labelCls}>Code BBG *</label>
                  <input id="form-code-bbg" name="code_bbg" type="text" required defaultValue={v("code_bbg") as string ?? ""} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Name</label>
                  <input name="name" type="text" defaultValue={v("name") as string ?? ""} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Asset Group *</label>
                  <input name="asset_group" type="text" required defaultValue={v("asset_group") as string ?? ""} placeholder="Stock, Bond, ETF..." className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Code ID (CNPJ/ISIN)</label>
                  <input name="code_id" type="text" defaultValue={v("code_id") as string ?? ""} className={inputCls} />
                </div>
                <div className="flex items-center gap-6 pt-5">
                  <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                    <input name="is_active" type="checkbox" defaultChecked={v("is_active") as boolean ?? true} className="rounded" /> Active
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                    <input name="request_bbg_data" type="checkbox" defaultChecked={v("request_bbg_data") as boolean ?? true} className="rounded" /> Request BBG Data
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                    <input name="is_vintage" type="checkbox" defaultChecked={v("is_vintage") as boolean ?? false} className="rounded" /> Vintage
                  </label>
                </div>
                <div className="md:col-span-3">
                  <label className={labelCls}>Observations</label>
                  <textarea name="obs" rows={2} defaultValue={v("obs") as string ?? ""} className={`${inputCls} resize-none`} />
                </div>
              </div>
            )}
          </div>

          {/* Section 2: Control.AssetData */}
          <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
            <button type="button" onClick={() => toggleSection("control")} className={`${sectionBtnCls} w-full px-4 py-3 bg-slate-50 dark:bg-slate-800/50`}>
              {openSections.control ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              Control.AssetData
            </button>
            {openSections.control && (
              <div className="p-4 grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className={labelCls}>Asset Origin</label>
                  <input name="asset_origin" type="text" defaultValue={v("asset_origin") as string ?? ""} placeholder="e.g. GLD US" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Currency</label>
                  <input name="currency" type="text" defaultValue={v("currency") as string ?? "USD"} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Asset Market</label>
                  <input name="asset_market" type="text" defaultValue={v("asset_market") as string ?? ""} placeholder="STOCK, BOND, ETF..." className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Calendar</label>
                  <input name="calendar" type="text" defaultValue={v("calendar") as string ?? "US"} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Contract Size</label>
                  <input name="contract_size" type="number" step="any" defaultValue={v("contract_size") as number ?? 1} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Option Type</label>
                  <select name="option_type" defaultValue={v("option_type") as string ?? ""} className={inputCls}>
                    <option value="">None</option>
                    <option value="call">Call</option>
                    <option value="put">Put</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Option Style</label>
                  <select name="option_style" defaultValue={v("option_style") as string ?? ""} className={inputCls}>
                    <option value="">None</option>
                    <option value="american">American</option>
                    <option value="european">European</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Strike</label>
                  <input name="option_strike" type="number" step="any" defaultValue={v("option_strike") as number ?? ""} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Expiration Date</label>
                  <input name="option_expiration" type="date" defaultValue={v("option_expiration") as string ?? ""} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Underlying (Asset ID)</label>
                  <input name="option_underlying" type="number" defaultValue={v("option_underlying") as number ?? ""} className={inputCls} />
                </div>

                {/* Settlement days */}
                <div className="md:col-span-4 mt-2">
                  <p className="text-xs font-semibold text-slate-500 mb-2">Settlement Days</p>
                  <div className="grid grid-cols-4 md:grid-cols-8 gap-3">
                    {[
                      ["settle_cdays_out", "CDays Out", 0], ["settle_bdays_out", "BDays Out", 2],
                      ["settle_cdays_in", "CDays In", 0], ["settle_bdays_in", "BDays In", 2],
                      ["quote_cdays_out", "Q CDays Out", 0], ["quote_bdays_out", "Q BDays Out", 0],
                      ["quote_cdays_in", "Q CDays In", 0], ["quote_bdays_in", "Q BDays In", 0],
                    ].map(([key, label, def]) => (
                      <div key={key as string}>
                        <label className="block text-[10px] text-slate-400 mb-0.5">{label as string}</label>
                        <input name={key as string} type="number" defaultValue={v(key as keyof Asset) as number ?? def} className={inputCls} />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Section 3: PortfolioRisk */}
          <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
            <button type="button" onClick={() => toggleSection("risk")} className={`${sectionBtnCls} w-full px-4 py-3 bg-slate-50 dark:bg-slate-800/50`}>
              {openSections.risk ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              PortfolioRisk
            </button>
            {openSections.risk && (
              <div className="p-4 grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className={labelCls}>Security Type</label>
                  <input name="security_type" type="text" defaultValue={v("security_type") as string ?? ""} placeholder="Common Stock, Corp Bond..." className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Investment Strategy</label>
                  <input name="investment_strategy" type="text" defaultValue={v("investment_strategy") as string ?? ""} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Liquidity</label>
                  <input name="liquidity" type="text" defaultValue={v("liquidity") as string ?? ""} placeholder="0-1 day, 1-7 days..." className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Risk Weight %</label>
                  <input name="risk_weight" type="number" step="any" defaultValue={v("risk_weight") as number ?? 100} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Asset Class</label>
                  <input name="asset_class" type="text" defaultValue={v("asset_class") as string ?? ""} placeholder="Equity, Fixed Income..." className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Country</label>
                  <input name="country" type="text" defaultValue={v("country") as string ?? ""} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Risk Currency</label>
                  <input name="risk_currency" type="text" defaultValue={v("risk_currency") as string ?? ""} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Sector</label>
                  <input name="sector" type="text" defaultValue={v("sector") as string ?? ""} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Risk Level (1-5)</label>
                  <input name="risk_level" type="number" min={1} max={5} defaultValue={v("risk_level") as number ?? ""} className={inputCls} />
                </div>
                <div className="flex items-center pt-5">
                  <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                    <input name="is_discretionary" type="checkbox" defaultChecked={v("is_discretionary") as boolean ?? false} className="rounded" /> Discretionary
                  </label>
                </div>
              </div>
            )}
          </div>

          {/* Save/Cancel */}
          <div className="flex gap-3">
            <button type="submit" className="flex items-center gap-2 px-6 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition">
              <Save className="w-4 h-4" /> {isNewAsset ? "Create Asset" : "Update Asset"}
            </button>
            <button type="button" onClick={() => setShowAssetForm(false)}
              className="px-6 py-2 text-sm font-medium rounded-lg border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition">
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* ==================== REQUESTS TAB ==================== */}
      {tab === "requests" && (
        <>
          {/* Status filter */}
          <div className="flex gap-2">
            {[
              { label: "All", value: "" },
              { label: "Pending", value: "pending" },
              { label: "In Progress", value: "in_progress" },
              { label: "Completed", value: "completed" },
              { label: "Rejected", value: "rejected" },
            ].map(s => (
              <button key={s.value} onClick={() => setRequestStatusFilter(s.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                  requestStatusFilter === s.value
                    ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                    : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                }`}>
                {s.label}
              </button>
            ))}
          </div>

          {/* Requests table */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                    <th className="text-left py-2.5 px-4 text-slate-500 font-medium">Ticker</th>
                    <th className="text-left py-2.5 px-4 text-slate-500 font-medium">Requested By</th>
                    <th className="text-left py-2.5 px-4 text-slate-500 font-medium">Trade</th>
                    <th className="text-left py-2.5 px-4 text-slate-500 font-medium">Status</th>
                    <th className="text-left py-2.5 px-4 text-slate-500 font-medium">Linked Asset</th>
                    <th className="text-left py-2.5 px-4 text-slate-500 font-medium">Completed By</th>
                    <th className="text-left py-2.5 px-4 text-slate-500 font-medium">Date</th>
                    <th className="text-left py-2.5 px-4 text-slate-500 font-medium">Notes</th>
                    {isAdmin && <th className="py-2.5 px-4"></th>}
                  </tr>
                </thead>
                <tbody>
                  {requests.map(r => (
                    <tr key={r.id} className="border-b border-slate-100 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/30">
                      <td className="py-2 px-4 font-medium text-slate-900 dark:text-white">{r.ticker_raw}</td>
                      <td className="py-2 px-4 text-slate-500">{r.requested_by_name || "—"}</td>
                      <td className="py-2 px-4 text-slate-500 text-xs">{r.trade_display || "—"}</td>
                      <td className="py-2 px-4">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[r.status] || ""}`}>
                          {r.status}
                        </span>
                      </td>
                      <td className="py-2 px-4 text-slate-500">{r.asset_code_bbg || "—"}</td>
                      <td className="py-2 px-4 text-slate-500">{r.completed_by_name || "—"}</td>
                      <td className="py-2 px-4 text-slate-400 text-xs">{r.created_at?.slice(0, 10)}</td>
                      <td className="py-2 px-4 text-slate-400 text-xs max-w-[200px] truncate" title={r.notes}>{r.notes || "—"}</td>
                      {isAdmin && (
                        <td className="py-2 px-4">
                          {r.status === "pending" && (
                            <button onClick={() => registerFromRequest(r)}
                              className="px-3 py-1 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition">
                              Register
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                  {requests.length === 0 && (
                    <tr><td colSpan={9} className="py-8 text-center text-slate-500">
                      {requestsLoading ? "Loading..." : "No registration requests."}
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import {
  Building2,
  Save,
  CheckCircle2,
  AlertCircle,
  FileText,
  CreditCard,
  MapPin,
  Phone,
  Mail,
  Globe,
  Receipt,
  Eye,
  RefreshCw,
  Sparkles,
  ShieldCheck,
  Upload,
  Trash2,
  Image as ImageIcon,
} from "lucide-react";
import { appFetch } from "@/lib/api";
import { RouteGuard } from "@/components/auth/RouteGuard";

export default function CompanySettingsPage() {
  const [form, setForm] = useState({
    companyName: "",
    tradeName: "",
    gstin: "",
    pan: "",
    cin: "",
    lutNumber: "",
    addressLine1: "",
    addressLine2: "",
    city: "",
    state: "Kerala",
    stateCode: "32",
    pincode: "",
    country: "India",
    email: "",
    phone: "",
    website: "",
    logoUrl: "",
    bankName: "",
    accountNumber: "",
    ifscCode: "",
    accountHolderName: "",
    branchName: "",
    upiId: "",
    invoicePrefix: "INV-",
    termsConditions:
      "1. Goods once sold will be replaced only if damaged in transit.\n2. This is a computer generated tax invoice.",
    authorizedSignatory: "Authorized Signatory",
    declaration:
      "We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.",
    signatureUrl: "",
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [activeSection, setActiveSection] = useState<"general" | "address" | "bank" | "invoice">("general");

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, field: "logoUrl" | "signatureUrl") => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 4 * 1024 * 1024) {
      alert("File size exceeds 4MB limit. Please upload a smaller image or PDF.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      setForm((prev) => ({ ...prev, [field]: dataUrl }));
    };
    reader.readAsDataURL(file);
  };

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const res = await appFetch("/api/settings/company");
      const data = await res.json();
      if (data.success && data.setting) {
        setForm((prev) => {
          const next = { ...prev };
          for (const [key, value] of Object.entries(data.setting)) {
            (next as any)[key] = value ?? "";
          }
          return next;
        });
      }
    } catch (err: any) {
      setErrorMsg("Failed to load company profile.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSuccessMsg(false);
    setErrorMsg("");

    try {
      const res = await appFetch("/api/settings/company", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (data.success) {
        setSuccessMsg(true);
        setTimeout(() => setSuccessMsg(false), 4000);
      } else {
        setErrorMsg(data.error || "Failed to save settings.");
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Network error while saving.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <RouteGuard requiredPermission="company_invoice.view" moduleName="Company Profile & Invoice Master">
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-[var(--border)]">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-[var(--text-primary)] flex items-center gap-2.5">
            <Building2 className="text-indigo-600 dark:text-indigo-400" size={26} />
            Company Profile &amp; Invoice Master
          </h1>
          <p className="text-xs sm:text-sm text-[var(--text-muted)] mt-1">
            Maintain your company details, GSTIN, registered address, bank account, and invoice rules in one single place. All customer invoices will automatically reflect these details!
          </p>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs sm:text-sm shadow-lg shadow-indigo-600/25 transition-all disabled:opacity-50 cursor-pointer"
        >
          {saving ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />}
          <span>{saving ? "Saving..." : "Save Master Details"}</span>
        </button>
      </div>

      {/* Status Alerts */}
      {successMsg && (
        <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs sm:text-sm flex items-center gap-3 animate-in fade-in">
          <CheckCircle2 size={18} className="shrink-0" />
          <span className="font-bold">
            Company master settings updated successfully! All existing and future order invoices are now updated with these details.
          </span>
        </div>
      )}

      {errorMsg && (
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-xs sm:text-sm flex items-center gap-3 animate-in fade-in">
          <AlertCircle size={18} className="shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Form Settings (7 cols) */}
        <div className="lg:col-span-7 space-y-5">
          {/* Section Navigation Tabs */}
          <div className="flex flex-wrap gap-1.5 p-1 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl">
            {[
              { id: "general", label: "Legal & Brand", icon: Building2 },
              { id: "address", label: "Registered Address", icon: MapPin },
              { id: "bank", label: "Bank & Payments", icon: CreditCard },
              { id: "invoice", label: "Invoice Rules", icon: Receipt },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeSection === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveSection(tab.id as any)}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-bold transition-all outline-none focus:outline-none focus-visible:outline-none focus:ring-0 focus-visible:ring-0 select-none cursor-pointer border ${
                    isActive
                      ? "bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm border-[var(--border)]"
                      : "text-slate-500 hover:text-[var(--text-primary)] border-transparent hover:bg-slate-200/50 dark:hover:bg-[var(--surface-hover)]/40"
                  }`}
                >
                  <Icon size={14} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          <form onSubmit={handleSave} className="glass-panel p-5 sm:p-6 rounded-2xl border border-[var(--border)] space-y-4">
            {/* SECTION 1: LEGAL & BRAND */}
            {activeSection === "general" && (
              <div className="space-y-4 animate-in fade-in duration-200">
                <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 flex items-center gap-2">
                  <ShieldCheck size={16} /> Legal Entity &amp; GST Identification
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-[11px] font-bold text-[var(--text-secondary)] uppercase mb-1">
                      Legal Entity Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={form.companyName}
                      onChange={(e) => setForm({ ...form, companyName: e.target.value })}
                      placeholder="e.g. VOOP ENTERPRISES LLP"
                      className="w-full px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl text-xs text-[var(--text-primary)] font-bold focus:border-[var(--accent)] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-[var(--text-secondary)] uppercase mb-1">
                      Trade / Brand Name
                    </label>
                    <input
                      type="text"
                      value={form.tradeName}
                      onChange={(e) => setForm({ ...form, tradeName: e.target.value })}
                      placeholder="e.g. MONKEYGARAGE"
                      className="w-full px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl text-xs text-[var(--text-primary)] font-bold focus:border-[var(--accent)] focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-[11px] font-bold text-[var(--text-secondary)] uppercase mb-1">
                      15-Digit GSTIN *
                    </label>
                    <input
                      type="text"
                      required
                      value={form.gstin}
                      onChange={(e) => setForm({ ...form, gstin: e.target.value.toUpperCase() })}
                      placeholder="e.g. 32AAAAA0000A1Z5"
                      className="w-full px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl text-xs font-mono font-black text-indigo-600 dark:text-indigo-400 uppercase focus:border-[var(--accent)] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-[var(--text-secondary)] uppercase mb-1">
                      Permanent Account Number (PAN)
                    </label>
                    <input
                      type="text"
                      value={form.pan}
                      onChange={(e) => setForm({ ...form, pan: e.target.value.toUpperCase() })}
                      placeholder="e.g. AAAAA0000A"
                      className="w-full px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl text-xs font-mono font-bold text-[var(--text-primary)] uppercase focus:border-[var(--accent)] focus:outline-none"
                    />
                  </div>
                </div>

                {/* BRAND LOGO SELECTOR (FILE UPLOAD / URL / TEXT) */}
                <div className="p-4 bg-[var(--bg-secondary)]/60 rounded-2xl border border-[var(--border)] space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="block text-[11px] font-bold text-[var(--text-primary)] uppercase">
                        Brand Logo (Invoice Header)
                      </label>
                      <p className="text-[10px] text-slate-500">
                        Upload an image (PNG, JPG, SVG, WebP) or PDF file, or provide an image URL.
                      </p>
                    </div>
                    {form.logoUrl && (
                      <button
                        type="button"
                        onClick={() => setForm({ ...form, logoUrl: "" })}
                        className="text-[11px] text-rose-500 hover:text-rose-400 font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <Trash2 size={12} />
                        <span>Remove Logo</span>
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
                    {/* Upload File Box (7 cols) */}
                    <div className="sm:col-span-7">
                      <label className="flex flex-col items-center justify-center p-3 border-2 border-dashed border-[var(--border)] hover:border-indigo-500 dark:hover:border-indigo-400 rounded-xl cursor-pointer bg-[var(--surface)] transition-all text-center">
                        <Upload size={18} className="text-indigo-600 dark:text-indigo-400 mb-1" />
                        <span className="text-xs font-bold text-[var(--text-primary)]">
                          Click or Drag to Upload Logo
                        </span>
                        <span className="text-[10px] text-slate-500">PNG, JPG, SVG, WebP or PDF (Max 4MB)</span>
                        <input
                          type="file"
                          accept="image/*,application/pdf"
                          onChange={(e) => handleFileUpload(e, "logoUrl")}
                          className="hidden"
                        />
                      </label>
                    </div>

                    {/* Preview / Text Box (5 cols) */}
                    <div className="sm:col-span-5 flex items-center justify-center p-3 bg-[var(--surface)] rounded-xl border border-[var(--border)] min-h-[70px]">
                      {form.logoUrl ? (
                        form.logoUrl?.startsWith("data:application/pdf") ? (
                          <div className="text-center">
                            <FileText size={22} className="text-rose-500 mx-auto mb-0.5" />
                            <span className="text-[10px] font-bold text-[var(--text-secondary)] block">PDF Logo Attached</span>
                          </div>
                        ) : (
                          <img
                            src={form.logoUrl}
                            alt="Logo Preview"
                            className="max-h-12 max-w-full object-contain"
                          />
                        )
                      ) : (
                        <div className="text-center text-slate-400">
                          <span className="text-[11px] font-bold block text-[var(--text-muted)]">
                            {form.tradeName || form.companyName || "VOOP"}
                          </span>
                          <span className="text-[9px] text-slate-400">Text Badge Mode (Default)</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Optional Direct URL Input */}
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                      Or Paste Direct Image / PDF URL
                    </label>
                    <input
                      type="text"
                      value={form.logoUrl?.startsWith("data:") ? "" : (form.logoUrl || "")}
                      onChange={(e) => setForm({ ...form, logoUrl: e.target.value })}
                      placeholder="https://example.com/logo.png"
                      className="w-full px-3 py-1.5 bg-[var(--surface)] border border-[var(--border)] rounded-xl text-xs text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-[11px] font-bold text-[var(--text-secondary)] uppercase mb-1">
                      CIN / Company Reg No (Optional)
                    </label>
                    <input
                      type="text"
                      value={form.cin}
                      onChange={(e) => setForm({ ...form, cin: e.target.value })}
                      placeholder="e.g. U74999KL2024PTC123456"
                      className="w-full px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl text-xs font-mono text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-[var(--text-secondary)] uppercase mb-1">
                      LUT / Export Bond No (Optional)
                    </label>
                    <input
                      type="text"
                      value={form.lutNumber || ""}
                      onChange={(e) => setForm({ ...form, lutNumber: e.target.value })}
                      placeholder="e.g. AD320124000123A"
                      className="w-full px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl text-xs font-mono text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* SECTION 2: REGISTERED & DISPATCH ADDRESS */}
            {activeSection === "address" && (
              <div className="space-y-4 animate-in fade-in duration-200">
                <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 flex items-center gap-2">
                  <MapPin size={16} /> Registered Business &amp; Dispatch Address
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-bold text-[var(--text-secondary)] uppercase mb-1">
                      Address Line 1 *
                    </label>
                    <input
                      type="text"
                      required
                      value={form.addressLine1}
                      onChange={(e) => setForm({ ...form, addressLine1: e.target.value })}
                      placeholder="e.g. Building No. 12/345, Industrial Zone"
                      className="w-full px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl text-xs text-[var(--text-primary)] font-medium focus:border-[var(--accent)] focus:outline-none"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-bold text-[var(--text-secondary)] uppercase mb-1">
                      Address Line 2 (Landmark / Area)
                    </label>
                    <input
                      type="text"
                      value={form.addressLine2}
                      onChange={(e) => setForm({ ...form, addressLine2: e.target.value })}
                      placeholder="e.g. Near Main Hub, Highway Road"
                      className="w-full px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl text-xs text-[var(--text-primary)] font-medium focus:border-[var(--accent)] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-[var(--text-secondary)] uppercase mb-1">
                      City / Town *
                    </label>
                    <input
                      type="text"
                      required
                      value={form.city}
                      onChange={(e) => setForm({ ...form, city: e.target.value })}
                      placeholder="Thrissur"
                      className="w-full px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl text-xs text-[var(--text-primary)] font-bold focus:border-[var(--accent)] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-[var(--text-secondary)] uppercase mb-1">
                      Postal PIN Code *
                    </label>
                    <input
                      type="text"
                      required
                      value={form.pincode}
                      onChange={(e) => setForm({ ...form, pincode: e.target.value })}
                      placeholder="680519"
                      className="w-full px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl text-xs font-mono font-bold text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-[var(--text-secondary)] uppercase mb-1">
                      State *
                    </label>
                    <input
                      type="text"
                      required
                      value={form.state}
                      onChange={(e) => setForm({ ...form, state: e.target.value })}
                      placeholder="Kerala"
                      className="w-full px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl text-xs font-bold text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-[var(--text-secondary)] uppercase mb-1">
                      GST State Code *
                    </label>
                    <input
                      type="text"
                      required
                      value={form.stateCode}
                      onChange={(e) => setForm({ ...form, stateCode: e.target.value })}
                      placeholder="32"
                      className="w-full px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl text-xs font-mono font-black text-cyan-600 dark:text-cyan-400 focus:border-[var(--accent)] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-[var(--text-secondary)] uppercase mb-1">
                      Support Email
                    </label>
                    <input
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      placeholder="support@monkeygarage.in"
                      className="w-full px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl text-xs text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-[var(--text-secondary)] uppercase mb-1">
                      Support Phone
                    </label>
                    <input
                      type="text"
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                      placeholder="+91 98765 43210"
                      className="w-full px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl text-xs text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* SECTION 3: BANK DETAILS */}
            {activeSection === "bank" && (
              <div className="space-y-4 animate-in fade-in duration-200">
                <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 flex items-center gap-2">
                  <CreditCard size={16} /> Bank Account for Invoice Payment Footers
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-[11px] font-bold text-[var(--text-secondary)] uppercase mb-1">
                      Bank Name
                    </label>
                    <input
                      type="text"
                      value={form.bankName}
                      onChange={(e) => setForm({ ...form, bankName: e.target.value })}
                      placeholder="e.g. HDFC Bank"
                      className="w-full px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl text-xs text-[var(--text-primary)] font-bold focus:border-[var(--accent)] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-[var(--text-secondary)] uppercase mb-1">
                      Account Holder Name
                    </label>
                    <input
                      type="text"
                      value={form.accountHolderName}
                      onChange={(e) => setForm({ ...form, accountHolderName: e.target.value })}
                      placeholder="e.g. VOOP ENTERPRISES"
                      className="w-full px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl text-xs text-[var(--text-primary)] font-bold focus:border-[var(--accent)] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-[var(--text-secondary)] uppercase mb-1">
                      Bank Account Number
                    </label>
                    <input
                      type="text"
                      value={form.accountNumber}
                      onChange={(e) => setForm({ ...form, accountNumber: e.target.value })}
                      placeholder="e.g. 50200012345678"
                      className="w-full px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl text-xs font-mono font-bold text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-[var(--text-secondary)] uppercase mb-1">
                      IFSC Code
                    </label>
                    <input
                      type="text"
                      value={form.ifscCode}
                      onChange={(e) => setForm({ ...form, ifscCode: e.target.value.toUpperCase() })}
                      placeholder="e.g. HDFC0001234"
                      className="w-full px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl text-xs font-mono font-bold uppercase text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-[var(--text-secondary)] uppercase mb-1">
                      Branch Name
                    </label>
                    <input
                      type="text"
                      value={form.branchName}
                      onChange={(e) => setForm({ ...form, branchName: e.target.value })}
                      placeholder="e.g. Thrissur Main Branch"
                      className="w-full px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl text-xs text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-[var(--text-secondary)] uppercase mb-1">
                      UPI ID (QR / Payment)
                    </label>
                    <input
                      type="text"
                      value={form.upiId}
                      onChange={(e) => setForm({ ...form, upiId: e.target.value })}
                      placeholder="e.g. voop@hdfcbank"
                      className="w-full px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl text-xs font-mono text-cyan-600 dark:text-cyan-400 focus:border-[var(--accent)] focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* SECTION 4: INVOICE RULES */}
            {activeSection === "invoice" && (
              <div className="space-y-4 animate-in fade-in duration-200">
                <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 flex items-center gap-2">
                  <Receipt size={16} /> Tax Invoice Formatting &amp; Legal Terms
                </h3>

                <div className="space-y-3">
                  <div>
                    <label className="block text-[11px] font-bold text-[var(--text-secondary)] uppercase mb-1.5">
                      Invoice Numbering Scheme
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setForm({ ...form, invoicePrefix: "" })}
                        className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs font-bold transition-all text-left outline-none focus:outline-none cursor-pointer ${
                          !form.invoicePrefix || form.invoicePrefix === "SHOPIFY_ORDER"
                            ? "bg-indigo-500/15 border-indigo-500/40 text-indigo-600 dark:text-indigo-400 shadow-sm"
                            : "bg-[var(--bg-secondary)] border-[var(--border)] text-[var(--text-secondary)] hover:border-slate-400"
                        }`}
                      >
                        <span className="w-2 h-2 rounded-full bg-indigo-500 shrink-0"></span>
                        <div>
                          <p className="font-bold">Use Shopify Order ID / #</p>
                          <p className="text-[10px] text-slate-500 font-normal">e.g. #2026-18996 (Exact Shopify Number)</p>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setForm({ ...form, invoicePrefix: form.invoicePrefix || "INV-" })}
                        className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs font-bold transition-all text-left outline-none focus:outline-none cursor-pointer ${
                          form.invoicePrefix && form.invoicePrefix !== "SHOPIFY_ORDER"
                            ? "bg-indigo-500/15 border-indigo-500/40 text-indigo-600 dark:text-indigo-400 shadow-sm"
                            : "bg-[var(--bg-secondary)] border-[var(--border)] text-[var(--text-secondary)] hover:border-slate-400"
                        }`}
                      >
                        <span className="w-2 h-2 rounded-full bg-cyan-500 shrink-0"></span>
                        <div>
                          <p className="font-bold">Custom Prefix + Order #</p>
                          <p className="text-[10px] text-slate-500 font-normal">e.g. INV-2026-18996</p>
                        </div>
                      </button>
                    </div>
                  </div>

                  {form.invoicePrefix && form.invoicePrefix !== "SHOPIFY_ORDER" && (
                    <div className="animate-in fade-in">
                      <label className="block text-[11px] font-bold text-[var(--text-secondary)] uppercase mb-1">
                        Custom Invoice Prefix
                      </label>
                      <input
                        type="text"
                        value={form.invoicePrefix}
                        onChange={(e) => setForm({ ...form, invoicePrefix: e.target.value })}
                        placeholder="e.g. INV- or VG-"
                        className="w-full px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl text-xs font-mono font-bold text-indigo-600 dark:text-indigo-400 focus:border-[var(--accent)] focus:outline-none"
                      />
                    </div>
                  )}

                  {/* DIGITAL SIGNATURE / STAMP UPLOADER */}
                  <div className="p-4 bg-[var(--bg-secondary)]/60 rounded-2xl border border-[var(--border)] space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <label className="block text-[11px] font-bold text-[var(--text-primary)] uppercase">
                          Authorized Signature / Stamp
                        </label>
                        <p className="text-[10px] text-slate-500">
                          Upload digital signature or official seal/stamp (Image or PDF) to appear on invoice footers.
                        </p>
                      </div>
                      {form.signatureUrl && (
                        <button
                          type="button"
                          onClick={() => setForm({ ...form, signatureUrl: "" })}
                          className="text-[11px] text-rose-500 hover:text-rose-400 font-bold flex items-center gap-1 cursor-pointer"
                        >
                          <Trash2 size={12} />
                          <span>Remove Signature</span>
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
                      {/* Upload File Box (7 cols) */}
                      <div className="sm:col-span-7">
                        <label className="flex flex-col items-center justify-center p-3 border-2 border-dashed border-[var(--border)] hover:border-indigo-500 dark:hover:border-indigo-400 rounded-xl cursor-pointer bg-[var(--surface)] transition-all text-center">
                          <Upload size={18} className="text-indigo-600 dark:text-indigo-400 mb-1" />
                          <span className="text-xs font-bold text-[var(--text-primary)]">
                            Click or Drag to Upload Signature / Stamp
                          </span>
                          <span className="text-[10px] text-slate-500">PNG, JPG, SVG, WebP or PDF (Max 4MB)</span>
                          <input
                            type="file"
                            accept="image/*,application/pdf"
                            onChange={(e) => handleFileUpload(e, "signatureUrl")}
                            className="hidden"
                          />
                        </label>
                      </div>

                      {/* Preview / Text Box (5 cols) */}
                      <div className="sm:col-span-5 flex items-center justify-center p-3 bg-[var(--surface)] rounded-xl border border-[var(--border)] min-h-[70px]">
                        {form.signatureUrl ? (
                          form.signatureUrl?.startsWith("data:application/pdf") ? (
                            <div className="text-center">
                              <FileText size={22} className="text-rose-500 mx-auto mb-0.5" />
                              <span className="text-[10px] font-bold text-[var(--text-secondary)] block">PDF Signature Attached</span>
                            </div>
                          ) : (
                            <img
                              src={form.signatureUrl}
                              alt="Signature Preview"
                              className="max-h-12 max-w-full object-contain"
                            />
                          )
                        ) : (
                          <div className="text-center text-slate-400">
                            <span className="text-[11px] font-bold block text-[var(--text-muted)]">
                              {form.authorizedSignatory || "Authorized Signatory"}
                            </span>
                            <span className="text-[9px] text-slate-400">Text Line Mode (Default)</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Optional Direct URL Input */}
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                        Or Paste Direct Signature Image / PDF URL
                      </label>
                      <input
                        type="text"
                        value={form.signatureUrl?.startsWith("data:") ? "" : (form.signatureUrl || "")}
                        onChange={(e) => setForm({ ...form, signatureUrl: e.target.value })}
                        placeholder="https://example.com/signature.png"
                        className="w-full px-3 py-1.5 bg-[var(--surface)] border border-[var(--border)] rounded-xl text-xs text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-[var(--text-secondary)] uppercase mb-1">
                      Authorized Signatory Title
                    </label>
                    <input
                      type="text"
                      value={form.authorizedSignatory}
                      onChange={(e) => setForm({ ...form, authorizedSignatory: e.target.value })}
                      placeholder="Authorized Signatory"
                      className="w-full px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl text-xs text-[var(--text-primary)] font-bold focus:border-[var(--accent)] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-[var(--text-secondary)] uppercase mb-1">
                      Legal Declaration
                    </label>
                    <textarea
                      rows={2}
                      value={form.declaration}
                      onChange={(e) => setForm({ ...form, declaration: e.target.value })}
                      className="w-full px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl text-xs text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none resize-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-[var(--text-secondary)] uppercase mb-1">
                      Invoice Terms &amp; Conditions
                    </label>
                    <textarea
                      rows={3}
                      value={form.termsConditions}
                      onChange={(e) => setForm({ ...form, termsConditions: e.target.value })}
                      className="w-full px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl text-xs text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            )}
          </form>
        </div>

        {/* Right Column: Live Tax Invoice Header Preview (5 cols) */}
        <div className="lg:col-span-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1.5">
              <Eye size={15} className="text-cyan-500" /> Live Invoice Header Preview
            </span>
            <span className="badge badge-success text-[9px] font-mono">A4 Ready</span>
          </div>

          {/* Rendered Invoice Card */}
          <div className="bg-white text-slate-900 border border-slate-300 rounded-2xl p-5 sm:p-6 shadow-xl space-y-4 font-sans text-xs">
            {/* Header Box */}
            <div className="flex justify-between items-start border-b border-slate-200 pb-3">
              <div>
                <span className="text-[9px] font-bold uppercase tracking-widest text-indigo-600 block">
                  TAX INVOICE
                </span>
                <h2 className="text-base font-black text-slate-900">
                  {form.companyName || "Your Company Legal Name"}
                </h2>
                {form.tradeName && (
                  <p className="text-[11px] font-bold text-slate-500">
                    Trade: {form.tradeName}
                  </p>
                )}
                <p className="text-[10px] text-slate-600 mt-1 max-w-[220px]">
                  {form.addressLine1 || form.city
                    ? `${form.addressLine1}${form.addressLine2 ? `, ${form.addressLine2}` : ""}${form.city ? `, ${form.city}` : ""}${form.state ? `, ${form.state}` : ""}${form.pincode ? ` - ${form.pincode}` : ""}`
                    : "Enter company address in the form"}
                </p>
              </div>

              <div className="text-right font-mono text-[10px] space-y-1">
                {form.logoUrl ? (
                  form.logoUrl?.startsWith("data:application/pdf") ? (
                    <div className="inline-flex items-center gap-1 bg-slate-100 px-2 py-0.5 rounded border text-[9px] font-sans text-slate-700">
                      <FileText size={12} className="text-rose-500" />
                      <span>PDF Logo</span>
                    </div>
                  ) : (
                    <img src={form.logoUrl} alt="Logo" className="h-8 max-w-[100px] object-contain ml-auto" />
                  )
                ) : (
                  <div className="w-8 h-8 bg-slate-900 text-white flex items-center justify-center font-black text-xs rounded-lg ml-auto">
                    {form.companyName?.trim() ? form.companyName.trim().charAt(0).toUpperCase() : "C"}
                  </div>
                )}
                <div className="bg-slate-100 px-2 py-1 rounded border border-slate-200">
                  <span className="text-slate-500 block text-[9px]">INVOICE NO</span>
                  <span className="font-bold text-indigo-700">
                    {!form.invoicePrefix || form.invoicePrefix === "SHOPIFY_ORDER"
                      ? "#2026-18996"
                      : `${form.invoicePrefix}18996`}
                  </span>
                </div>
                <p className="text-slate-500 text-[9px]">Date: {new Date().toLocaleDateString()}</p>
              </div>
            </div>

            {/* GST & PAN Info Grid */}
            <div className="grid grid-cols-2 gap-2 bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-[10px]">
              <div>
                <span className="text-slate-500 block text-[9px]">GSTIN:</span>
                <span className="font-mono font-black text-indigo-700">{form.gstin || "—"}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[9px]">PAN:</span>
                <span className="font-mono font-bold text-slate-800">{form.pan || "—"}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[9px]">State &amp; Code:</span>
                <span className="font-bold text-slate-800">
                  {form.state ? `${form.state} (${form.stateCode || "—"})` : "—"}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block text-[9px]">Contact:</span>
                <span className="font-medium text-slate-800">{form.phone || form.email || "—"}</span>
              </div>
            </div>

            {/* Sample Line Item Preview */}
            <div className="border border-slate-200 rounded-lg overflow-hidden text-[10px]">
              <div className="bg-slate-100 p-2 font-bold flex justify-between border-b border-slate-200 text-slate-600 uppercase text-[9px]">
                <span>Item Description</span>
                <span>Amount (INR)</span>
              </div>
              <div className="p-2 space-y-1">
                <div className="flex justify-between font-medium text-slate-800">
                  <span>Product Sample Description (HSN 8424)</span>
                  <span className="font-mono font-bold">₹507.63</span>
                </div>
                <div className="flex justify-between text-slate-500 text-[9px]">
                  <span>GST Rate: 18% (CGST 9% + SGST 9%)</span>
                  <span className="font-mono">₹91.37</span>
                </div>
                <div className="flex justify-between font-bold text-indigo-900 pt-1 border-t border-slate-100 text-xs">
                  <span>Total Amount</span>
                  <span className="font-mono font-black">₹599.00</span>
                </div>
              </div>
            </div>

            {/* Bank Details & Signature Footer Preview */}
            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200 text-[9px]">
              <div className="space-y-0.5">
                <span className="font-bold text-slate-700 block">Bank Account Details:</span>
                <p className="text-slate-600">
                  {form.bankName || form.accountNumber
                    ? `${form.bankName || "Bank"} | A/C: ${form.accountNumber || "—"}`
                    : "No bank details added"}
                </p>
                <p className="text-slate-600">
                  {form.ifscCode || form.upiId
                    ? `IFSC: ${form.ifscCode || "—"} | UPI: ${form.upiId || "—"}`
                    : "—"}
                </p>
              </div>
              <div className="text-right space-y-1">
                <span className="text-slate-500 block">For {form.companyName || "Company"}:</span>
                <div className="h-9 flex items-center justify-end">
                  {form.signatureUrl ? (
                    form.signatureUrl?.startsWith("data:application/pdf") ? (
                      <div className="inline-flex items-center gap-1 bg-slate-100 px-1.5 py-0.5 rounded border text-[9px] text-slate-700">
                        <FileText size={12} className="text-rose-500" />
                        <span>PDF Stamp</span>
                      </div>
                    ) : (
                      <img src={form.signatureUrl} alt="Signature" className="h-8 max-w-[100px] object-contain" />
                    )
                  ) : null}
                </div>
                <span className="font-bold text-slate-800 border-t border-slate-300 pt-0.5 block">
                  {form.authorizedSignatory || "Authorized Signatory"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
      </div>
    </RouteGuard>
  );
}

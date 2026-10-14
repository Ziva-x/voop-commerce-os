"use client";

import { useEffect, useState } from "react";
import {
  Share2,
  Save,
  Plus,
  Trash2,
  Eye,
  Sparkles,
  Link as LinkIcon,
  Palette,
} from "lucide-react";
import Link from "next/link";
import { appFetch } from "@/lib/api";

export default function FormBuilderPage() {
  const [settings, setSettings] = useState<any>({
    title: "BARTER COLLAB x VOOP",
    description: "Please fill out the details below to apply for a creator collaboration.",
    themeColor: "#06b6d4",
    bannerUrl: "",
    formSchema: [],
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    appFetch("/api/forms")
      .then((res) => res.json())
      .then((data) => {
        if (data.settings) {
          const s = data.settings;
          setSettings({
            ...s,
            formSchema: typeof s.formSchema === "string" ? JSON.parse(s.formSchema) : s.formSchema || [],
          });
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const handleAddField = () => {
    const newField = {
      id: `custom_${Date.now()}`,
      label: "New Field Question",
      type: "text",
      required: false,
      placeholder: "Enter details...",
    };
    setSettings({ ...settings, formSchema: [...settings.formSchema, newField] });
  };

  const handleRemoveField = (index: number) => {
    const updated = settings.formSchema.filter((_: any, i: number) => i !== index);
    setSettings({ ...settings, formSchema: updated });
  };

  const handleFieldChange = (index: number, key: string, val: any) => {
    const updated = [...settings.formSchema];
    updated[index][key] = val;
    setSettings({ ...settings, formSchema: updated });
  };

  const handleSaveSettings = async () => {
    setSaving(true);
    setSaveSuccess(false);
    try {
      const res = await appFetch("/api/forms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const data = await res.json();
      if (data.success) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2.5">
            <Share2 size={24} className="text-pink-400" /> Collab Application Form Builder
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Customize the public onboarding form that influencers and creators fill out.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/apply"
            target="_blank"
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 text-xs font-bold transition-all border border-[var(--border)]"
          >
            <Eye size={14} /> View Live Form
          </Link>
          <button
            onClick={handleSaveSettings}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gradient-to-r from-pink-500 to-purple-600 text-white text-xs font-bold shadow-md shadow-pink-500/20 hover:brightness-110 disabled:opacity-40 transition-all cursor-pointer"
          >
            <Save size={14} />
            <span>{saving ? "Saving..." : saveSuccess ? "Saved!" : "Save Form"}</span>
          </button>
        </div>
      </div>

      {/* Grid: Editor & Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Form Settings Editor */}
        <div className="lg:col-span-7 space-y-4">
          <div className="glass-panel p-5 border border-[var(--border)] space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <Palette size={14} className="text-pink-400" /> Branding &amp; Appearance
            </h3>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 font-bold mb-1">Form Title</label>
                <input
                  type="text"
                  value={settings.title}
                  onChange={(e) => setSettings({ ...settings, title: e.target.value })}
                  className="w-full p-2.5 bg-slate-950 border border-[var(--border)] rounded-lg text-white font-bold"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-bold mb-1">Description / Subtitle</label>
                <textarea
                  rows={2}
                  value={settings.description}
                  onChange={(e) => setSettings({ ...settings, description: e.target.value })}
                  className="w-full p-2.5 bg-slate-950 border border-[var(--border)] rounded-lg text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-bold mb-1">Brand Accent Color</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={settings.themeColor || "#06b6d4"}
                      onChange={(e) => setSettings({ ...settings, themeColor: e.target.value })}
                      className="w-8 h-8 rounded border border-[var(--border)] bg-transparent cursor-pointer"
                    />
                    <input
                      type="text"
                      value={settings.themeColor || "#06b6d4"}
                      onChange={(e) => setSettings({ ...settings, themeColor: e.target.value })}
                      className="w-full p-2 bg-slate-950 border border-[var(--border)] rounded-lg text-white font-mono text-xs"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-300 font-bold mb-1">Banner Image URL</label>
                  <input
                    type="url"
                    placeholder="https://..."
                    value={settings.bannerUrl || ""}
                    onChange={(e) => setSettings({ ...settings, bannerUrl: e.target.value })}
                    className="w-full p-2.5 bg-slate-950 border border-[var(--border)] rounded-lg text-white text-xs"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Dynamic Fields Editor */}
          <div className="glass-panel p-5 border border-[var(--border)] space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Form Questions &amp; Fields ({settings.formSchema?.length || 0})
              </h3>
              <button
                onClick={handleAddField}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-[var(--border)] text-xs font-semibold"
              >
                <Plus size={13} /> Add Question
              </button>
            </div>

            <div className="space-y-3">
              {settings.formSchema?.map((field: any, idx: number) => (
                <div key={field.id || idx} className="p-3.5 rounded-xl bg-slate-950 border border-[var(--border)] space-y-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-slate-500 text-[10px]">#{idx + 1}</span>
                    <input
                      type="text"
                      value={field.label}
                      onChange={(e) => handleFieldChange(idx, "label", e.target.value)}
                      placeholder="Field Label / Question"
                      className="flex-1 p-1.5 bg-slate-900 border border-slate-850 rounded text-white font-semibold text-xs"
                    />
                    <button
                      onClick={() => handleRemoveField(idx)}
                      className="text-slate-500 hover:text-red-400 p-1"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <div>
                      <label className="text-[10px] text-slate-500 block">Field Type</label>
                      <select
                        value={field.type}
                        onChange={(e) => handleFieldChange(idx, "type", e.target.value)}
                        className="w-full p-1.5 bg-slate-900 border border-slate-850 rounded text-slate-200 text-xs"
                      >
                        <option value="text">Single Line Text</option>
                        <option value="textarea">Paragraph / Address</option>
                        <option value="tel">Phone / WhatsApp Number</option>
                        <option value="url">Website / Social URL</option>
                        <option value="select">Dropdown Choice</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-[10px] text-slate-500 block">Required?</label>
                      <select
                        value={field.required ? "true" : "false"}
                        onChange={(e) => handleFieldChange(idx, "required", e.target.value === "true")}
                        className="w-full p-1.5 bg-slate-900 border border-slate-850 rounded text-slate-200 text-xs"
                      >
                        <option value="false">Optional</option>
                        <option value="true">Mandatory (*)</option>
                      </select>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Live Preview Panel */}
        <div className="lg:col-span-5 space-y-4">
          <div className="glass-panel p-5 border border-[var(--border)] sticky top-4 space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <Eye size={14} className="text-purple-400" /> Live Applicant Preview
            </h3>

            <div className="p-6 rounded-2xl bg-[#090d16] border border-slate-850 shadow-2xl space-y-4 max-h-[75vh] overflow-y-auto">
              <div>
                <h4 className="text-base font-extrabold text-white" style={{ color: settings.themeColor || "#fff" }}>
                  {settings.title}
                </h4>
                <p className="text-xs text-slate-400 mt-1">{settings.description}</p>
              </div>

              <div className="space-y-3 pt-2 border-t border-[var(--border)] text-xs">
                {settings.formSchema?.map((f: any, i: number) => (
                  <div key={i} className="space-y-1">
                    <label className="block text-slate-300 font-semibold text-[11px]">
                      {f.label} {f.required && <span className="text-pink-400">*</span>}
                    </label>
                    {f.type === "textarea" ? (
                      <textarea
                        disabled
                        rows={2}
                        placeholder={f.placeholder || "Enter details..."}
                        className="w-full p-2 bg-slate-900 border border-[var(--border)] rounded-lg text-slate-500 text-xs"
                      />
                    ) : (
                      <input
                        disabled
                        type="text"
                        placeholder={f.placeholder || "Enter details..."}
                        className="w-full p-2 bg-slate-900 border border-[var(--border)] rounded-lg text-slate-500 text-xs"
                      />
                    )}
                  </div>
                ))}

                <button
                  disabled
                  className="w-full py-2.5 rounded-xl font-bold text-xs text-white mt-3"
                  style={{ background: settings.themeColor || "var(--theme-primary)" }}
                >
                  Submit Application
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

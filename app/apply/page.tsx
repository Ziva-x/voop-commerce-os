"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Sparkles, Instagram, Car, Send } from "lucide-react";

export default function PublicApplyPage() {
  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    fetch("/api/forms")
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

  const handleChange = (fieldId: string, value: any) => {
    setFormData((prev) => ({ ...prev, [fieldId]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch("/api/collaborations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: formData.fullName,
          instagramId: formData.instagramId,
          instagramLink: formData.instagramLink,
          whatsappNumber: formData.whatsappNumber,
          place: formData.place,
          address: formData.address,
          contentType: formData.contentType,
          vehicleOwned: formData.vehicleOwned,
          daysToCreate: formData.daysToCreate,
          customResponses: formData,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSubmitted(true);
      } else {
        alert(data.error || "Failed to submit application");
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center text-slate-400 text-sm">
        Loading creator application...
      </div>
    );
  }

  const themeColor = settings?.themeColor || "#06b6d4";
  const fields = settings?.formSchema || [];

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-slate-100 flex flex-col items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-xl bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl relative overflow-hidden">
        {/* Glow Header */}
        <div
          className="absolute -top-24 left-1/2 -translate-x-1/2 w-96 h-48 rounded-full blur-3xl opacity-20 pointer-events-none"
          style={{ background: themeColor }}
        />

        {submitted ? (
          <div className="py-12 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/20">
              <CheckCircle2 size={36} />
            </div>
            <h3 className="text-2xl font-black text-white">Application Received!</h3>
            <p className="text-sm text-slate-400 max-w-md mx-auto">
              Thank you for applying for a collaboration. Our team will review your profile and reach out to you via WhatsApp / Instagram!
            </p>
          </div>
        ) : (
          <div className="space-y-6 relative z-10">
            <div>
              <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-widest text-cyan-400 mb-2">
                <Sparkles size={14} /> Official Creator Application
              </div>
              <h2 className="text-2xl font-black tracking-tight text-white">{settings?.title}</h2>
              <p className="text-xs text-slate-400 mt-1">{settings?.description}</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 text-xs">
              {fields.map((f: any) => (
                <div key={f.id} className="space-y-1.5">
                  <label className="block text-slate-300 font-bold">
                    {f.label} {f.required && <span className="text-pink-400">*</span>}
                  </label>

                  {f.type === "textarea" ? (
                    <textarea
                      rows={3}
                      required={f.required}
                      placeholder={f.placeholder || "Enter details..."}
                      value={formData[f.id] || ""}
                      onChange={(e) => handleChange(f.id, e.target.value)}
                      className="w-full p-3 bg-slate-950/90 border border-slate-800 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-cyan-400 shadow-inner"
                    />
                  ) : f.type === "select" ? (
                    <select
                      required={f.required}
                      value={formData[f.id] || ""}
                      onChange={(e) => handleChange(f.id, e.target.value)}
                      className="w-full p-3 bg-slate-950/90 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-cyan-400"
                    >
                      <option value="">Select an option...</option>
                      {f.options?.map((opt: string) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type={f.type || "text"}
                      required={f.required}
                      placeholder={f.placeholder || "Enter details..."}
                      value={formData[f.id] || ""}
                      onChange={(e) => handleChange(f.id, e.target.value)}
                      className="w-full p-3 bg-slate-950/90 border border-slate-800 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-cyan-400 shadow-inner"
                    />
                  )}
                </div>
              ))}

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3.5 rounded-xl font-black text-sm text-slate-950 shadow-xl hover:brightness-110 disabled:opacity-50 transition-all flex items-center justify-center gap-2 cursor-pointer mt-4"
                style={{ background: themeColor }}
              >
                <Send size={16} />
                <span>{submitting ? "Submitting..." : "Submit Collab Request"}</span>
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}

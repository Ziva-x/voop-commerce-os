"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Building, Lock, Mail, Phone, Store, User } from "lucide-react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { Input, PasswordInput } from "@/components/ui/Input";

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const shopDomain = searchParams.get("shop");
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  
  const [form, setForm] = useState({
    name: "",
    username: "",
    email: "",
    password: "",
    companyName: "",
    companyType: "PVT_LTD",
    contactNo: "",
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, shop: shopDomain }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to register");
      }

      // Auto login after successful registration
      const signInRes = await signIn("credentials", {
        email: form.email,
        password: form.password,
        redirect: false,
      });

      if (signInRes?.error) {
        setError("Account created, but failed to auto-login.");
        setLoading(false);
      } else {
        router.push("/");
        router.refresh();
      }
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred");
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleRegister} className="space-y-5">
      {error && (
        <div className="p-3.5 rounded-xl bg-[var(--danger-soft)] border border-[var(--danger)]/20 text-[var(--danger)] text-xs font-semibold">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Personal Details */}
        <div className="space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)] border-b border-[var(--border)] pb-2">Personal Details</h3>
          
          <Input
            label="Full Name"
            type="text"
            name="name"
            value={form.name}
            onChange={handleChange}
            leadingIcon={<User size={16} />}
            placeholder="John Doe"
            required
          />

          <Input
            label="Username (Unique Identifier)"
            type="text"
            name="username"
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") })}
            leadingIcon={<span className="text-[var(--primary)] font-bold text-xs font-mono">@</span>}
            placeholder="monkeygarage"
            required
            minLength={3}
            className="font-mono"
          />

          <Input
            label="Work Email"
            type="email"
            name="email"
            value={form.email}
            onChange={handleChange}
            leadingIcon={<Mail size={16} />}
            placeholder="john@company.com"
            required
            autoComplete="email"
          />

          <PasswordInput
            label="Password"
            name="password"
            value={form.password}
            onChange={handleChange}
            leadingIcon={<Lock size={16} />}
            placeholder="••••••••"
            required
            minLength={8}
            autoComplete="new-password"
          />
        </div>

        {/* Company Details */}
        <div className="space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)] border-b border-[var(--border)] pb-2">Company Details</h3>
          
          <Input
            label="Company Name"
            type="text"
            name="companyName"
            value={form.companyName}
            onChange={handleChange}
            leadingIcon={<Building size={16} />}
            placeholder="Acme Corp"
            required
          />

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[var(--text-primary)]">Company Type</label>
            <select
              name="companyType"
              value={form.companyType}
              onChange={handleChange}
              className="w-full px-4 py-2.5 bg-[var(--surface)] border border-[var(--border)] rounded-xl text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)] transition-all cursor-pointer"
              required
            >
              <option value="PVT_LTD">Private Limited (Pvt Ltd)</option>
              <option value="LLP">Limited Liability Partnership (LLP)</option>
              <option value="SOLE_PROPRIETOR">Sole Proprietorship</option>
              <option value="PARTNERSHIP">Partnership Firm</option>
              <option value="INC">Corporation (Inc/LLC)</option>
              <option value="OTHER">Other</option>
            </select>
          </div>

          <Input
            label="Contact Number"
            type="tel"
            name="contactNo"
            value={form.contactNo}
            onChange={handleChange}
            leadingIcon={<Phone size={16} />}
            placeholder="+91 98765 43210"
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full mt-4 py-3 bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white font-bold rounded-xl shadow-sm transition-all flex items-center justify-center gap-2 disabled:bg-[var(--surface-active)] disabled:text-[var(--text-disabled)] disabled:cursor-not-allowed cursor-pointer"
      >
        {loading ? (
          "Creating Account..."
        ) : (
          <>
            Create Account <ArrowRight size={16} />
          </>
        )}
      </button>
    </form>
  );
}

export default function RegisterPage() {
  return (
    <div className="min-h-screen bg-[var(--background)] flex flex-col items-center justify-center p-4 relative">
      <div className="w-full max-w-lg z-10 py-8">
        <div className="flex flex-col items-center mb-8 text-center">
          <div className="w-12 h-12 bg-[var(--surface)] border border-[var(--border)] rounded-2xl flex items-center justify-center mb-4 shadow-xs">
            <Store className="text-[var(--primary)]" size={24} />
          </div>
          <h1 className="text-2xl font-black text-[var(--text-primary)] tracking-tight">Create your Account</h1>
          <p className="text-xs text-[var(--text-secondary)] mt-1 font-medium">Join VOOP to manage your unified commerce</p>
        </div>

        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 md:p-8 shadow-sm">
          <Suspense fallback={<div className="text-center text-[var(--text-secondary)] p-4">Loading form...</div>}>
            <RegisterForm />
          </Suspense>
        </div>

        <div className="mt-6 text-center text-xs text-[var(--text-secondary)]">
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-[var(--primary)] hover:text-[var(--primary-hover)] transition-colors">
            Sign In
          </Link>
        </div>
      </div>
    </div>
  );
}

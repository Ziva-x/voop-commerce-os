"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setAdminCookie } from "./actions";

export function AdminLoginForm() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (username === "admin" && password === "admin") {
      await setAdminCookie();
      router.refresh();
    } else {
      setError("Invalid credentials");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <div className="text-red-400 text-sm">{error}</div>}
      <div>
        <label className="block text-xs text-slate-400 mb-1">Username</label>
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="w-full bg-slate-900 border border-[var(--border)] rounded-md p-2 text-white"
          required
        />
      </div>
      <div>
        <label className="block text-xs text-slate-400 mb-1">Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full bg-slate-900 border border-[var(--border)] rounded-md p-2 text-white"
          required
        />
      </div>
      <button
        type="submit"
        className="w-full bg-sky-500 hover:bg-sky-400 text-white font-bold py-2 rounded-md transition-colors"
      >
        Log In
      </button>
    </form>
  );
}

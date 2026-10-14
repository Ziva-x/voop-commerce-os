"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { User, Shield, Store } from "lucide-react";
import { ClientLayout } from "@/components/ClientLayout";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex-1 p-4 md:p-8 overflow-y-auto w-full">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-2xl font-bold text-white mb-6">Settings</h1>
        {children}
      </div>
    </div>
  );
}

"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Truck, ArrowRight, RefreshCw } from "lucide-react";
import Link from "next/link";

export default function DelhiverySettingsRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/settings/couriers");
  }, [router]);

  return (
    <div className="p-8 max-w-xl mx-auto text-center space-y-4">
      <div className="w-12 h-12 rounded-2xl bg-purple-500/10 border border-purple-500/30 mx-auto flex items-center justify-center text-purple-400">
        <Truck size={24} />
      </div>
      <h3 className="text-lg font-bold text-white">Redirecting to All Courier APIs...</h3>
      <p className="text-xs text-slate-400">
        Delhivery configuration has been upgraded into VOOP&apos;s unified multi-carrier system.
      </p>
      <div className="pt-2">
        <Link
          href="/settings/couriers"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition-all shadow-md shadow-purple-600/20"
        >
          <span>Go to All Courier APIs</span>
          <ArrowRight size={14} />
        </Link>
      </div>
    </div>
  );
}

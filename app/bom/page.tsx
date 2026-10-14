"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function BOMRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/purchases");
  }, [router]);

  return (
    <div className="p-8 text-center text-xs text-slate-400">
      BOM system has been replaced with the dynamic Purchases &amp; SKU-based Inventory engine. Redirecting to Purchases...
    </div>
  );
}

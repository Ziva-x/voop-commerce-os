"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DashboardView } from "@/components/DashboardView";
import { CardGridSkeleton } from "@/components/LoadingSkeleton";
import { Suspense } from "react";

function RootDashboard() {
  const router = useRouter();
  const [isRedirecting, setIsRedirecting] = useState(true);

  useEffect(() => {
    async function checkStoreRedirect() {
      try {
        const { appFetch } = await import("@/lib/api");
        const { preserveShopifyParams } = await import("@/lib/runtime-env");
        const res = await appFetch("/api/account/store");
        if (res.ok) {
          const json = await res.json();
          if (json.requiresOnboarding) {
            const search = typeof window !== "undefined" ? window.location.search : "";
            router.replace(preserveShopifyParams(`/onboarding${search}`));
            return;
          }
          const targetRef = json.publicStoreRef || json.voopStoreId;
          if (targetRef) {
            const search = typeof window !== "undefined" ? window.location.search : "";
            router.replace(preserveShopifyParams(`/app/${targetRef}${search}`));
            return;
          }
        }
      } catch (_e) {} finally {
        setIsRedirecting(false);
      }
    }

    checkStoreRedirect();
  }, [router]);

  if (isRedirecting) {
    return <CardGridSkeleton count={4} />;
  }

  return <DashboardView />;
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<CardGridSkeleton count={4} />}>
      <RootDashboard />
    </Suspense>
  );
}

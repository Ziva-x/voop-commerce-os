import { Suspense } from "react";
import { DashboardView } from "@/components/DashboardView";
import { CardGridSkeleton } from "@/components/LoadingSkeleton";

interface StoreDashboardPageProps {
  params: {
    storeId: string;
  };
}

export default function StoreDashboardPage({ params }: StoreDashboardPageProps) {
  const raw = decodeURIComponent(params.storeId || "").trim();
  const storeId = raw.toUpperCase().startsWith("VOOP-") ? raw.toUpperCase() : raw;

  return (
    <Suspense fallback={<CardGridSkeleton count={4} />}>
      <DashboardView targetVoopStoreId={storeId} />
    </Suspense>
  );
}

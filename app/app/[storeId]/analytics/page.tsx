import AnalyticsView from "@/components/views/AnalyticsView";

interface StoreAnalyticsPageProps {
  params: {
    storeId: string;
  };
}

export default function StoreAnalyticsPage({ params }: StoreAnalyticsPageProps) {
  const raw = decodeURIComponent(params.storeId || "").trim();
  const storeId = raw.toUpperCase().startsWith("VOOP-") ? raw.toUpperCase() : raw;
  return <AnalyticsView targetVoopStoreId={storeId} />;
}

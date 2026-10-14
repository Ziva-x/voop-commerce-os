export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.DATABASE_URL) {
    const { AutoSyncScheduler } = await import("@/lib/services/AutoSyncScheduler");
    const scheduler = AutoSyncScheduler.getInstance();
    scheduler.start();
    console.log("[Instrumentation] ✓ VOOP Background Auto-Sync Service registered & running.");
  }
}

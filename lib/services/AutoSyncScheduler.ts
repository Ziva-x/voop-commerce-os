import prisma from "@/lib/prisma";
import { syncOrders } from "@/lib/shopify";
import { DelhiveryService } from "@/lib/services/DelhiveryService";
import { OrderReconciliationService } from "@/lib/services/OrderReconciliationService";

// Global singleton tracker across hot-reloads and server lifecycle
declare global {
  var __voopAutoSyncScheduler: AutoSyncScheduler | undefined;
}

export class AutoSyncScheduler {
  private heartbeatTimer: NodeJS.Timeout | null = null;

  public isOrderSyncRunning: boolean = false;
  public isTrackingSyncRunning: boolean = false;

  public lastOrderSyncAt: Date | null = null;
  public nextOrderSyncAt: Date | null = null;
  public orderRunsCount: number = 0;

  public lastTrackingSyncAt: Date | null = null;
  public nextTrackingSyncAt: Date | null = null;
  public trackingRunsCount: number = 0;

  public isStarted: boolean = false;

  // Configuration intervals
  public readonly ORDER_SAFETY_INTERVAL_MS = 5 * 60 * 60 * 1000; // 5 hours safety sync (18,000,000 ms)
  public readonly TRACKING_INTERVAL_MS = 3 * 60 * 60 * 1000; // 3 hours (10800000 ms)
  public readonly HEARTBEAT_MS = 30 * 1000; // 30 seconds check

  public static getInstance(): AutoSyncScheduler {
    if (!global.__voopAutoSyncScheduler) {
      global.__voopAutoSyncScheduler = new AutoSyncScheduler();
    }
    return global.__voopAutoSyncScheduler;
  }

  /**
   * Start the Background Sync Engine Daemon
   */
  public start() {
    if (this.isStarted) {
      return;
    }

    this.isStarted = true;
    console.log("[AutoSyncScheduler] 🚀 Starting VOOP Auto-Sync Daemon (5h Safety Incremental Orders, 3h Tracking, 30s Heartbeat)...");

    // Initialize timestamps from database asynchronously
    this.refreshStateFromDB().catch(console.error);

    // Start 30-second heartbeat check loop
    this.heartbeatTimer = setInterval(async () => {
      await this.tickHeartbeat();
    }, this.HEARTBEAT_MS);

    // Initial check after 5 seconds
    setTimeout(async () => {
      await this.tickHeartbeat();
    }, 5000);
  }

  /**
   * Refresh in-memory telemetry from database logs
   */
  public async refreshStateFromDB() {
    try {
      // 1. Get latest successful order sync log or store lastOrderSyncAt
      const [latestOrderLog, store, orderRunsTotal] = await Promise.all([
        prisma.syncLog.findFirst({
          where: {
            type: { in: ["ORDERS_INCREMENTAL", "ORDERS"] },
            status: "SUCCESS",
          },
          orderBy: { completedAt: "desc" },
        }),
        prisma.shopifyStore.findFirst({
          where: { isConnected: true },
        }),
        prisma.syncLog.count({
          where: {
            type: { in: ["ORDERS_INCREMENTAL", "ORDERS"] },
            status: "SUCCESS",
          },
        }),
      ]);

      if (latestOrderLog?.completedAt) {
        this.lastOrderSyncAt = latestOrderLog.completedAt;
      } else if (store?.lastOrderSyncAt) {
        this.lastOrderSyncAt = store.lastOrderSyncAt;
      }

      this.orderRunsCount = orderRunsTotal;

      if (this.lastOrderSyncAt) {
        this.nextOrderSyncAt = new Date(this.lastOrderSyncAt.getTime() + this.ORDER_SAFETY_INTERVAL_MS);
      } else {
        this.nextOrderSyncAt = new Date();
      }

      // 2. Get latest tracking sync log
      const [latestTrackingLog, trackingRunsTotal] = await Promise.all([
        prisma.syncLog.findFirst({
          where: { details: { contains: "Auto Tracking Sync" }, status: "SUCCESS" },
          orderBy: { completedAt: "desc" },
        }),
        prisma.syncLog.count({
          where: { details: { contains: "Auto Tracking Sync" }, status: "SUCCESS" },
        }),
      ]);

      if (latestTrackingLog?.completedAt) {
        this.lastTrackingSyncAt = latestTrackingLog.completedAt;
        this.nextTrackingSyncAt = new Date(this.lastTrackingSyncAt.getTime() + this.TRACKING_INTERVAL_MS);
      } else {
        this.nextTrackingSyncAt = new Date();
      }

      this.trackingRunsCount = trackingRunsTotal;
    } catch (err) {
      console.error("[AutoSyncScheduler] Error refreshing state from DB:", err);
    }
  }

  /**
   * Heartbeat Tick: Runs every 30 seconds to evaluate if an order safety sync or tracking sync is due
   */
  private async tickHeartbeat() {
    const now = Date.now();

    // Check 5-Hour Safety Incremental Sync Due
    const isSafetyDue = !this.lastOrderSyncAt || now - this.lastOrderSyncAt.getTime() >= this.ORDER_SAFETY_INTERVAL_MS;
    if (isSafetyDue && !this.isOrderSyncRunning) {
      console.log("[AutoSyncScheduler] ⏰ 5-Hour Safety Incremental Order Sync is due. Checking updated orders...");
      this.runOrdersIncrementalSafetySync().catch((err) => {
        console.error("[AutoSyncScheduler] Error in safety incremental sync:", err);
      });
    }

    // Check Tracking Sync Due
    const isTrackingDue = !this.lastTrackingSyncAt || now - this.lastTrackingSyncAt.getTime() >= this.TRACKING_INTERVAL_MS;
    if (isTrackingDue && !this.isTrackingSyncRunning) {
      console.log("[AutoSyncScheduler] 🚚 3-Hour Tracking Sync is due. Triggering background sync...");
      this.runTrackingBatchSync().catch((err) => {
        console.error("[AutoSyncScheduler] Error in heartbeat tracking batch sync:", err);
      });
    }
  }

  /**
   * Stop all timers (graceful shutdown)
   */
  public stop() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this.isStarted = false;
    console.log("[AutoSyncScheduler] 🛑 Auto-Sync Scheduler stopped.");
  }

  /**
   * SECONDARY: 5-Hour Safety Incremental Order Sync
   *
   * Queries Shopify using `updated_at_min` for only the orders that changed recently.
   * NEVER scans or reprocesses the entire historical database during normal operation.
   */
  public async runOrdersIncrementalSafetySync(): Promise<{ success: boolean; recordsCount: number; durationMs: number; error?: string }> {
    if (this.isOrderSyncRunning) {
      console.log("[AutoSyncScheduler] Order sync already in progress. Skipping duplicate run.");
      return { success: false, recordsCount: 0, durationMs: 0, error: "Sync already running" };
    }

    this.isOrderSyncRunning = true;
    const startTime = Date.now();

    try {
      const activeStores = await prisma.shopifyStore.findMany({
        where: { isConnected: true },
      });

      if (activeStores.length === 0) {
        console.log("[AutoSyncScheduler] No active connected Shopify stores found.");
        return { success: false, recordsCount: 0, durationMs: 0, error: "No connected stores" };
      }

      let totalUpdated = 0;
      let totalDuration = 0;

      // 6-hour lookback ensures full overlap with 5-hour cron interval
      const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);

      for (const store of activeStores) {
        console.log(`[AutoSyncScheduler] 🛡️ Running 5-hour incremental safety sync for ${store.shopDomain} (since ${sixHoursAgo.toISOString()})...`);
        try {
          // Reconcile ONLY orders changed since sixHoursAgo
          const result = await OrderReconciliationService.reconcileIncrementalOrders(store.id, sixHoursAgo);
          if (result.success) {
            totalUpdated += result.changedOrdersCount;
            totalDuration += result.durationMs;
          }

          // Also ensure real-time webhooks remain active
          OrderReconciliationService.registerStoreWebhooks(store.id).catch((whErr) => {
            console.error(`[AutoSyncScheduler] Webhook registration check error for ${store.shopDomain}:`, whErr);
          });
        } catch (err: any) {
          console.error(`[AutoSyncScheduler] ❌ Incremental sync error for ${store.shopDomain}:`, err);
        }
      }

      this.lastOrderSyncAt = new Date();
      this.nextOrderSyncAt = new Date(Date.now() + this.ORDER_SAFETY_INTERVAL_MS);
      this.orderRunsCount++;

      console.log(`[AutoSyncScheduler] ✓ 5-Hour Safety Incremental Sync complete: ${totalUpdated} changed order(s) updated across ${activeStores.length} stores.`);

      return { success: true, recordsCount: totalUpdated, durationMs: totalDuration };
    } catch (err: any) {
      console.error("[AutoSyncScheduler] ❌ Safety incremental sync error:", err);
      return { success: false, recordsCount: 0, durationMs: Date.now() - startTime, error: err.message };
    } finally {
      this.isOrderSyncRunning = false;
    }
  }

  /**
   * Alias for backward compatibility
   */
  public async runOrdersBatchSync(): Promise<{ success: boolean; recordsCount: number; durationMs: number; error?: string }> {
    return this.runOrdersIncrementalSafetySync();
  }

  /**
   * Store-Specific Sync Worker (Section 18)
   * Strictly scopes sync execution to the specified storeId.
   * Isolates failures so one store's 401/error never impacts another store.
   */
  public async syncStore(storeId: string): Promise<{ success: boolean; recordsCount: number; durationMs: number; error?: string }> {
    const startTime = Date.now();
    try {
      const store = await prisma.shopifyStore.findUnique({ where: { id: storeId } });
      if (!store || !store.isConnected) {
        return { success: false, recordsCount: 0, durationMs: 0, error: `Store ${storeId} is not connected` };
      }

      const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
      const result = await OrderReconciliationService.reconcileIncrementalOrders(store.id, sixHoursAgo);
      return {
        success: result.success,
        recordsCount: result.changedOrdersCount,
        durationMs: Date.now() - startTime,
      };
    } catch (err: any) {
      console.error(`[AutoSyncScheduler] Error syncing store ${storeId}:`, err);
      return {
        success: false,
        recordsCount: 0,
        durationMs: Date.now() - startTime,
        error: err.message,
      };
    }
  }

  /**
   * TERTIARY: Manual Full Sync
   *
   * Complete historical reconciliation/recovery.
   * Triggered ONLY on demand, NEVER run automatically on a regular schedule.
   */
  public async runOrdersFullSync(): Promise<{ success: boolean; recordsCount: number; durationMs: number; error?: string }> {
    if (this.isOrderSyncRunning) {
      return { success: false, recordsCount: 0, durationMs: 0, error: "Sync already running" };
    }

    this.isOrderSyncRunning = true;
    const startTime = Date.now();

    try {
      const activeStores = await prisma.shopifyStore.findMany({ where: { isConnected: true } });
      let totalRecords = 0;
      let totalDuration = 0;

      for (const store of activeStores) {
        const result = await syncOrders(store.id);
        totalRecords += result.recordsCount;
        totalDuration += result.durationMs;
      }

      return { success: true, recordsCount: totalRecords, durationMs: totalDuration };
    } catch (err: any) {
      return { success: false, recordsCount: 0, durationMs: Date.now() - startTime, error: err.message };
    } finally {
      this.isOrderSyncRunning = false;
    }
  }

  /**
   * 3-Hour Shipping Tracking Batch Sync:
   * Queries in-transit / active shipments in batches and synchronizes multi-carrier tracking scans.
   */
  public async runTrackingBatchSync(): Promise<{ success: boolean; total: number; synced: number; errors: number; durationMs: number; error?: string }> {
    if (this.isTrackingSyncRunning) {
      console.log("[AutoSyncScheduler] Tracking sync already in progress. Skipping duplicate run.");
      return { success: false, total: 0, synced: 0, errors: 0, durationMs: 0, error: "Sync already running" };
    }

    this.isTrackingSyncRunning = true;
    const startTime = Date.now();

    try {
      console.log("[AutoSyncScheduler] 🚚 Starting 3-hour batch tracking sync for active shipments...");

      // Iterate per store to keep tracking data properly scoped
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const stores = await prisma.shopifyStore.findMany({ where: { isConnected: true } });
      let totalAwbs = 0;
      let syncedCount = 0;
      let errorCount = 0;

      for (const store of stores) {
        const storeStartTime = Date.now();
        const activeShipments = await prisma.shipment.findMany({
          where: {
            storeId: store.id,
            deletedAt: null,
            OR: [
              { normalizedStatus: { notIn: ["DELIVERED", "CANCELLED", "CANCELLED_PRE_DISPATCH"] } },
              {
                normalizedStatus: "DELIVERED",
                lastSyncedAt: { gte: sevenDaysAgo },
              },
            ],
          },
          select: { awb: true },
          take: 300,
          orderBy: { createdAt: "desc" },
        });

        const storeAwbs = activeShipments.map((s) => s.awb);
        totalAwbs += storeAwbs.length;

        let storeSynced = 0;
        let storeErrors = 0;
        if (storeAwbs.length > 0) {
          const batchResult = await DelhiveryService.syncBatchTracking(store.id, storeAwbs);
          storeSynced = batchResult.synced;
          storeErrors = batchResult.errors;
          syncedCount += storeSynced;
          errorCount += storeErrors;
        }

        const storeDuration = Date.now() - storeStartTime;
        // Log tracking audit entry strictly per store
        try {
          await prisma.syncLog.create({
            data: {
              storeId: store.id,
              type: "ORDERS",
              status: storeErrors > 0 && storeSynced === 0 ? "FAILED" : "SUCCESS",
              recordsCount: storeSynced,
              durationMs: storeDuration,
              completedAt: new Date(),
              details: `3-Hour Auto Tracking Sync: Checked ${storeAwbs.length} shipments, ${storeSynced} updated.`,
            },
          });
        } catch (logErr) {}
      }

      this.lastTrackingSyncAt = new Date();
      this.nextTrackingSyncAt = new Date(Date.now() + this.TRACKING_INTERVAL_MS);
      this.trackingRunsCount++;

      const durationMs = Date.now() - startTime;

      console.log(`[AutoSyncScheduler] ✓ 3-Hour Tracking sync complete: ${syncedCount}/${totalAwbs} synced in ${durationMs}ms`);

      return {
        success: true,
        total: totalAwbs,
        synced: syncedCount,
        errors: errorCount,
        durationMs,
      };
    } catch (err: any) {
      console.error("[AutoSyncScheduler] ❌ 3-Hour tracking sync error:", err);
      return {
        success: false,
        total: 0,
        synced: 0,
        errors: 0,
        durationMs: Date.now() - startTime,
        error: err.message,
      };
    } finally {
      this.isTrackingSyncRunning = false;
    }
  }

  /**
   * Get current scheduler telemetry & countdown status (reads directly from DB for 100% accuracy)
   */
  public async getStatusAsync() {
    await this.refreshStateFromDB();
    return this.getStatus();
  }

  /**
   * Synchronous getter with current memory state
   */
  public getStatus() {
    const now = Date.now();

    const orderMsRemaining = this.nextOrderSyncAt
      ? Math.max(0, this.nextOrderSyncAt.getTime() - now)
      : 0;

    const trackingMsRemaining = this.nextTrackingSyncAt
      ? Math.max(0, this.nextTrackingSyncAt.getTime() - now)
      : 0;

    return {
      isStarted: this.isStarted,
      ordersSync: {
        interval: "5 Hours (Safety Incremental)",
        intervalMs: this.ORDER_SAFETY_INTERVAL_MS,
        isRunning: this.isOrderSyncRunning,
        lastRunAt: this.lastOrderSyncAt,
        nextRunAt: this.nextOrderSyncAt,
        minutesUntilNextRun: Math.ceil(orderMsRemaining / 60000),
        runsCompleted: this.orderRunsCount,
      },
      trackingSync: {
        interval: "3 Hours",
        intervalMs: this.TRACKING_INTERVAL_MS,
        isRunning: this.isTrackingSyncRunning,
        lastRunAt: this.lastTrackingSyncAt,
        nextRunAt: this.nextTrackingSyncAt,
        minutesUntilNextRun: Math.ceil(trackingMsRemaining / 60000),
        runsCompleted: this.trackingRunsCount,
      },
    };
  }
}

if (process.env.NODE_ENV !== "test" && process.env.DATABASE_URL) {
  // Check if we are in a build phase, sometimes Next.js exposes NEXT_PHASE or just rely on DATABASE_URL
  // Wait, Prisma might throw if DATABASE_URL is not fully valid even if it's truthy, but during build Fly.io doesn't inject it.
  // Actually, we can just check if process.env.NODE_ENV === "production" and CI/CD variables are set.
  // A safer approach: don't auto-start it on import! The instrumentation.ts already starts it!
}

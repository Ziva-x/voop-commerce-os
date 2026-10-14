import { prisma } from "@/lib/prisma";
import { CourierService } from "@/lib/services/CourierService";
import { CourierIntegrationService } from "@/lib/services/couriers/CourierIntegrationService";
import { CourierType, CourierTrackingResult, CourierTrackingScan } from "@/lib/services/couriers/types";
import { DelhiveryService } from "@/lib/services/DelhiveryService";
import { canAdvanceStatus, isValidEventTimestamp } from "@/lib/services/couriers/statusNormalization";

export interface NormalizedTrackingResponse {
  awb: string;
  courier: string;
  courierType: string;
  currentStatus: string;
  normalizedStatus: string;
  rawStatus?: string;
  currentLocation?: string | null;
  statusLocation?: string | null;
  statusTimestamp?: Date | string | null;
  statusInstructions?: string | null;
  estimatedDelivery?: Date | string | null;
  lastUpdated?: Date | string | null;
  lastSyncedAt?: Date | string | null;
  orderNumber?: string | null;
  shopifyOrderName?: string | null;
  shopifyOrderNumber?: string | null;
  orderCreatedAt?: Date | string | null;
  payment?: string | null;
  amount?: number | null;
  pickupDate?: Date | string | null;
  etdDate?: Date | string | null;
  deliveryDate?: Date | string | null;
  rtoDate?: Date | string | null;
  rtoDeliveredDate?: Date | string | null;
  outwardScanned?: boolean;
  rtoInwardScanned?: boolean;
  isApiConfigured: boolean;
  officialTrackingUrl: string;
  warning?: string | null;
  events: Array<{
    status: string;
    description?: string | null;
    location?: string | null;
    instructions?: string | null;
    timestamp: Date | string;
  }>;
  scans: Array<{
    status: string;
    statusType?: string | null;
    location?: string | null;
    instructions?: string | null;
    timestamp: Date | string;
  }>;
}

export class CourierTrackingService {
  /**
   * Track any shipment across all supported couriers.
   * - Checks store-level courier API credentials
   * - Invokes courier adapter
   * - Normalizes response
   * - Persists latest state & scans to DB
   * - Provides graceful fallback if API is not configured or fails
   */
  public static async trackShipment(
    storeId: string,
    awb: string,
    forceRefresh = false,
    courierOverride?: string
  ): Promise<NormalizedTrackingResponse | null> {
    if (!storeId || !awb) return null;

    const rawClean = awb.trim().replace("#", "");
    const cleanAwb = rawClean.split(/\s+/)[0];
    if (!cleanAwb) return null;

    // 1. Fetch existing shipment from database
    const shipment = await prisma.shipment.findUnique({
      where: {
        storeId_awb: {
          storeId,
          awb: cleanAwb,
        },
      },
      include: {
        scans: {
          orderBy: { timestamp: "desc" },
        },
      },
    });

    // 2. Identify the courier
    const detectedCourier = CourierService.detectCourier(
      courierOverride || shipment?.carrier,
      cleanAwb
    );
    const courierCode = CourierService.normalizeCarrierType(
      courierOverride || shipment?.courierType || shipment?.carrier,
      cleanAwb
    );

    const officialUrl = CourierService.getTrackingUrl(
      cleanAwb,
      shipment?.carrier || detectedCourier.displayName,
      shipment?.trackingUrl
    );

    // 3. Return cached data if available and fresh (< 15 mins) and not forceRefresh
    const isTerminal =
      shipment?.normalizedStatus === "DELIVERED" ||
      shipment?.normalizedStatus === "RTO_DELIVERED" ||
      shipment?.normalizedStatus === "CANCELLED" ||
      shipment?.normalizedStatus === "CANCELLED_PRE_DISPATCH";

    const isFresh =
      shipment?.lastSyncedAt &&
      Date.now() - new Date(shipment.lastSyncedAt).getTime() < 15 * 60 * 1000;

    // Build base response from stored DB state
    const buildStoredResponse = (warningMsg?: string | null, isApiConfigured = false): NormalizedTrackingResponse => {
      const scansFormatted = (shipment?.scans || []).map((s) => ({
        status: s.status,
        statusType: s.statusType,
        location: s.location,
        instructions: s.instructions,
        timestamp: s.timestamp,
      }));

      return {
        awb: cleanAwb,
        courier: detectedCourier.displayName,
        courierType: courierCode,
        currentStatus: shipment?.status || "Manifested",
        normalizedStatus: shipment?.normalizedStatus || "MANIFESTED",
        rawStatus: shipment?.rawStatus || shipment?.status || "Manifested",
        currentLocation: shipment?.statusLocation || "Assigned to " + detectedCourier.displayName,
        statusLocation: shipment?.statusLocation || "Assigned to " + detectedCourier.displayName,
        statusTimestamp: shipment?.statusTimestamp || shipment?.lastSyncedAt || shipment?.createdAt || new Date(),
        statusInstructions: shipment?.statusInstructions || null,
        estimatedDelivery: shipment?.etdDate || null,
        lastUpdated: shipment?.lastSyncedAt || shipment?.updatedAt || new Date(),
        lastSyncedAt: shipment?.lastSyncedAt || null,
        shopifyOrderName: shipment?.shopifyOrderName || null,
        shopifyOrderNumber: shipment?.shopifyOrderNumber || null,
        orderNumber: shipment?.shopifyOrderName || (shipment?.shopifyOrderNumber ? `#${shipment.shopifyOrderNumber}` : shipment?.orderNumber) || null,
        orderCreatedAt: shipment?.orderCreatedAt || null,
        payment: shipment?.payment || "Prepaid",
        amount: shipment?.amount || 0.0,
        pickupDate: shipment?.pickupDate || null,
        etdDate: shipment?.etdDate || null,
        deliveryDate: shipment?.deliveryDate || null,
        rtoDate: shipment?.rtoDate || null,
        rtoDeliveredDate: (shipment as any)?.rtoDeliveredDate || null,
        outwardScanned: shipment?.outwardScanned || false,
        rtoInwardScanned: shipment?.rtoInwardScanned || false,
        isApiConfigured,
        officialTrackingUrl: officialUrl,
        warning: warningMsg || null,
        events: scansFormatted.map((s) => ({
          status: s.status,
          description: s.instructions || s.status,
          location: s.location,
          instructions: s.instructions,
          timestamp: s.timestamp,
        })),
        scans: scansFormatted,
      };
    };

    // If terminal status and not forceRefresh, return stored state without hammering API
    if (isTerminal && !forceRefresh && shipment) {
      return buildStoredResponse(null, true);
    }

    // If fresh and not forceRefresh, return cached data
    if (isFresh && !forceRefresh && shipment && shipment.scans.length > 0) {
      return buildStoredResponse(null, true);
    }

    // 4. Special Case: Delhivery has dedicated full service
    if (courierCode === "DELHIVERY") {
      try {
        const delhiveryResult = await DelhiveryService.fetchTracking(storeId, cleanAwb, forceRefresh);
        if (delhiveryResult) {
          const scansFormatted = (delhiveryResult.scans || []).map((s) => ({
            status: s.status,
            statusType: s.statusType,
            location: s.location,
            instructions: s.instructions,
            timestamp: s.timestamp,
          }));

          return {
            awb: cleanAwb,
            courier: "Delhivery",
            courierType: "DELHIVERY",
            currentStatus: delhiveryResult.rawStatus || "Manifested",
            normalizedStatus: delhiveryResult.normalizedStatus || "MANIFESTED",
            rawStatus: delhiveryResult.rawStatus || "Manifested",
            currentLocation: delhiveryResult.statusLocation || "In Facility",
            statusLocation: delhiveryResult.statusLocation || "In Facility",
            statusTimestamp: delhiveryResult.statusTimestamp || new Date(),
            statusInstructions: delhiveryResult.statusInstructions || null,
            estimatedDelivery: delhiveryResult.etdDate || null,
            lastUpdated: delhiveryResult.lastSyncedAt || new Date(),
            lastSyncedAt: delhiveryResult.lastSyncedAt || new Date(),
            shopifyOrderName: shipment?.shopifyOrderName || null,
            shopifyOrderNumber: shipment?.shopifyOrderNumber || null,
            orderNumber: shipment?.shopifyOrderName || (shipment?.shopifyOrderNumber ? `#${shipment.shopifyOrderNumber}` : (shipment?.orderNumber || delhiveryResult.orderNumber || null)),
            orderCreatedAt: shipment?.orderCreatedAt || null,
            payment: delhiveryResult.payment || shipment?.payment || "Prepaid",
            amount: delhiveryResult.amount || shipment?.amount || 0.0,
            pickupDate: delhiveryResult.pickupDate || shipment?.pickupDate || null,
            etdDate: delhiveryResult.etdDate || shipment?.etdDate || null,
            deliveryDate: delhiveryResult.deliveryDate || shipment?.deliveryDate || null,
            rtoDate: delhiveryResult.rtoDate || shipment?.rtoDate || null,
            rtoDeliveredDate: (delhiveryResult as any)?.rtoDeliveredDate || (shipment as any)?.rtoDeliveredDate || null,
            outwardScanned: delhiveryResult.outwardScanned ?? shipment?.outwardScanned ?? false,
            rtoInwardScanned: delhiveryResult.rtoInwardScanned ?? shipment?.rtoInwardScanned ?? false,
            isApiConfigured: true,
            officialTrackingUrl: officialUrl,
            warning: null,
            events: scansFormatted.map((s) => ({
              status: s.status,
              description: s.instructions || s.status,
              location: s.location,
              instructions: s.instructions,
              timestamp: s.timestamp,
            })),
            scans: scansFormatted,
          };
        }
      } catch (delhiveryErr: any) {
        return buildStoredResponse(delhiveryErr.message || "Failed to reach Delhivery API", true);
      }
    }

    // 5. If Unknown / Other courier: no direct API exists, return stored shipment with official track link
    if (courierCode === "UNKNOWN" || (courierCode as string) === "OTHER") {
      return buildStoredResponse(
        `Automated tracking API is not available for ${detectedCourier.displayName}. Use the official tracking portal link below.`,
        false
      );
    }

    // 6. Check credentials in All Courier APIs for this store
    const integrationCreds = await CourierIntegrationService.getDecryptedCredentials(
      storeId,
      courierCode as CourierType
    );

    if (!integrationCreds || !integrationCreds.credentials || integrationCreds.status !== "CONNECTED") {
      // Courier API is not configured for this store
      return buildStoredResponse(
        `${detectedCourier.displayName} API credentials are not configured or not active in All Courier APIs settings. Use the official tracking link below.`,
        false
      );
    }

    // 7. Call courier adapter
    const adapter = CourierIntegrationService.getAdapter(courierCode);
    if (!adapter || !adapter.fetchTracking) {
      return buildStoredResponse(
        `Tracking adapter for ${detectedCourier.displayName} is currently in development.`,
        false
      );
    }

    try {
      const trackingResult: CourierTrackingResult | null = await adapter.fetchTracking(
        cleanAwb,
        integrationCreds.credentials,
        integrationCreds.environment
      );

      if (!trackingResult) {
        return buildStoredResponse("No tracking checkpoints found for this waybill on carrier network.", true);
      }

      // 8. Filter future-dated scans and sort chronologically
      const validScans = (trackingResult.scans || [])
        .filter((s) => s && s.timestamp && isValidEventTimestamp(s.timestamp))
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

      // Check for actual physical pickup scan
      const physicalPickupScan = validScans.find((s) => {
        const st = (s.statusType || "").toUpperCase();
        const txt = `${s.status || ""} ${s.instructions || ""}`.toUpperCase();
        return (
          st === "PU" ||
          txt.includes("PICKED UP") ||
          txt.includes("PICKED-UP") ||
          txt.includes("PACKAGE PICKED UP") ||
          txt.includes("SHIPMENT PICKED UP") ||
          txt.includes("PICKUP COMPLETED") ||
          txt.includes("PICKUP DONE") ||
          txt.includes("INWARDED AT ORIGIN") ||
          txt.includes("RECEIVED FROM SHIPPER")
        );
      });

      const actualPickupTimestamp = physicalPickupScan?.timestamp ? new Date(physicalPickupScan.timestamp) : null;
      const effectivePickupDate = actualPickupTimestamp || trackingResult.pickupDate || shipment?.pickupDate || null;

      let authoritativeNormalizedStatus = trackingResult.normalizedStatus;
      let authoritativeRawStatus = trackingResult.rawStatus;
      let authoritativeTimestamp = isValidEventTimestamp(trackingResult.statusTimestamp)
        ? new Date(trackingResult.statusTimestamp!)
        : null;

      // If no physical pickup scan yet, status CANNOT be IN_TRANSIT
      if (!physicalPickupScan && (authoritativeNormalizedStatus === "IN_TRANSIT" || (authoritativeNormalizedStatus as any) === "PICKUP_COMPLETED" || (authoritativeNormalizedStatus as any) === "PICKED_UP" || (authoritativeNormalizedStatus as any) === "DISPATCHED")) {
        authoritativeNormalizedStatus = "AWB_GENERATED";
        const isTransitWord = authoritativeRawStatus.toUpperCase().includes("TRANSIT") || authoritativeRawStatus.toUpperCase().includes("DISPATCH") || authoritativeRawStatus.toUpperCase().includes("PICKED");
        if (isTransitWord) {
          authoritativeRawStatus = trackingResult.rawStatus && !trackingResult.rawStatus.toUpperCase().includes("TRANSIT") && !trackingResult.rawStatus.toUpperCase().includes("DISPATCH") && !trackingResult.rawStatus.toUpperCase().includes("PICKED")
            ? trackingResult.rawStatus
            : "Pickup Pending";
        }
      }

      // Status Progression Guard against existing shipment in DB
      if (shipment) {
        const canAdvance = canAdvanceStatus(
          shipment.normalizedStatus,
          authoritativeNormalizedStatus,
          shipment.statusTimestamp,
          authoritativeTimestamp
        );

        if (!canAdvance) {
          authoritativeNormalizedStatus = (shipment.normalizedStatus as any) || authoritativeNormalizedStatus;
          authoritativeRawStatus = shipment.rawStatus || shipment.status || authoritativeRawStatus;
          if (shipment.statusTimestamp) {
            authoritativeTimestamp = shipment.statusTimestamp;
          }
        }

        // Upsert scans
        for (const scan of validScans) {
          try {
            await prisma.shipmentScan.upsert({
              where: {
                storeId_awb_timestamp_status_location: {
                  storeId,
                  awb: cleanAwb,
                  timestamp: new Date(scan.timestamp),
                  status: scan.status,
                  location: scan.location || "Facility",
                },
              },
              create: {
                storeId,
                shipmentId: shipment.id,
                awb: cleanAwb,
                status: scan.status,
                statusType: scan.statusType || null,
                location: scan.location || null,
                instructions: scan.instructions || null,
                timestamp: new Date(scan.timestamp),
              },
              update: {},
            });
          } catch (_) {
            // Non-blocking duplicate scan skip
          }
        }

        // Update shipment
        await prisma.shipment.update({
          where: { id: shipment.id },
          data: {
            rawStatus: authoritativeRawStatus,
            status: authoritativeRawStatus,
            normalizedStatus: authoritativeNormalizedStatus,
            statusLocation: trackingResult.statusLocation || shipment.statusLocation,
            statusTimestamp: authoritativeTimestamp || new Date(),
            deliveryDate: trackingResult.deliveryDate || shipment.deliveryDate,
            pickupDate: effectivePickupDate,
            lastSyncedAt: new Date(),
          },
        });
      }

      // Format scans chronologically descending (latest first) for drawer timeline
      const scansFormatted = validScans
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .map((s) => ({
          status: s.status,
          statusType: s.statusType || null,
          location: s.location || null,
          instructions: s.instructions || null,
          timestamp: s.timestamp,
        }));

      return {
        awb: cleanAwb,
        courier: detectedCourier.displayName,
        courierType: courierCode,
        currentStatus: authoritativeRawStatus,
        normalizedStatus: authoritativeNormalizedStatus,
        rawStatus: authoritativeRawStatus,
        currentLocation: trackingResult.statusLocation || "In Facility",
        statusLocation: trackingResult.statusLocation || "In Facility",
        statusTimestamp: authoritativeTimestamp || new Date(),
        statusInstructions: null,
        estimatedDelivery: null,
        lastUpdated: new Date(),
        lastSyncedAt: new Date(),
        shopifyOrderName: shipment?.shopifyOrderName || null,
        shopifyOrderNumber: shipment?.shopifyOrderNumber || null,
        orderNumber: shipment?.shopifyOrderName || (shipment?.shopifyOrderNumber ? `#${shipment.shopifyOrderNumber}` : (shipment?.orderNumber || trackingResult.orderNumber || null)),
        orderCreatedAt: shipment?.orderCreatedAt || null,
        payment: shipment?.payment || "Prepaid",
        amount: shipment?.amount || 0.0,
        pickupDate: trackingResult.pickupDate || shipment?.pickupDate || null,
        etdDate: (trackingResult as any)?.estimatedDelivery || shipment?.etdDate || null,
        deliveryDate: trackingResult.deliveryDate || shipment?.deliveryDate || null,
        rtoDate: shipment?.rtoDate || null,
        rtoDeliveredDate: (shipment as any)?.rtoDeliveredDate || null,
        outwardScanned: shipment?.outwardScanned || false,
        rtoInwardScanned: shipment?.rtoInwardScanned || false,
        isApiConfigured: true,
        officialTrackingUrl: officialUrl,
        warning: null,
        events: scansFormatted.map((s) => ({
          status: s.status,
          description: s.instructions || s.status,
          location: s.location,
          instructions: s.instructions,
          timestamp: s.timestamp,
        })),
        scans: scansFormatted,
      };
    } catch (err: any) {
      console.error(`[COURIER_TRACKING] ${detectedCourier.displayName} API error:`, err);
      return buildStoredResponse(
        `${detectedCourier.displayName} tracking error: ${err.message || "Network timeout"}. Check All Courier APIs credentials.`,
        true
      );
    }
  }
}

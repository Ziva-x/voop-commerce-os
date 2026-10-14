import { prisma } from "../prisma";
import {
  VoopShipmentStatus,
  normalizeCourierStatus,
  normalizeCourierShipmentStatus,
  canAdvanceStatus,
  isValidEventTimestamp,
} from "./couriers/statusNormalization";

export type NormalizedTrackingStatus =
  | VoopShipmentStatus
  | "CANCELLED"
  | "CANCELLED_PRE_DISPATCH"
  | "DISPATCHED"
  | "IN-TRANSIT"
  | "OUT-FOR-DELIVERY";

export interface NormalizedTrackingResult {
  awb: string;
  orderNumber?: string | null;
  customerName?: string | null;
  amount?: number;
  payment?: string;
  normalizedStatus: NormalizedTrackingStatus;
  rawStatus: string;
  statusType?: string | null;
  statusLocation?: string | null;
  statusTimestamp?: Date | null;
  statusInstructions?: string | null;
  pickupDate?: Date | null;
  etdDate?: Date | null;
  deliveryDate?: Date | null;
  rtoDate?: Date | null;
  ndrStatus?: string | null;
  outwardScanned?: boolean;
  outwardScannedAt?: Date | null;
  rtoInwardScanned?: boolean;
  rtoInwardScannedAt?: Date | null;
  rtoDiscrepancy?: boolean;
  scans: Array<{
    id?: string;
    status: string;
    statusType?: string | null;
    location?: string | null;
    instructions?: string | null;
    nslCode?: string | null;
    timestamp: string | Date;
  }>;
  lastSyncedAt?: Date | null;
}

export class DelhiveryService {
  /**
   * Get Delhivery integration settings for a store
   */
  static async getConfig(storeId: string) {
    if (!storeId) return null;
    let config = await prisma.delhiveryConfig.findUnique({ where: { storeId } });
    if (!config) {
      const storeExists = await prisma.shopifyStore.findUnique({ where: { id: storeId }, select: { id: true } });
      if (!storeExists) return null;

      try {
        config = await prisma.delhiveryConfig.create({
          data: {
            storeId,
            clientName: "MonkeyGarage",
            warehousePin: "680519",
            mode: "PRODUCTION",
            apiToken: process.env.DELHIVERY_API_TOKEN || "",
            isActive: true,
          },
        });
      } catch (_) {
        return null;
      }
    }
    return config;
  }

  /**
   * Save Delhivery configuration for a store
   */
  static async saveConfig(storeId: string, data: {
    apiToken: string;
    clientName?: string;
    warehousePin?: string;
    mode?: string;
    isActive?: boolean;
  }) {
    return prisma.delhiveryConfig.upsert({
      where: { storeId },
      create: {
        storeId,
        apiToken: data.apiToken,
        clientName: data.clientName || "MonkeyGarage",
        warehousePin: data.warehousePin || "680519",
        mode: data.mode || "PRODUCTION",
        isActive: data.isActive ?? true,
      },
      update: {
        apiToken: data.apiToken,
        clientName: data.clientName || "MonkeyGarage",
        warehousePin: data.warehousePin || "680519",
        mode: data.mode || "PRODUCTION",
        isActive: data.isActive ?? true,
      },
    });
  }

  /**
   * Normalization layer: maps Delhivery raw status and codes into VOOP normalized status
   */
  static normalizeStatus(
    rawStatus: string = "",
    statusType: string = "",
    instructions: string = "",
    scans: any[] = []
  ): {
    normalizedStatus: NormalizedTrackingStatus;
    displayStatus: string;
  } {
    const result = normalizeCourierStatus(rawStatus, statusType, instructions, scans);
    return {
      normalizedStatus: result.normalizedStatus,
      displayStatus: result.displayStatus,
    };
  }


  /**
   * Fetch tracking info for a single AWB, with 15-minute caching and storeId scoping
   */
  static async fetchTracking(storeId: string, awb: string, forceRefresh = false): Promise<NormalizedTrackingResult | null> {
    const rawClean = awb.trim().replace("#", "");
    const match = rawClean.match(/\d{10,18}/);
    const cleanAwb = match ? match[0] : rawClean.split(/\s+/)[0];
    if (!cleanAwb) return null;

    // Check cached data if not force refresh
    const existingShipment = await prisma.shipment.findFirst({
      where: { storeId, awb: cleanAwb },
      include: {
        scans: {
          orderBy: { timestamp: "desc" },
        },
      },
    });

    const isFresh =
      existingShipment?.lastSyncedAt &&
      Date.now() - new Date(existingShipment.lastSyncedAt).getTime() < 15 * 60 * 1000; // 15 mins cache

    if (!forceRefresh && isFresh && existingShipment && existingShipment.scans.length > 0) {
      return {
        awb: existingShipment.awb,
        orderNumber: existingShipment.orderNumber,
        customerName: existingShipment.customerName,
        amount: existingShipment.amount || 0,
        payment: existingShipment.payment || "Prepaid",
        normalizedStatus: (existingShipment.normalizedStatus as any) || "MANIFESTED",
        rawStatus: existingShipment.rawStatus || existingShipment.status || "Manifested",
        statusType: existingShipment.statusType,
        statusLocation: existingShipment.statusLocation,
        statusTimestamp: existingShipment.statusTimestamp,
        statusInstructions: existingShipment.statusInstructions,
        pickupDate: existingShipment.pickupDate,
        etdDate: existingShipment.etdDate,
        deliveryDate: existingShipment.deliveryDate,
        rtoDate: existingShipment.rtoDate,
        ndrStatus: existingShipment.ndrStatus,
        outwardScanned: existingShipment.outwardScanned,
        outwardScannedAt: existingShipment.outwardScannedAt,
        rtoInwardScanned: existingShipment.rtoInwardScanned,
        rtoInwardScannedAt: existingShipment.rtoInwardScannedAt,
        rtoDiscrepancy: existingShipment.rtoDiscrepancy,
        scans: existingShipment.scans.map((s) => ({
          id: s.id,
          status: s.status,
          statusType: s.statusType,
          location: s.location,
          instructions: s.instructions,
          nslCode: s.nslCode,
          timestamp: s.timestamp,
        })),
        lastSyncedAt: existingShipment.lastSyncedAt,
      };
    }

    // Call live Delhivery API
    const config = await this.getConfig(storeId);
    const token = config?.apiToken || process.env.DELHIVERY_API_TOKEN || "";
    const baseUrl = config?.mode === "STAGING"
      ? "https://staging-express.delhivery.com/api/v1/packages/json/"
      : "https://track.delhivery.com/api/v1/packages/json/";

    const url = `${baseUrl}?waybill=${cleanAwb}&token=${token}`;

    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        Authorization: `Token ${token}`,
      },
    });

    if (!res.ok) {
      throw new Error(`Delhivery API returned HTTP ${res.status}`);
    }

    const data = await res.json();
    const shipmentData = data?.ShipmentData?.[0]?.Shipment;

    if (!shipmentData) {
      if (existingShipment) {
        return {
          awb: existingShipment.awb,
          orderNumber: existingShipment.orderNumber,
          customerName: existingShipment.customerName,
          amount: existingShipment.amount || 0,
          payment: existingShipment.payment || "Prepaid",
          normalizedStatus: (existingShipment.normalizedStatus as any) || "MANIFESTED",
          rawStatus: existingShipment.rawStatus || existingShipment.status || "Manifested",
          scans: [],
          lastSyncedAt: existingShipment.lastSyncedAt,
        };
      }
      return null;
    }

    // Extract fields
    const rawStatus = shipmentData.Status?.Status || shipmentData.Status?.Instructions || "Manifested";
    const statusType = shipmentData.Status?.StatusType || null;
    const statusLocation = shipmentData.Status?.StatusLocation || null;
    const statusInstructions = shipmentData.Status?.Instructions || null;
    const statusTimestamp = shipmentData.Status?.StatusDateTime ? new Date(shipmentData.Status.StatusDateTime) : null;
    const pickupDate = shipmentData.PickUpDate ? new Date(shipmentData.PickUpDate) : null;
    const etdDate = shipmentData.ExpectedDeliveryDate ? new Date(shipmentData.ExpectedDeliveryDate) : null;
    const deliveryDate = shipmentData.DeliveryDate ? new Date(shipmentData.DeliveryDate) : null;
    const canonicalOrderNumber =
      existingShipment?.shopifyOrderName ||
      (existingShipment?.shopifyOrderNumber ? `#${existingShipment.shopifyOrderNumber}` : null) ||
      existingShipment?.orderNumber ||
      shipmentData.ReferenceNo ||
      null;
    const orderNumber = canonicalOrderNumber;
    const payment = shipmentData.OrderType || existingShipment?.payment || "Prepaid";

    const rawScans = shipmentData.Scans || [];
    // 1. Filter out future-dated events and parse valid scans chronologically
    const validScans = rawScans
      .map((item: any) => item.ScanDetail || item)
      .filter((s: any) => s && s.ScanDateTime && isValidEventTimestamp(s.ScanDateTime))
      .sort((a: any, b: any) => new Date(a.ScanDateTime).getTime() - new Date(b.ScanDateTime).getTime());

    // 2. Check for actual physical pickup scan
    const physicalPickupScan = validScans.find((s: any) => {
      const st = ((s.ScanType || s.statusType || "") as string).toUpperCase();
      const txt = `${s.Scan || s.status || ""} ${s.Instructions || s.instructions || ""}`.toUpperCase();
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

    const actualPickupTimestamp = physicalPickupScan?.ScanDateTime ? new Date(physicalPickupScan.ScanDateTime) : null;
    const scheduledPickupDate = pickupDate; // Delhivery PickUpDate is scheduled pickup window
    const effectivePickupDate = actualPickupTimestamp || scheduledPickupDate || existingShipment?.pickupDate || null;

    // 3. Resolve latest authoritative scan event vs top level status
    const latestScan = validScans.length > 0 ? validScans[validScans.length - 1] : null;
    const isTopLevelValid = isValidEventTimestamp(shipmentData.Status?.StatusDateTime);

    let authoritativeStatus = rawStatus;
    let authoritativeType = statusType || "";
    let authoritativeInstructions = statusInstructions || "";
    let authoritativeTimestamp = isTopLevelValid ? statusTimestamp : null;
    let authoritativeLocation = statusLocation;

    if (latestScan) {
      const scanTime = new Date(latestScan.ScanDateTime);
      if (!authoritativeTimestamp || scanTime.getTime() > authoritativeTimestamp.getTime()) {
        authoritativeStatus = latestScan.Scan || latestScan.Instructions || authoritativeStatus;
        authoritativeType = latestScan.ScanType || authoritativeType;
        authoritativeInstructions = latestScan.Instructions || authoritativeInstructions;
        authoritativeTimestamp = scanTime;
        authoritativeLocation = latestScan.ScannedLocation || authoritativeLocation;
      }
    }

    let { normalizedStatus, displayStatus } = this.normalizeStatus(
      authoritativeStatus,
      authoritativeType,
      authoritativeInstructions,
      validScans
    );

    // If no physical pickup scan yet, status CANNOT be IN_TRANSIT
    if (!physicalPickupScan && (normalizedStatus === "IN_TRANSIT" || (normalizedStatus as any) === "PICKUP_COMPLETED" || (normalizedStatus as any) === "PICKED_UP" || (normalizedStatus as any) === "DISPATCHED")) {
      normalizedStatus = "AWB_GENERATED";
      const isTransitWord = displayStatus.toUpperCase().includes("TRANSIT") || displayStatus.toUpperCase().includes("DISPATCH") || displayStatus.toUpperCase().includes("PICKED");
      if (isTransitWord) {
        displayStatus = "Pickup Pending";
      }
    }

    // 4. Status Progression Guard against existing shipment in DB
    if (existingShipment) {
      const canAdvance = canAdvanceStatus(
        existingShipment.normalizedStatus,
        normalizedStatus,
        existingShipment.statusTimestamp,
        authoritativeTimestamp
      );

      if (!canAdvance) {
        normalizedStatus = (existingShipment.normalizedStatus as any) || normalizedStatus;
        displayStatus = existingShipment.status || displayStatus;
        if (existingShipment.statusTimestamp) {
          authoritativeTimestamp = existingShipment.statusTimestamp;
        }
      }
    }

    // Check if associated Shopify order is cancelled before dispatch
    if (orderNumber) {
      try {
        const cleanNum = orderNumber.replace(/^#+/, "");
        const linkedOrder = await prisma.shopifyOrder.findFirst({
          where: {
            storeId,
            AND: [
              {
                OR: [
                  { orderNumber: cleanNum },
                  { orderNumber: `#${cleanNum}` },
                  { name: cleanNum },
                  { name: `#${cleanNum}` },
                ],
              },
              {
                OR: [
                  { cancelledAt: { not: null } },
                  { financialStatus: "VOIDED" },
                  { financialStatus: "CANCELLED" },
                ],
              },
            ],
          },
        });

        if (linkedOrder && !(existingShipment?.outwardScanned || false) && normalizedStatus !== "DELIVERED") {
          normalizedStatus = "CANCELLED_PRE_DISPATCH";
          displayStatus = "Cancelled";
        }
      } catch (checkErr) {
        // Non-blocking
      }
    }

    const rtoDate = (normalizedStatus === "RTO" || normalizedStatus === "RTO_DELIVERED") && authoritativeTimestamp ? authoritativeTimestamp : existingShipment?.rtoDate || null;

    // Check RTO Discrepancy
    const isRtoDelivered = normalizedStatus === "RTO_DELIVERED" || (rawStatus.toUpperCase().includes("DELIVERED") && normalizedStatus === "RTO") || statusType === "RT-DL";
    const rtoDiscrepancy = isRtoDelivered && !(existingShipment?.rtoInwardScanned || false);

    // Extract customer details from Delhivery payload or fallback to existing record
    const consignee = shipmentData.Consignee || {};
    let customerName = consignee.Name || shipmentData.Name || existingShipment?.customerName || null;
    let customerPhone = consignee.Phone || shipmentData.Phone || existingShipment?.customerPhone || null;

    // If customer details missing, look up from linked Shopify order
    if (orderNumber && (!customerName || !customerPhone)) {
      try {
        const cleanNum = orderNumber.replace(/^#+/, "");
        const linkedOrder = await prisma.shopifyOrder.findFirst({
          where: {
            storeId,
            OR: [
              { orderNumber: cleanNum },
              { orderNumber: `#${cleanNum}` },
              { name: cleanNum },
              { name: `#${cleanNum}` },
            ],
          },
          select: { phone: true, shippingAddress: true },
        });

        if (linkedOrder) {
          if (!customerPhone && linkedOrder.phone) customerPhone = linkedOrder.phone;
          if (!customerName && linkedOrder.shippingAddress) {
            try {
              const addr = JSON.parse(linkedOrder.shippingAddress);
              if (addr.name) customerName = addr.name;
              else if (addr.firstName) customerName = `${addr.firstName} ${addr.lastName || ""}`.trim();
              if (!customerPhone && addr.phone) customerPhone = addr.phone;
            } catch {}
          }
        }
      } catch (e) {}
    }

    const ndrStatus = null;

    // Save Shipment record
    const updatedShipment = await prisma.shipment.upsert({
      where: { storeId_awb: { storeId, awb: cleanAwb } },
      create: {
        storeId,
        awb: cleanAwb,
        orderNumber,
        customerName: customerName || undefined,
        customerPhone: customerPhone || undefined,
        status: displayStatus,
        normalizedStatus,
        rawStatus: authoritativeStatus,
        statusType: authoritativeType || null,
        statusLocation: authoritativeLocation || null,
        statusTimestamp: authoritativeTimestamp || null,
        statusInstructions: authoritativeInstructions || null,
        pickupDate: effectivePickupDate,
        etdDate,
        deliveryDate,
        rtoDate,
        payment,
        rtoDiscrepancy,
        ndrStatus,
        rawTrackingPayload: JSON.stringify(shipmentData),
        lastSyncedAt: new Date(),
      },
      update: {
        orderNumber: existingShipment?.shopifyOrderName || existingShipment?.orderNumber || canonicalOrderNumber || undefined,
        customerName: customerName || undefined,
        customerPhone: customerPhone || undefined,
        status: displayStatus,
        normalizedStatus,
        rawStatus: authoritativeStatus,
        statusType: authoritativeType || null,
        statusLocation: authoritativeLocation || null,
        statusTimestamp: authoritativeTimestamp || null,
        statusInstructions: authoritativeInstructions || null,
        pickupDate: effectivePickupDate || undefined,
        etdDate: etdDate || undefined,
        deliveryDate: deliveryDate || undefined,
        rtoDate: rtoDate || undefined,
        payment: payment || undefined,
        rtoDiscrepancy,
        ndrStatus,
        rawTrackingPayload: JSON.stringify(shipmentData),
        lastSyncedAt: new Date(),
      },
    });

    // Save Scans with unique de-duplication (filter future scans)
    const createdScans: any[] = [];

    for (const scanItem of rawScans) {
      const s = scanItem.ScanDetail;
      if (!s || !s.ScanDateTime || !isValidEventTimestamp(s.ScanDateTime)) continue;

      const scanTime = new Date(s.ScanDateTime);
      const scanStatus = s.Scan || s.Instructions || "Scan";
      const scanLocation = s.ScannedLocation || "";

      try {
        const scanRecord = await prisma.shipmentScan.upsert({
          where: {
            storeId_awb_timestamp_status_location: {
              storeId,
              awb: cleanAwb,
              timestamp: scanTime,
              status: scanStatus,
              location: scanLocation,
            },
          },
          create: {
            storeId,
            shipmentId: updatedShipment.id,
            awb: cleanAwb,
            status: scanStatus,
            statusType: s.ScanType || null,
            location: scanLocation,
            instructions: s.Instructions || null,
            nslCode: s.StatusCode || s.NSLCode || null,
            timestamp: scanTime,
            rawPayload: JSON.stringify(s),
          },
          update: {
            statusType: s.ScanType || null,
            instructions: s.Instructions || null,
            nslCode: s.StatusCode || s.NSLCode || null,
          },
        });
        createdScans.push(scanRecord);
      } catch (scanErr) {
        // Non-blocking scan errors
      }
    }

    // Also update Shopify Order delivery status and ETD if matching order exists
    if (orderNumber) {
      await prisma.shopifyOrder.updateMany({
        where: {
          storeId,
          OR: [
            { orderNumber: orderNumber.replace("#", "") },
            { name: orderNumber },
            { name: `#${orderNumber.replace("#", "")}` },
          ],
        },
        data: {
          deliveryStatus: normalizedStatus,
          pickupDate: pickupDate || undefined,
          etdDate: etdDate || undefined,
        },
      });
    }

    if (normalizedStatus === "DELIVERED") {
      // Mark offline orders as PAID
      await prisma.offlineOrder.updateMany({
        where: {
          storeId,
          trackingNumber: cleanAwb,
          paymentStatus: { in: ["PENDING", "PARTIAL"] }
        },
        data: {
          paymentStatus: "PAID"
        }
      });

      // Mark Shopify Orders as PAID (e.g. for Partial COD)
      if (updatedShipment.shopifyOrderId) {
        await prisma.shopifyOrder.updateMany({
          where: {
            storeId,
            shopifyOrderId: updatedShipment.shopifyOrderId,
            financialStatus: { not: "PAID" }
          },
          data: {
            financialStatus: "PAID"
          }
        });
      }
    }

    return {
      awb: cleanAwb,
      orderNumber: updatedShipment.orderNumber,
      customerName: updatedShipment.customerName,
      amount: updatedShipment.amount || 0,
      payment: updatedShipment.payment || "Prepaid",
      normalizedStatus: (updatedShipment.normalizedStatus as any) || normalizedStatus,
      rawStatus,
      statusType,
      statusLocation,
      statusTimestamp,
      statusInstructions,
      pickupDate,
      etdDate,
      deliveryDate,
      rtoDate,
      ndrStatus: updatedShipment.ndrStatus,
      outwardScanned: updatedShipment.outwardScanned,
      outwardScannedAt: updatedShipment.outwardScannedAt,
      rtoInwardScanned: updatedShipment.rtoInwardScanned,
      rtoInwardScannedAt: updatedShipment.rtoInwardScannedAt,
      rtoDiscrepancy,
      scans: createdScans
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .map((s) => ({
          id: s.id,
          status: s.status,
          statusType: s.statusType,
          location: s.location,
          instructions: s.instructions,
          nslCode: s.nslCode,
          timestamp: s.timestamp,
        })),
      lastSyncedAt: updatedShipment.lastSyncedAt,
    };
  }

  /**
   * Batch synchronization: fetches tracking for multiple AWBs in chunks of 25
   */
  static async syncBatchTracking(storeId: string, awbs: string[]): Promise<{
    total: number;
    synced: number;
    errors: number;
  }> {
    const uniqueAwbs = Array.from(new Set(awbs.map((a) => a.trim().replace("#", "")).filter(Boolean)));
    let synced = 0;
    let errors = 0;

    const chunkSize = 25;
    for (let i = 0; i < uniqueAwbs.length; i += chunkSize) {
      const chunk = uniqueAwbs.slice(i, i + chunkSize);
      const waybills = chunk.join(",");

      try {
        const config = await this.getConfig(storeId);
        const token = config?.apiToken || process.env.DELHIVERY_API_TOKEN || "";
        const url = `https://track.delhivery.com/api/v1/packages/json/?waybill=${waybills}&token=${token}`;

        const res = await fetch(url, {
          headers: {
            Accept: "application/json",
            Authorization: `Token ${token}`,
          },
        });

        if (res.ok) {
          const data = await res.json();
          const list = data?.ShipmentData || [];

          for (const item of list) {
            const s = item.Shipment;
            if (!s || !s.AWB) continue;

            const awb = s.AWB;
            const existingShipment = await prisma.shipment.findUnique({
              where: { storeId_awb: { storeId, awb } },
            });
            const rawStatus = s.Status?.Status || s.Status?.Instructions || "Manifested";
            const statusType = s.Status?.StatusType || null;
            const statusLocation = s.Status?.StatusLocation || null;
            const statusInstructions = s.Status?.Instructions || null;
            const statusTimestamp = s.Status?.StatusDateTime ? new Date(s.Status.StatusDateTime) : null;
            const pickupDate = s.PickUpDate ? new Date(s.PickUpDate) : null;
            const etdDate = s.ExpectedDeliveryDate ? new Date(s.ExpectedDeliveryDate) : null;
            const deliveryDate = s.DeliveryDate ? new Date(s.DeliveryDate) : null;
            const canonicalOrderNumber =
              existingShipment?.shopifyOrderName ||
              (existingShipment?.shopifyOrderNumber ? `#${existingShipment.shopifyOrderNumber}` : null) ||
              existingShipment?.orderNumber ||
              s.ReferenceNo ||
              null;
            const orderNumber = canonicalOrderNumber;
            const payment = s.OrderType || "Prepaid";

            const rawBatchScans = s.Scans || [];
            // 1. Filter out future-dated events and sort valid scans chronologically
            const validBatchScans = rawBatchScans
              .map((x: any) => x.ScanDetail || x)
              .filter((sc: any) => sc && sc.ScanDateTime && isValidEventTimestamp(sc.ScanDateTime))
              .sort((a: any, b: any) => new Date(a.ScanDateTime).getTime() - new Date(b.ScanDateTime).getTime());

            // 2. Check for physical pickup scan
            const physicalPickupScan = validBatchScans.find((sc: any) => {
              const st = ((sc.ScanType || sc.statusType || "") as string).toUpperCase();
              const txt = `${sc.Scan || sc.status || ""} ${sc.Instructions || sc.instructions || ""}`.toUpperCase();
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

            const actualPickupTimestamp = physicalPickupScan?.ScanDateTime ? new Date(physicalPickupScan.ScanDateTime) : null;
            const effectivePickupDate = actualPickupTimestamp || pickupDate || existingShipment?.pickupDate || null;

            // 3. Resolve latest authoritative scan event vs top level status
            const latestScan = validBatchScans.length > 0 ? validBatchScans[validBatchScans.length - 1] : null;
            const isTopLevelValid = isValidEventTimestamp(s.Status?.StatusDateTime);

            let authoritativeStatus = rawStatus;
            let authoritativeType = statusType || "";
            let authoritativeInstructions = statusInstructions || "";
            let authoritativeTimestamp = isTopLevelValid ? statusTimestamp : null;
            let authoritativeLocation = statusLocation;

            if (latestScan) {
              const scanTime = new Date(latestScan.ScanDateTime);
              if (!authoritativeTimestamp || scanTime.getTime() > authoritativeTimestamp.getTime()) {
                authoritativeStatus = latestScan.Scan || latestScan.Instructions || authoritativeStatus;
                authoritativeType = latestScan.ScanType || authoritativeType;
                authoritativeInstructions = latestScan.Instructions || authoritativeInstructions;
                authoritativeTimestamp = scanTime;
                authoritativeLocation = latestScan.ScannedLocation || authoritativeLocation;
              }
            }

            let { normalizedStatus, displayStatus } = this.normalizeStatus(
              authoritativeStatus,
              authoritativeType,
              authoritativeInstructions,
              validBatchScans
            );

            // If no physical pickup scan yet, status CANNOT be IN_TRANSIT
            if (!physicalPickupScan && (normalizedStatus === "IN_TRANSIT" || (normalizedStatus as any) === "PICKUP_COMPLETED" || (normalizedStatus as any) === "PICKED_UP" || (normalizedStatus as any) === "DISPATCHED")) {
              normalizedStatus = "AWB_GENERATED";
              const isTransitWord = displayStatus.toUpperCase().includes("TRANSIT") || displayStatus.toUpperCase().includes("DISPATCH") || displayStatus.toUpperCase().includes("PICKED");
              if (isTransitWord) {
                displayStatus = "Pickup Pending";
              }
            }

            // 4. Status Progression Guard against existing shipment in DB
            if (existingShipment) {
              const canAdvance = canAdvanceStatus(
                existingShipment.normalizedStatus,
                normalizedStatus,
                existingShipment.statusTimestamp,
                authoritativeTimestamp
              );

              if (!canAdvance) {
                normalizedStatus = (existingShipment.normalizedStatus as any) || normalizedStatus;
                displayStatus = existingShipment.status || displayStatus;
                if (existingShipment.statusTimestamp) {
                  authoritativeTimestamp = existingShipment.statusTimestamp;
                }
              }
            }

            // Check if linked order was cancelled before dispatch
            if (orderNumber) {
              try {
                const cleanNum = orderNumber.replace(/^#+/, "");
                const linkedOrder = await prisma.shopifyOrder.findFirst({
                  where: {
                    storeId,
                    AND: [
                      {
                        OR: [
                          { orderNumber: cleanNum },
                          { orderNumber: `#${cleanNum}` },
                          { name: cleanNum },
                          { name: `#${cleanNum}` },
                        ],
                      },
                      {
                        OR: [
                          { cancelledAt: { not: null } },
                          { financialStatus: "VOIDED" },
                          { financialStatus: "CANCELLED" },
                        ],
                      },
                    ],
                  },
                });

                if (linkedOrder && normalizedStatus !== "DELIVERED") {
                  normalizedStatus = "CANCELLED_PRE_DISPATCH";
                  displayStatus = "Cancelled";
                }
              } catch (batchOrderErr) {
                // non-blocking
              }
            }

            // Extract customer details from payload or linked order
            const consignee = s.Consignee || {};
            let customerName = consignee.Name || s.Name || null;
            let customerPhone = consignee.Phone || s.Phone || null;

            if (orderNumber && (!customerName || !customerPhone)) {
              try {
                const cleanNum = orderNumber.replace(/^#+/, "");
                const linkedOrder = await prisma.shopifyOrder.findFirst({
                  where: {
                    storeId,
                    OR: [
                      { orderNumber: cleanNum },
                      { orderNumber: `#${cleanNum}` },
                      { name: cleanNum },
                      { name: `#${cleanNum}` },
                    ],
                  },
                  select: { phone: true, shippingAddress: true },
                });

                if (linkedOrder) {
                  if (!customerPhone && linkedOrder.phone) customerPhone = linkedOrder.phone;
                  if (!customerName && linkedOrder.shippingAddress) {
                    try {
                      const addr = JSON.parse(linkedOrder.shippingAddress);
                      if (addr.name) customerName = addr.name;
                      else if (addr.firstName) customerName = `${addr.firstName} ${addr.lastName || ""}`.trim();
                      if (!customerPhone && addr.phone) customerPhone = addr.phone;
                    } catch {}
                  }
                }
              } catch (e) {}
            }

            const ndrStatus = null;

            const upsertedShipment = await prisma.shipment.upsert({
              where: { storeId_awb: { storeId, awb } },
              create: {
                storeId,
                awb,
                orderNumber,
                customerName: customerName || undefined,
                customerPhone: customerPhone || undefined,
                status: displayStatus,
                normalizedStatus,
                rawStatus: authoritativeStatus,
                statusType: authoritativeType || null,
                statusLocation: authoritativeLocation || null,
                statusTimestamp: authoritativeTimestamp || null,
                statusInstructions: authoritativeInstructions || null,
                pickupDate: effectivePickupDate,
                etdDate,
                deliveryDate,
                payment,
                ndrStatus,
                rawTrackingPayload: JSON.stringify(s),
                lastSyncedAt: new Date(),
              },
              update: {
                orderNumber: existingShipment?.shopifyOrderName || existingShipment?.orderNumber || canonicalOrderNumber || undefined,
                customerName: customerName || undefined,
                customerPhone: customerPhone || undefined,
                status: displayStatus,
                normalizedStatus,
                rawStatus: authoritativeStatus,
                statusType: authoritativeType || null,
                statusLocation: authoritativeLocation || null,
                statusTimestamp: authoritativeTimestamp || null,
                statusInstructions: authoritativeInstructions || null,
                pickupDate: effectivePickupDate || undefined,
                etdDate: etdDate || undefined,
                deliveryDate: deliveryDate || undefined,
                payment: payment || undefined,
                ndrStatus,
                rawTrackingPayload: JSON.stringify(s),
                lastSyncedAt: new Date(),
              },
            });

            // Upsert scans (filter future scans)
            for (const scanItem of s.Scans || []) {
              const sc = scanItem.ScanDetail;
              if (!sc || !sc.ScanDateTime || !isValidEventTimestamp(sc.ScanDateTime)) continue;

              const scanTime = new Date(sc.ScanDateTime);
              const scanStatus = sc.Scan || sc.Instructions || "Scan";
              const scanLocation = sc.ScannedLocation || "";

              try {
                await prisma.shipmentScan.upsert({
                  where: {
                    storeId_awb_timestamp_status_location: {
                      storeId,
                      awb,
                      timestamp: scanTime,
                      status: scanStatus,
                      location: scanLocation,
                    },
                  },
                  create: {
                    storeId,
                    shipmentId: upsertedShipment.id,
                    awb,
                    status: scanStatus,
                    statusType: sc.ScanType || null,
                    location: scanLocation,
                    instructions: sc.Instructions || null,
                    nslCode: sc.StatusCode || sc.NSLCode || null,
                    timestamp: scanTime,
                    rawPayload: JSON.stringify(sc),
                  },
                  update: {
                    statusType: sc.ScanType || null,
                    instructions: sc.Instructions || null,
                    nslCode: sc.StatusCode || sc.NSLCode || null,
                  },
                });
              } catch (scanErr) {
                // Non-blocking
              }
            }

            if (normalizedStatus === "DELIVERED") {
              // Mark offline orders as PAID
              await prisma.offlineOrder.updateMany({
                where: {
                  storeId,
                  trackingNumber: awb,
                  paymentStatus: { in: ["PENDING", "PARTIAL"] }
                },
                data: {
                  paymentStatus: "PAID"
                }
              });

              // Mark Shopify Orders as PAID (e.g. for Partial COD)
              if (upsertedShipment.shopifyOrderId) {
                await prisma.shopifyOrder.updateMany({
                  where: {
                    storeId,
                    shopifyOrderId: upsertedShipment.shopifyOrderId,
                    financialStatus: { not: "PAID" }
                  },
                  data: {
                    financialStatus: "PAID"
                  }
                });
              }
            }

            synced++;
          }
        } else {
          errors += chunk.length;
        }
      } catch {
        errors += chunk.length;
      }
    }

    return { total: uniqueAwbs.length, synced, errors };
  }
}

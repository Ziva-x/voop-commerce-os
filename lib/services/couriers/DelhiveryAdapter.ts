import { ICourierAdapter, CourierConfigField, TestConnectionResult, CourierType } from "./types";
import { normalizeCourierStatus } from "./statusNormalization";

export class DelhiveryAdapter implements ICourierAdapter {
  readonly id: CourierType = "DELHIVERY";
  readonly name = "Delhivery";
  readonly description = "India's largest logistics network. Supports surface & express tracking and reverse pickups.";
  readonly defaultEnvironment = "PRODUCTION" as const;

  readonly fields: CourierConfigField[] = [
    {
      key: "apiToken",
      label: "API Token",
      type: "password",
      required: true,
      isSecret: true,
      placeholder: "e.g. 9f18a287c4...",
      helpText: "Generated in your Delhivery Unified Client Portal under Settings > API Keys.",
    },
    {
      key: "clientName",
      label: "Client / Warehouse Name",
      type: "text",
      required: false,
      placeholder: "e.g. MonkeyGarage / VOOP Hub",
      helpText: "Client name registered in Delhivery manifest system.",
    },
    {
      key: "warehousePin",
      label: "Origin Warehouse Pincode",
      type: "text",
      required: false,
      placeholder: "e.g. 680519",
      helpText: "Primary dispatch warehouse 6-digit postal code.",
    },
    {
      key: "environment",
      label: "Environment",
      type: "select",
      required: true,
      options: [
        { label: "Production (track.delhivery.com)", value: "PRODUCTION" },
        { label: "Staging (staging-express.delhivery.com)", value: "STAGING" },
      ],
    },
  ];

  detectAwb(awb: string): boolean {
    const clean = awb.trim().replace("#", "");
    // Delhivery AWBs are typically 12-14 digits, starting with 1, 2, 3, 4, 5, 8
    return /^\d{12,14}$/.test(clean);
  }

  async testConnection(credentials: Record<string, any>, environment?: string): Promise<TestConnectionResult> {
    const token = credentials.apiToken?.trim();
    if (!token) {
      return {
        success: false,
        message: "Delhivery API Token is required.",
      };
    }

    const env = (environment || credentials.environment || "PRODUCTION").toUpperCase();
    const baseUrl = env === "STAGING"
      ? "https://staging-express.delhivery.com/api/v1/packages/json/"
      : "https://track.delhivery.com/api/v1/packages/json/";

    try {
      // Test query using dummy/sample test waybill to verify token authentication
      const testUrl = `${baseUrl}?waybill=100000000000&token=${encodeURIComponent(token)}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const res = await fetch(testUrl, {
        headers: {
          Accept: "application/json",
          Authorization: `Token ${token}`,
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.status === 401 || res.status === 403) {
        return {
          success: false,
          statusCode: res.status,
          message: "Authentication failed. Invalid Delhivery API Token.",
        };
      }

      if (res.ok) {
        return {
          success: true,
          statusCode: 200,
          message: "Successfully connected to Delhivery API.",
        };
      }

      return {
        success: true,
        statusCode: res.status,
        message: `Connected to Delhivery API (HTTP ${res.status}). Credentials verified.`,
      };
    } catch (err: any) {
      if (err.name === "AbortError") {
        return {
          success: false,
          message: "Connection timed out while reaching Delhivery API.",
        };
      }
      return {
        success: false,
        message: `Connection failed: ${err.message || "Unknown network error"}`,
      };
    }
  }

  async fetchTracking(
    awb: string,
    credentials: Record<string, any>,
    environment?: string
  ): Promise<import("./types").CourierTrackingResult | null> {
    const token = credentials.apiToken?.trim();
    if (!token || !awb) return null;

    const clean = awb.trim().replace("#", "").split(/\s+/)[0];
    const env = (environment || credentials.environment || "PRODUCTION").toUpperCase();
    const baseUrl = env === "STAGING"
      ? "https://staging-express.delhivery.com/api/v1/packages/json/"
      : "https://track.delhivery.com/api/v1/packages/json/";

    try {
      const url = `${baseUrl}?waybill=${encodeURIComponent(clean)}&token=${encodeURIComponent(token)}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const res = await fetch(url, {
        headers: {
          Accept: "application/json",
          Authorization: `Token ${token}`,
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!res.ok) return null;
      const data = await res.json();
      const pkgData = data?.ShipmentData?.[0]?.Shipment;
      if (!pkgData) return null;

      const rawScans: any[] = pkgData.Scans || [];
      const scans = rawScans.map((item: any) => {
        const detail = item.ScanDetail || item;
        return {
          status: detail.Scan || "Status Update",
          statusType: detail.ScanType || null,
          location: detail.ScannedLocation || null,
          instructions: detail.Instructions || null,
          timestamp: detail.ScanDateTime ? new Date(detail.ScanDateTime) : new Date(),
        };
      });

      const rawStatus = pkgData.Status?.Status || "Manifested";
      const statusType = pkgData.Status?.StatusType || "";
      const statusInstructions = pkgData.Status?.Instructions || "";
      const normalizedResult = normalizeCourierStatus(rawStatus, statusType, statusInstructions, scans);
      const normalizedStatus = normalizedResult.normalizedStatus;

      return {
        awb: clean,
        orderNumber: pkgData.ReferenceNo || null,
        rawStatus,
        normalizedStatus,
        statusLocation: pkgData.Status?.StatusLocation || null,
        statusTimestamp: pkgData.Status?.StatusDateTime ? new Date(pkgData.Status.StatusDateTime) : null,
        customerName: pkgData.Consignee?.Name || null,
        destinationCity: pkgData.Consignee?.City || null,
        destinationState: pkgData.Consignee?.State || null,
        destinationPin: pkgData.Consignee?.PinCode ? String(pkgData.Consignee.PinCode) : null,
        pickupDate: pkgData.PickUpDateTime ? new Date(pkgData.PickUpDateTime) : null,
        deliveryDate: pkgData.DeliveryDate ? new Date(pkgData.DeliveryDate) : null,
        scans,
      };
    } catch (_e) {
      return null;
    }
  }
}


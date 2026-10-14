import { prisma } from "@/lib/prisma";
import { encryptData, decryptData, maskSecret } from "@/lib/crypto-helper";
import { ICourierAdapter, CourierType, TestConnectionResult } from "./types";
import { DelhiveryAdapter } from "./DelhiveryAdapter";
import { BlueDartAdapter } from "./BlueDartAdapter";
import { XpressBeesAdapter } from "./XpressBeesAdapter";
import { EcomExpressAdapter } from "./EcomExpressAdapter";
import { EkartAdapter } from "./EkartAdapter";
import { ShadowfaxAdapter } from "./ShadowfaxAdapter";

export class CourierIntegrationService {
  private static adapters: Map<CourierType, ICourierAdapter> = new Map<CourierType, ICourierAdapter>([
    ["DELHIVERY", new DelhiveryAdapter()],
    ["BLUEDART", new BlueDartAdapter()],
    ["XPRESSBEES", new XpressBeesAdapter()],
    ["ECOM_EXPRESS", new EcomExpressAdapter()],
    ["EKART", new EkartAdapter()],
    ["SHADOWFAX", new ShadowfaxAdapter()],
  ] as Array<[CourierType, ICourierAdapter]>);

  static getAdapters(): ICourierAdapter[] {
    return Array.from(this.adapters.values());
  }

  static getAdapter(courier: string): ICourierAdapter | null {
    const key = courier.toUpperCase().trim() as CourierType;
    return this.adapters.get(key) || null;
  }

  /**
   * Get all 6 courier partner cards with their connection status & masked credentials for a specific store
   */
  static async getAllIntegrations(storeId: string) {
    // 1. Fetch store records to ensure tenant isolation & get permanent voopStoreId
    const store = await prisma.shopifyStore.findUnique({
      where: { id: storeId },
      select: { id: true, voopStoreId: true },
    });

    const voopStoreId = store?.voopStoreId || null;

    // 2. Fetch existing courier integrations for this store
    const existing = await prisma.courierIntegration.findMany({
      where: { storeId },
    });
    const existingMap = new Map<string, any>();
    for (const item of existing) {
      existingMap.set(item.courier.toUpperCase(), item);
    }

    // 3. Check legacy delhiveryConfig table for backward compatibility
    let legacyDelhivery = await prisma.delhiveryConfig.findUnique({
      where: { storeId },
    });

    // 4. Build response for all 6 supported couriers
    const results = [];

    for (const adapter of this.getAdapters()) {
      const courierKey = adapter.id;
      let record = existingMap.get(courierKey);

      // Auto-bridge legacy Delhivery config if no courier_integrations record exists yet
      if (!record && courierKey === "DELHIVERY" && legacyDelhivery && legacyDelhivery.apiToken) {
        try {
          const rawCreds = {
            apiToken: legacyDelhivery.apiToken,
            clientName: legacyDelhivery.clientName || "",
            warehousePin: legacyDelhivery.warehousePin || "",
            environment: legacyDelhivery.mode || "PRODUCTION",
          };
          record = await prisma.courierIntegration.upsert({
            where: { storeId_courier: { storeId, courier: "DELHIVERY" } },
            create: {
              storeId,
              voopStoreId,
              courier: "DELHIVERY",
              status: legacyDelhivery.isActive ? "CONNECTED" : "DISCONNECTED",
              credentialsEncrypted: encryptData(rawCreds),
              environment: legacyDelhivery.mode || "PRODUCTION",
              lastTestedAt: new Date(),
            },
            update: {},
          });
        } catch (e) {
          // non-blocking
        }
      }

      let decryptedCreds: Record<string, any> = {};
      if (record?.credentialsEncrypted) {
        decryptedCreds = decryptData(record.credentialsEncrypted) || {};
      }

      // Build masked credentials to safely return to frontend
      const maskedCredentials: Record<string, any> = {};
      for (const field of adapter.fields) {
        const val = decryptedCreds[field.key] || "";
        if (field.isSecret) {
          maskedCredentials[field.key] = val ? maskSecret(val) : "";
          maskedCredentials[`has_${field.key}`] = !!val;
        } else {
          maskedCredentials[field.key] = val;
        }
      }

      results.push({
        courier: adapter.id,
        name: adapter.name,
        description: adapter.description,
        fields: adapter.fields,
        isConnected: record?.status === "CONNECTED",
        status: record?.status || "NOT_CONNECTED",
        environment: record?.environment || adapter.defaultEnvironment,
        lastTestedAt: record?.lastTestedAt || null,
        lastSuccessfulSyncAt: record?.lastSuccessfulSyncAt || null,
        lastError: record?.lastError || null,
        credentials: maskedCredentials,
      });
    }

    return {
      storeId,
      voopStoreId,
      integrations: results,
    };
  }

  /**
   * Internal helper: Get decrypted credentials for a courier
   */
  static async getDecryptedCredentials(storeId: string, courier: CourierType): Promise<{
    credentials: Record<string, any>;
    environment: string;
    status: string;
  } | null> {
    const record = await prisma.courierIntegration.findUnique({
      where: { storeId_courier: { storeId, courier } },
    });

    if (!record) {
      // Fallback for Delhivery legacy
      if (courier === "DELHIVERY") {
        const legacy = await prisma.delhiveryConfig.findUnique({ where: { storeId } });
        if (legacy && legacy.apiToken) {
          return {
            credentials: {
              apiToken: legacy.apiToken,
              clientName: legacy.clientName,
              warehousePin: legacy.warehousePin,
            },
            environment: legacy.mode || "PRODUCTION",
            status: legacy.isActive ? "CONNECTED" : "DISCONNECTED",
          };
        }
      }
      return null;
    }

    const decrypted = decryptData<Record<string, any>>(record.credentialsEncrypted) || {};
    return {
      credentials: decrypted,
      environment: record.environment,
      status: record.status,
    };
  }

  /**
   * Save or update credentials for a courier
   */
  static async saveIntegration(
    storeId: string,
    courier: CourierType,
    data: {
      credentials: Record<string, any>;
      environment?: string;
      status?: string;
    }
  ) {
    const adapter = this.getAdapter(courier);
    if (!adapter) {
      throw new Error(`Unsupported courier: ${courier}`);
    }

    // Get permanent voopStoreId from store
    const store = await prisma.shopifyStore.findUnique({
      where: { id: storeId },
      select: { id: true, voopStoreId: true },
    });

    // Check existing record to preserve un-edited secrets if user submitted masked values
    const existing = await prisma.courierIntegration.findUnique({
      where: { storeId_courier: { storeId, courier } },
    });
    const existingDecrypted = existing?.credentialsEncrypted
      ? decryptData<Record<string, any>>(existing.credentialsEncrypted) || {}
      : {};

    const mergedCredentials: Record<string, any> = {};
    for (const field of adapter.fields) {
      const incomingVal = data.credentials[field.key];
      if (field.isSecret) {
        // If incoming value is masked (starts with ••••) or empty, keep existing secret
        if (typeof incomingVal === "string" && incomingVal.includes("••••")) {
          mergedCredentials[field.key] = existingDecrypted[field.key] || "";
        } else if (incomingVal !== undefined && incomingVal !== "") {
          mergedCredentials[field.key] = String(incomingVal).trim();
        } else {
          mergedCredentials[field.key] = existingDecrypted[field.key] || "";
        }
      } else {
        mergedCredentials[field.key] = incomingVal !== undefined ? incomingVal : (existingDecrypted[field.key] || "");
      }
    }

    const env = data.environment || mergedCredentials.environment || existing?.environment || adapter.defaultEnvironment;
    const encrypted = encryptData(mergedCredentials);
    const newStatus = data.status || "CONNECTED";

    const saved = await prisma.courierIntegration.upsert({
      where: { storeId_courier: { storeId, courier } },
      create: {
        storeId,
        voopStoreId: store?.voopStoreId || null,
        courier,
        status: newStatus,
        credentialsEncrypted: encrypted,
        environment: env,
        lastError: null,
      },
      update: {
        status: newStatus,
        credentialsEncrypted: encrypted,
        environment: env,
        lastError: null,
      },
    });

    // Dual-sync to DelhiveryConfig table if DELHIVERY
    if (courier === "DELHIVERY" && mergedCredentials.apiToken) {
      try {
        await prisma.delhiveryConfig.upsert({
          where: { storeId },
          create: {
            storeId,
            apiToken: mergedCredentials.apiToken,
            clientName: mergedCredentials.clientName || "MonkeyGarage",
            warehousePin: mergedCredentials.warehousePin || "680519",
            mode: env,
            isActive: newStatus === "CONNECTED",
          },
          update: {
            apiToken: mergedCredentials.apiToken,
            clientName: mergedCredentials.clientName || "MonkeyGarage",
            warehousePin: mergedCredentials.warehousePin || "680519",
            mode: env,
            isActive: newStatus === "CONNECTED",
          },
        });
      } catch (dualErr) {
        console.error("Failed to dual-sync to DelhiveryConfig:", dualErr);
      }
    }

    return {
      success: true,
      courier,
      status: saved.status,
      environment: saved.environment,
    };
  }

  /**
   * Test connection with courier API
   */
  static async testConnection(
    storeId: string,
    courier: CourierType,
    incomingCredentials?: Record<string, any>,
    environment?: string
  ): Promise<TestConnectionResult> {
    const adapter = this.getAdapter(courier);
    if (!adapter) {
      return { success: false, message: `Unsupported courier: ${courier}` };
    }

    // Merge incoming credentials with existing decrypted credentials if masked
    let credsToTest: Record<string, any> = {};
    if (incomingCredentials && Object.keys(incomingCredentials).length > 0) {
      const existing = await this.getDecryptedCredentials(storeId, courier);
      const existingCreds = existing?.credentials || {};
      for (const field of adapter.fields) {
        const val = incomingCredentials[field.key];
        if (field.isSecret && typeof val === "string" && val.includes("••••")) {
          credsToTest[field.key] = existingCreds[field.key] || "";
        } else if (val !== undefined) {
          credsToTest[field.key] = val;
        } else {
          credsToTest[field.key] = existingCreds[field.key] || "";
        }
      }
    } else {
      const existing = await this.getDecryptedCredentials(storeId, courier);
      if (!existing || !existing.credentials) {
        return { success: false, message: "No credentials found to test. Please enter credentials first." };
      }
      credsToTest = existing.credentials;
      if (!environment) environment = existing.environment;
    }

    const result = await adapter.testConnection(credsToTest, environment);

    // Update test timestamp and error status in database
    try {
      await prisma.courierIntegration.updateMany({
        where: { storeId, courier },
        data: {
          lastTestedAt: new Date(),
          lastError: result.success ? null : result.message,
          status: result.success ? "CONNECTED" : "FAILED",
        },
      });
    } catch (dbErr) {
      // Non-blocking
    }

    return result;
  }

  /**
   * Disconnect a courier
   */
  static async disconnect(storeId: string, courier: CourierType) {
    await prisma.courierIntegration.updateMany({
      where: { storeId, courier },
      data: {
        status: "DISCONNECTED",
      },
    });

    if (courier === "DELHIVERY") {
      try {
        await prisma.delhiveryConfig.updateMany({
          where: { storeId },
          data: { isActive: false },
        });
      } catch (e) {
        // non-blocking
      }
    }

    return { success: true };
  }
}

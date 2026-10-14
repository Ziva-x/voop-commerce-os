let PrismaClient;
try {
  PrismaClient = require('../lib/generated/client').PrismaClient;
} catch (e) {
  try {
    PrismaClient = require('@prisma/client').PrismaClient;
  } catch (err) {
    try {
      PrismaClient = require('./lib/generated/client').PrismaClient;
    } catch (e3) {
      console.error("Could not load PrismaClient:", e3);
      process.exit(1);
    }
  }
}

async function main() {
  const prisma = new PrismaClient();
  try {
    console.log("Running pre-migration script for multi-tenancy schema update...");

    // 1. Get active store ID
    let storeId = 'cmtew0g9b0000gabugnwvq7l1';
    try {
      const stores = await prisma.$queryRawUnsafe(`SELECT id FROM shopify_stores LIMIT 1`);
      if (stores && stores.length > 0 && stores[0].id) {
        storeId = stores[0].id;
      }
    } catch (e) {
      console.log("Could not query shopify_stores, fallback to default storeId:", storeId);
    }
    console.log("Using storeId for backfill:", storeId);

    // 2. Ensure pgcrypto extension for random keys
    try {
      await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);
    } catch (e) {
      console.log("pgcrypto notice:", e.message);
    }

    // 2.5 Ensure new multi-tenant and invoice snapshot columns, and fix User.voopStoreId index
    try {
      await prisma.$executeRawUnsafe(`ALTER TABLE users ADD COLUMN IF NOT EXISTS "createdById" TEXT;`);
      await prisma.$executeRawUnsafe(`ALTER TABLE shopify_orders ADD COLUMN IF NOT EXISTS "invoiceCompanySnapshot" TEXT;`);
      await prisma.$executeRawUnsafe(`ALTER TABLE offline_orders ADD COLUMN IF NOT EXISTS "invoiceCompanySnapshot" TEXT;`);
      
      // Ensure canonical Shopify Order identity columns and indexes
      await prisma.$executeRawUnsafe(`ALTER TABLE shopify_orders ADD COLUMN IF NOT EXISTS "shopifyOrderNumber" TEXT;`);
      await prisma.$executeRawUnsafe(`ALTER TABLE shopify_orders ADD COLUMN IF NOT EXISTS "shopifyOrderName" TEXT;`);
      await prisma.$executeRawUnsafe(`ALTER TABLE shopify_orders ADD COLUMN IF NOT EXISTS "shopifyOrderCreatedAt" TIMESTAMP(3);`);
      await prisma.$executeRawUnsafe(`ALTER TABLE shopify_orders ADD COLUMN IF NOT EXISTS "customerName" TEXT;`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "shopify_orders_storeId_shopifyOrderNumber_idx" ON shopify_orders("storeId", "shopifyOrderNumber");`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "shopify_orders_storeId_shopifyOrderName_idx" ON shopify_orders("storeId", "shopifyOrderName");`);

      // Ensure canonical Shipment order identity columns and indexes
      await prisma.$executeRawUnsafe(`ALTER TABLE shipments ADD COLUMN IF NOT EXISTS "shopifyOrderNumber" TEXT;`);
      await prisma.$executeRawUnsafe(`ALTER TABLE shipments ADD COLUMN IF NOT EXISTS "shopifyOrderName" TEXT;`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "shipments_storeId_shopifyOrderNumber_idx" ON shipments("storeId", "shopifyOrderNumber");`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "shipments_storeId_shopifyOrderName_idx" ON shipments("storeId", "shopifyOrderName");`);

      // Reconcile and backfill canonical Shopify order identity for all existing orders
      try {
        const existingOrders = await prisma.shopifyOrder.findMany({
          select: { id: true, shopifyOrderId: true, orderNumber: true, name: true, createdAt: true, rawPayload: true }
        });

        for (const ord of existingOrders) {
          let raw = {};
          try { raw = JSON.parse(ord.rawPayload || "{}"); } catch(e){}
          const sOrderNumber = raw.order_number ? String(raw.order_number) : (ord.orderNumber || "").replace("#", "").trim();
          const sOrderName = String(raw.name || (sOrderNumber ? `#${sOrderNumber}` : `#${ord.shopifyOrderId}`));
          const sCreatedAt = raw.created_at ? new Date(raw.created_at) : ord.createdAt;
          const cName = raw.shipping_address?.name ||
            (raw.customer ? [raw.customer.first_name, raw.customer.last_name].filter(Boolean).join(" ") : null) ||
            raw.customer?.displayName ||
            raw.billing_address?.name ||
            (ord.name && !ord.name.startsWith("#") ? ord.name : null) ||
            "Customer";

          await prisma.shopifyOrder.update({
            where: { id: ord.id },
            data: {
              shopifyOrderNumber: sOrderNumber,
              shopifyOrderName: sOrderName,
              shopifyOrderCreatedAt: sCreatedAt,
              customerName: cName,
              name: sOrderName,
              orderNumber: sOrderNumber,
            }
          });
        }
        console.log(`✓ Reconciled ${existingOrders.length} Shopify order records with canonical identity.`);

        // Reconcile shipments with canonical Shopify order identity
        const updatedShipments = await prisma.$executeRawUnsafe(`
          UPDATE shipments s
          SET "shopifyOrderNumber" = o."shopifyOrderNumber",
              "shopifyOrderName" = o."shopifyOrderName",
              "orderNumber" = o."shopifyOrderName",
              "orderCreatedAt" = COALESCE(o."shopifyOrderCreatedAt", o."createdAt"),
              "customerName" = COALESCE(o."customerName", s."customerName")
          FROM shopify_orders o
          WHERE s."shopifyOrderId" = o."shopifyOrderId";
        `);
        console.log(`✓ Reconciled ${updatedShipments} shipment records with canonical Shopify order names.`);
      } catch (recErr) {
        console.error("Notice during canonical order reconciliation:", recErr.message);
      }
      
      // Drop unique constraint on users(voopStoreId) so staff and admin can share the store's VOOP Store ID
      await prisma.$executeRawUnsafe(`ALTER TABLE users DROP CONSTRAINT IF EXISTS "users_voopStoreId_key";`);
      await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS "users_voopStoreId_key";`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "users_voopStoreId_idx" ON users("voopStoreId");`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "users_storeId_idx" ON users("storeId");`);
      console.log("✓ Dropped unique constraint on users(voopStoreId) and ensured indexes.");

      // Resolve store for staff backfill
      const storeRow = await prisma.shopifyStore.findFirst({
        where: { isConnected: true },
        orderBy: { createdAt: "asc" },
      });
      const activeStoreId = storeRow?.id || storeId;
      const activeVoopStoreId = storeRow?.voopStoreId || '';

      // Backfill any staff users who have missing storeId or voopStoreId
      const staffUpdated = await prisma.$executeRawUnsafe(`
        UPDATE users
        SET "storeId" = '${activeStoreId}',
            "voopStoreId" = '${activeVoopStoreId}'
        WHERE "role" = 'STAFF' AND ("storeId" IS NULL OR "storeId" = '' OR "voopStoreId" IS NULL OR "voopStoreId" = '');
      `);
      console.log(`✓ Backfilled ${staffUpdated} staff user(s) to store: ${activeStoreId}`);

      // Ensure RAM account specifically has the connected store
      const ramUpdated = await prisma.$executeRawUnsafe(`
        UPDATE users
        SET "storeId" = '${activeStoreId}',
            "voopStoreId" = '${activeVoopStoreId}'
        WHERE (LOWER(name) = 'ram' OR LOWER(username) = 'ram' OR LOWER(email) LIKE '%ram%')
          AND ("storeId" IS NULL OR "storeId" = '' OR "voopStoreId" IS NULL OR "voopStoreId" = '');
      `);
      if (ramUpdated > 0) {
        console.log(`✓ Explicitly linked RAM account to store: ${activeStoreId}`);
      }

      // Ensure user_preferences table exists for per-user dark accent themes
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "user_preferences" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "userId" TEXT NOT NULL UNIQUE REFERENCES "users"("id") ON DELETE CASCADE,
          "themeMode" TEXT NOT NULL DEFAULT 'dark',
          "accentTheme" TEXT NOT NULL DEFAULT 'voop',
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE UNIQUE INDEX IF NOT EXISTS "user_preferences_userId_key" ON "user_preferences"("userId");
      `);
      console.log("✓ Ensured user_preferences table exists.");

      // Ensure publicStoreRef column and unique index on shopify_stores
      await prisma.$executeRawUnsafe(`ALTER TABLE shopify_stores ADD COLUMN IF NOT EXISTS "publicStoreRef" TEXT;`);
      await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "shopify_stores_publicStoreRef_key" ON shopify_stores("publicStoreRef");`);

      // Backfill publicStoreRef for any stores that lack one
      const storesWithoutRef = await prisma.$queryRawUnsafe(`SELECT id FROM shopify_stores WHERE "publicStoreRef" IS NULL OR "publicStoreRef" = ''`);
      if (Array.isArray(storesWithoutRef) && storesWithoutRef.length > 0) {
        const crypto = require('crypto');
        const CHARS = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
        for (const s of storesWithoutRef) {
          const bytes = crypto.randomBytes(16);
          let token = "";
          for (let i = 0; i < 15; i++) {
            token += CHARS[bytes[i] % CHARS.length];
          }
          await prisma.$executeRawUnsafe(`UPDATE shopify_stores SET "publicStoreRef" = '${token}' WHERE id = '${s.id}'`);
        }
        console.log(`✓ Backfilled publicStoreRef for ${storesWithoutRef.length} store(s).`);
      }

      // Ensure store_memberships table exists for dynamic N-user, N-store, N-staff multi-tenancy
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "store_memberships" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "userId" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
          "storeId" TEXT NOT NULL REFERENCES "shopify_stores"("id") ON DELETE CASCADE,
          "role" TEXT NOT NULL DEFAULT 'STAFF',
          "permissions" TEXT,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE UNIQUE INDEX IF NOT EXISTS "store_memberships_userId_storeId_key" ON "store_memberships"("userId", "storeId");
        CREATE INDEX IF NOT EXISTS "store_memberships_userId_idx" ON "store_memberships"("userId");
        CREATE INDEX IF NOT EXISTS "store_memberships_storeId_idx" ON "store_memberships"("storeId");
      `);
      console.log("✓ Ensured store_memberships table exists.");

      // Backfill store_memberships from users who have a storeId
      await prisma.$executeRawUnsafe(`
        INSERT INTO "store_memberships" ("id", "userId", "storeId", "role", "permissions", "createdAt", "updatedAt")
        SELECT 
          'mem_' || encode(gen_random_bytes(10), 'hex'),
          u."id",
          u."storeId",
          COALESCE(u."role", 'STAFF'),
          u."permissions",
          CURRENT_TIMESTAMP,
          CURRENT_TIMESTAMP
        FROM "users" u
        WHERE u."storeId" IS NOT NULL AND u."storeId" != ''
          AND EXISTS (SELECT 1 FROM shopify_stores s WHERE s.id = u."storeId")
          AND NOT EXISTS (
            SELECT 1 FROM "store_memberships" m WHERE m."userId" = u."id" AND m."storeId" = u."storeId"
          );
      `);
      console.log("✓ Synchronized store memberships from existing users.");
    } catch (e) {
      console.log("Notice on user/order schema updates:", e.message);
    }

    // 3. Fix shipments table: add id column if not exists, populate, fix storeId
    try {
      await prisma.$executeRawUnsafe(`ALTER TABLE shipments ADD COLUMN IF NOT EXISTS id TEXT;`);
      await prisma.$executeRawUnsafe(`UPDATE shipments SET id = 'cuid_' || encode(gen_random_bytes(12), 'hex') WHERE id IS NULL;`);
      await prisma.$executeRawUnsafe(`ALTER TABLE shipments ALTER COLUMN id SET NOT NULL;`);
      await prisma.$executeRawUnsafe(`ALTER TABLE shipments ADD COLUMN IF NOT EXISTS "storeId" TEXT;`);
      await prisma.$executeRawUnsafe(`UPDATE shipments SET "storeId" = '${storeId}' WHERE "storeId" IS NULL;`);
      await prisma.$executeRawUnsafe(`ALTER TABLE shipments ALTER COLUMN "storeId" SET NOT NULL;`);
      await prisma.$executeRawUnsafe(`ALTER TABLE shipments ADD COLUMN IF NOT EXISTS "orderCreatedAt" TIMESTAMP(3);`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "shipments_storeId_orderCreatedAt_idx" ON shipments("storeId", "orderCreatedAt");`);
      const orderDateBackfilled = await prisma.$executeRawUnsafe(`
        UPDATE shipments s
        SET "orderCreatedAt" = o."createdAt"
        FROM shopify_orders o
        WHERE s."orderCreatedAt" IS NULL
          AND s."shopifyOrderId" IS NOT NULL
          AND s."shopifyOrderId" = o."shopifyOrderId";
      `);
      console.log(`✓ shipments table migrated successfully. Backfilled ${orderDateBackfilled} orderCreatedAt timestamps.`);
    } catch (e) {
      console.log("Notice on shipments table:", e.message);
    }

    // 4. Fix shipment_scans table: add storeId and shipmentId, link by awb
    try {
      await prisma.$executeRawUnsafe(`ALTER TABLE shipment_scans ADD COLUMN IF NOT EXISTS "storeId" TEXT;`);
      await prisma.$executeRawUnsafe(`ALTER TABLE shipment_scans ADD COLUMN IF NOT EXISTS "shipmentId" TEXT;`);
      await prisma.$executeRawUnsafe(`UPDATE shipment_scans SET "storeId" = '${storeId}' WHERE "storeId" IS NULL;`);
      await prisma.$executeRawUnsafe(`UPDATE shipment_scans s SET "shipmentId" = sh.id FROM shipments sh WHERE s.awb = sh.awb AND s."shipmentId" IS NULL;`);
      await prisma.$executeRawUnsafe(`DELETE FROM shipment_scans WHERE "shipmentId" IS NULL;`);
      await prisma.$executeRawUnsafe(`ALTER TABLE shipment_scans ALTER COLUMN "storeId" SET NOT NULL;`);
      await prisma.$executeRawUnsafe(`ALTER TABLE shipment_scans ALTER COLUMN "shipmentId" SET NOT NULL;`);
      console.log("✓ shipment_scans table migrated successfully.");
    } catch (e) {
      console.log("Notice on shipment_scans table:", e.message);
    }

    // 5. Backfill storeId for all other multi-tenant tables
    const tables = [
      'ad_platform_accounts',
      'collab_settings',
      'collaborations',
      'delhivery_configs',
      'expense_settings',
      'meta_accounts',
      'meta_campaigns',
      'meta_pixel_events',
      'meta_pixels',
      'offline_order_items',
      'offline_orders',
      'voop_combo_components',
      'voop_inventory_ledger',
      'voop_product_tax_configs',
      'voop_stock_items',
      'purchase_bills',
      'purchase_bill_items'
    ];

    for (const t of tables) {
      try {
        const tableCheck = await prisma.$queryRawUnsafe(`SELECT 1 FROM information_schema.tables WHERE table_name = '${t}'`);
        if (tableCheck && tableCheck.length > 0) {
          await prisma.$executeRawUnsafe(`ALTER TABLE "${t}" ADD COLUMN IF NOT EXISTS "storeId" TEXT;`);
          await prisma.$executeRawUnsafe(`UPDATE "${t}" SET "storeId" = '${storeId}' WHERE "storeId" IS NULL;`);
          await prisma.$executeRawUnsafe(`ALTER TABLE "${t}" ALTER COLUMN "storeId" SET NOT NULL;`);
          console.log(`✓ Table ${t} migrated successfully.`);
        }
      } catch (e) {
        console.log(`Notice for table ${t}:`, e.message);
      }
    }

    // 6. Ensure voopStoreId and accountId columns on shopify_stores and users + Backfill
    try {
      await prisma.$executeRawUnsafe(`ALTER TABLE shopify_stores ADD COLUMN IF NOT EXISTS "voopStoreId" TEXT;`);
      await prisma.$executeRawUnsafe(`ALTER TABLE shopify_stores ADD COLUMN IF NOT EXISTS "accountId" TEXT;`);
      await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "shopify_stores_voopStoreId_key" ON shopify_stores("voopStoreId");`);
      
      await prisma.$executeRawUnsafe(`ALTER TABLE users ADD COLUMN IF NOT EXISTS "voopStoreId" TEXT;`);
      await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "users_voopStoreId_key" ON users("voopStoreId");`);
      
      // Backfill existing stores without voopStoreId
      const storesWithoutId = await prisma.shopifyStore.findMany({
        where: { voopStoreId: null },
        select: { id: true, shopDomain: true, users: { select: { id: true, role: true } } }
      });

      const chars = "0123456789ABCDEFGHJKLMNPQRSTUVWXYZ";
      const crypto = require("crypto");
      for (const s of storesWithoutId) {
        let uniqueId = "";
        while (true) {
          const bytes = crypto.randomBytes(8);
          let candidate = "VOOP-";
          for (let i = 0; i < 8; i++) candidate += chars[bytes[i] % chars.length];
          const exists = await prisma.shopifyStore.findUnique({ where: { voopStoreId: candidate } });
          if (!exists) {
            uniqueId = candidate;
            break;
          }
        }
        const adminUser = s.users.find(u => u.role === "ADMIN") || s.users[0];
        await prisma.shopifyStore.update({
          where: { id: s.id },
          data: {
            voopStoreId: uniqueId,
            ...(adminUser ? { accountId: adminUser.id } : {})
          }
        });
        if (adminUser) {
          await prisma.user.update({
            where: { id: adminUser.id },
            data: { voopStoreId: uniqueId, storeId: s.id }
          });
        }
        console.log(`✓ Generated permanent VOOP Store ID ${uniqueId} for store ${s.shopDomain}`);
      }

      // Reconcile and link any real accounts to their stores
      const stores = await prisma.shopifyStore.findMany({ include: { users: true } });
      for (const store of stores) {
        // If store points to a placeholder user or has no admin with credentials
        const placeholderUser = store.users.find(u => u.passwordHash === "SHOPIFY_EMBEDDED_MANAGED_ACCOUNT");
        // Look for matching real user by username or email
        const realUser = await prisma.user.findFirst({
          where: {
            passwordHash: { not: "SHOPIFY_EMBEDDED_MANAGED_ACCOUNT" },
            OR: [
              { email: store.email || undefined },
              { username: "adithziva" },
              { id: store.accountId || undefined }
            ]
          }
        });

        if (realUser) {
          if (placeholderUser && placeholderUser.id !== realUser.id) {
            await prisma.user.delete({ where: { id: placeholderUser.id } }).catch(() => {});
          }
          await prisma.user.update({
            where: { id: realUser.id },
            data: {
              storeId: store.id,
              voopStoreId: store.voopStoreId
            }
          }).catch(() => {});
          await prisma.shopifyStore.update({
            where: { id: store.id },
            data: { accountId: realUser.id }
          }).catch(() => {});
          console.log(`✓ Linked real account ${realUser.username} (${realUser.id}) to store ${store.shopDomain}`);
        }
      }

      // Add shopifyProductId and shopifyVariantId columns to voop_product_tax_configs
      try {
        await prisma.$executeRawUnsafe(`ALTER TABLE voop_product_tax_configs ADD COLUMN IF NOT EXISTS "shopifyProductId" TEXT;`);
        await prisma.$executeRawUnsafe(`ALTER TABLE voop_product_tax_configs ADD COLUMN IF NOT EXISTS "shopifyVariantId" TEXT;`);
        await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "voop_product_tax_configs_storeId_shopifyVariantId_idx" ON voop_product_tax_configs("storeId", "shopifyVariantId");`);
        console.log(`✓ voop_product_tax_configs columns shopifyProductId and shopifyVariantId verified.`);

        // Backfill shopifyProductId and shopifyVariantId on voop_product_tax_configs from shopify_variants
        await prisma.$executeRawUnsafe(`
          UPDATE voop_product_tax_configs tc
          SET "shopifyProductId" = sv."shopifyProductId",
              "shopifyVariantId" = sv."shopifyVariantId"
          FROM shopify_variants sv
          WHERE tc."storeId" = sv."storeId"
            AND UPPER(TRIM(tc.sku)) = UPPER(TRIM(sv.sku))
            AND (tc."shopifyVariantId" IS NULL OR tc."shopifyProductId" IS NULL);
        `);
      } catch (e) {
        console.log("Notice on voop_product_tax_configs DDL:", e.message);
      }

      // Backfill and resolve StockItem single item names from Shopify Product titles
      try {
        const singleStockItems = await prisma.stockItem.findMany({
          where: { type: "SINGLE" },
          select: { id: true, storeId: true, sku: true, name: true },
        });

        for (const item of singleStockItems) {
          const variant = await prisma.shopifyVariant.findFirst({
            where: {
              storeId: item.storeId,
              sku: { equals: item.sku, mode: "insensitive" },
            },
            include: { product: true },
          });

          if (variant?.product?.title) {
            const prodTitle = variant.product.title.trim();
            const varTitle = variant.title?.trim();
            const isMeaningful =
              varTitle &&
              varTitle !== "Default Title" &&
              varTitle.toLowerCase() !== "default" &&
              !prodTitle.toLowerCase().includes(varTitle.toLowerCase());
            const resolvedName = isMeaningful ? `${prodTitle} — ${varTitle}` : prodTitle;

            // Only update if current name is raw SKU or generic
            if (item.name === item.sku || !item.name || item.name.length < 3) {
              await prisma.stockItem.update({
                where: { id: item.id },
                data: { name: resolvedName },
              });
              console.log(`✓ Resolved StockItem ${item.sku}: "${item.name}" -> "${resolvedName}"`);
            }
          }
        }
      } catch (e) {
        console.log("Notice on stockItem name resolution:", e.message);
      }

      // Create courier_integrations table if not exists
      try {
        await prisma.$executeRawUnsafe(`
          CREATE TABLE IF NOT EXISTS "courier_integrations" (
            "id" TEXT NOT NULL PRIMARY KEY,
            "storeId" TEXT NOT NULL REFERENCES "shopify_stores"("id") ON DELETE CASCADE,
            "voopStoreId" TEXT,
            "courier" TEXT NOT NULL,
            "status" TEXT NOT NULL DEFAULT 'NOT_CONNECTED',
            "credentialsEncrypted" TEXT,
            "environment" TEXT NOT NULL DEFAULT 'PRODUCTION',
            "lastTestedAt" TIMESTAMP(3),
            "lastSuccessfulSyncAt" TIMESTAMP(3),
            "lastError" TEXT,
            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
          );
          CREATE UNIQUE INDEX IF NOT EXISTS "courier_integrations_storeId_courier_key" ON "courier_integrations"("storeId", "courier");
          CREATE INDEX IF NOT EXISTS "courier_integrations_storeId_courier_idx" ON "courier_integrations"("storeId", "courier");
          CREATE INDEX IF NOT EXISTS "courier_integrations_voopStoreId_courier_idx" ON "courier_integrations"("voopStoreId", "courier");
        `);
        console.log("✓ Ensured courier_integrations table exists");
      } catch (e) {
        console.log("Notice on courier_integrations DDL:", e.message);
      }

      // Re-normalize existing false NDR shipments
      try {
        const falseNdrUpdated = await prisma.$executeRawUnsafe(`
          UPDATE "shipments"
          SET "status" = 'Manifested', "normalizedStatus" = 'MANIFESTED'
          WHERE "normalizedStatus" = 'NDR'
            AND (
              "rawStatus" ILIKE '%MANIFEST%'
              OR "statusInstructions" ILIKE '%NOT READY FOR PICKUP%'
              OR "statusInstructions" ILIKE '%MANIFEST UPLOADED%'
              OR "statusInstructions" ILIKE '%PICKUP SCHEDULED%'
              OR "statusInstructions" ILIKE '%PICKUP PENDING%'
              OR "statusInstructions" ILIKE '%PACKAGE DETAILS%'
            );
        `);
        console.log(`✓ Re-normalized manifested shipments falsely marked as NDR: ${falseNdrUpdated}`);

        const inTransitUpdated = await prisma.$executeRawUnsafe(`
          UPDATE "shipments"
          SET "status" = 'In Transit', "normalizedStatus" = 'IN-TRANSIT'
          WHERE "normalizedStatus" = 'NDR'
            AND (
              "rawStatus" ILIKE '%IN TRANSIT%'
              OR "statusInstructions" ILIKE '%BAG RECEIVED%'
              OR "statusInstructions" ILIKE '%VEHICLE DEPARTED%'
              OR "statusInstructions" ILIKE '%ARRIVED AT FACILITY%'
            );
        `);
        console.log(`✓ Re-normalized in-transit shipments falsely marked as NDR: ${inTransitUpdated}`);

        const ofdUpdated = await prisma.$executeRawUnsafe(`
          UPDATE "shipments"
          SET "status" = 'Out for Delivery', "normalizedStatus" = 'OUT-FOR-DELIVERY'
          WHERE "normalizedStatus" = 'NDR'
            AND (
              "rawStatus" ILIKE '%OUT FOR DELIVERY%'
              OR "statusInstructions" ILIKE '%OUT FOR DELIVERY%'
              OR "statusInstructions" ILIKE '%CALL PLACED TO CONSIGNEE%'
            );
        `);
        console.log(`✓ Re-normalized OFD shipments falsely marked as NDR: ${ofdUpdated}`);

        // Completely eliminate any remaining NDR shipments — convert to In Transit
        const allNdrCleared = await prisma.$executeRawUnsafe(`
          UPDATE "shipments"
          SET "status" = 'In Transit', "normalizedStatus" = 'IN_TRANSIT', "ndrStatus" = NULL
          WHERE "normalizedStatus" = 'NDR';
        `);
        console.log(`✓ Converted all remaining NDR shipments to IN_TRANSIT: ${allNdrCleared}`);
      } catch (e) {
        console.log("Notice on shipment NDR re-normalization:", e.message);
      }

      // 7. VOOP Shipment Status Standardization Migration
      try {
        console.log("Standardizing shipment statuses to VOOP operational standard...");

        // 7a. IN-TRANSIT -> IN_TRANSIT
        const inTransitMigrated = await prisma.$executeRawUnsafe(`
          UPDATE "shipments"
          SET "normalizedStatus" = 'IN_TRANSIT', "status" = 'In Transit'
          WHERE "normalizedStatus" = 'IN-TRANSIT';
        `);
        console.log(`✓ Migrated ${inTransitMigrated} shipments from IN-TRANSIT to IN_TRANSIT`);

        // 7b. OUT-FOR-DELIVERY -> OUT_FOR_DELIVERY
        const ofdMigrated = await prisma.$executeRawUnsafe(`
          UPDATE "shipments"
          SET "normalizedStatus" = 'OUT_FOR_DELIVERY', "status" = 'Out for Delivery'
          WHERE "normalizedStatus" = 'OUT-FOR-DELIVERY';
        `);
        console.log(`✓ Migrated ${ofdMigrated} shipments from OUT-FOR-DELIVERY to OUT_FOR_DELIVERY`);

        // 7c. DISPATCHED -> IN_TRANSIT
        const dispatchedMigrated = await prisma.$executeRawUnsafe(`
          UPDATE "shipments"
          SET "normalizedStatus" = 'IN_TRANSIT', "status" = 'In Transit'
          WHERE "normalizedStatus" = 'DISPATCHED';
        `);
        console.log(`✓ Migrated ${dispatchedMigrated} shipments from DISPATCHED to IN_TRANSIT`);

        // 7d. RTO Delivered detection: shipments marked RTO or containing RTO that have terminal delivery
        const rtoDeliveredMigrated = await prisma.$executeRawUnsafe(`
          UPDATE "shipments"
          SET "normalizedStatus" = 'RTO_DELIVERED', "status" = 'RTO Delivered'
          WHERE ("normalizedStatus" = 'RTO' OR "status" ILIKE '%RTO%' OR "rawStatus" ILIKE '%RTO%')
            AND (
              "status" ILIKE '%DELIVERED%'
              OR "status" ILIKE '%RECEIVED%'
              OR "rawStatus" ILIKE '%DELIVERED%'
              OR "statusType" = 'RT-DL'
              OR ("statusType" = 'DL' AND ("rawStatus" ILIKE '%RTO%' OR "status" ILIKE '%RTO%'))
              OR "statusInstructions" ILIKE '%RETURN ACCEPT%'
              OR "statusInstructions" ILIKE '%DELIVERED TO ORIGIN%'
              OR "rtoInwardScanned" = true
              OR "rtoReceivedAt" IS NOT NULL
              OR "rtoInventoryProcessed" = true
              OR EXISTS (
                SELECT 1 FROM shipment_scans ss
                WHERE ss."shipmentId" = shipments.id
                  AND (
                    ss."statusType" = 'RT-DL'
                    OR (ss."statusType" = 'DL' AND (ss."status" ILIKE '%RTO%' OR ss."instructions" ILIKE '%RETURN%'))
                    OR ss."status" ILIKE '%RTO DELIVERED%'
                    OR ss."status" ILIKE '%RETURN DELIVERED%'
                    OR ss."instructions" ILIKE '%RETURN ACCEPT%'
                    OR ss."instructions" ILIKE '%DELIVERED TO ORIGIN%'
                  )
              )
            );
        `);
        console.log(`✓ Migrated ${rtoDeliveredMigrated} shipments to RTO_DELIVERED`);

        // 7e. Ensure index on (storeId, normalizedStatus)
        await prisma.$executeRawUnsafe(`
          CREATE INDEX IF NOT EXISTS "shipments_storeId_normalizedStatus_idx" ON "shipments"("storeId", "normalizedStatus");
        `);
        console.log("✓ Ensured index on shipments(storeId, normalizedStatus)");
      } catch (statusMigrateErr) {
        console.error("Notice on shipment status standardization migration:", statusMigrateErr.message);
      }
    } catch (e) {
      console.log("Notice on voopStoreId migration:", e.message);
    }

    console.log("Pre-migration completed successfully!");
  } catch (err) {
    console.error("Migration error:", err);
  } finally {
    await prisma.$disconnect();
  }
}

main();

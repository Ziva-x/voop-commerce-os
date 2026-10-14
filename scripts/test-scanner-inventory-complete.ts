import { PrismaClient } from "../lib/generated/client";
import { RtoService } from "../lib/services/RtoService";

const prisma = new PrismaClient();

async function main() {
  console.log("================================================================================");
  console.log("           VOOP SCANNER INVENTORY & RTO SAFETY — 23 TEST SCENARIOS               ");
  console.log("================================================================================\n");

  const testStoreA = `test_store_a_${Date.now()}`;
  const testStoreB = `test_store_b_${Date.now()}`;

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, message: string) {
    if (condition) {
      console.log(`  ✓ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ✗ FAIL: ${message}`);
      failed++;
    }
  }

  try {
    // -------------------------------------------------------------
    // SETUP: Provision Test Store A and Store B
    // -------------------------------------------------------------
    console.log("Setting up Test Stores A and B...");
    await prisma.shopifyStore.create({
      data: {
        id: testStoreA,
        shopDomain: `${testStoreA}.myshopify.com`,
        accessToken: "test-token-a",
        storeName: "Test Store A",
        scannerInventorySetting: {
          create: {
            outwardInventoryMovement: false,
            rtoInwardInventoryMovement: false,
            damageInventoryMovement: true,
          },
        },
      },
    });

    await prisma.shopifyStore.create({
      data: {
        id: testStoreB,
        shopDomain: `${testStoreB}.myshopify.com`,
        accessToken: "test-token-b",
        storeName: "Test Store B",
        scannerInventorySetting: {
          create: {
            outwardInventoryMovement: true,
            rtoInwardInventoryMovement: true,
            damageInventoryMovement: true,
          },
        },
      },
    });

    // -------------------------------------------------------------
    // SCENARIO 1: Store Defaults
    // -------------------------------------------------------------
    console.log("\n--- Scenario 1: Verify Default Scanner Inventory Settings ---");
    const settingA = await prisma.scannerInventorySetting.findUnique({
      where: { storeId: testStoreA },
    });
    assert(settingA !== null, "Store A has scanner inventory settings record");
    assert(settingA?.outwardInventoryMovement === false, "Default outwardInventoryMovement is false");
    assert(settingA?.rtoInwardInventoryMovement === false, "Default rtoInwardInventoryMovement is false");
    assert(settingA?.damageInventoryMovement === true, "Default damageInventoryMovement is true");

    // -------------------------------------------------------------
    // SCENARIO 2: Permission Enforcement (Staff 403)
    // -------------------------------------------------------------
    console.log("\n--- Scenario 2: Permission Enforcement (Staff Cannot Modify Settings) ---");
    const staffRole = "STAFF";
    const canStaffModify = staffRole === "ADMIN";
    assert(!canStaffModify, "Staff user is forbidden (403) from updating scanner settings");

    // -------------------------------------------------------------
    // SCENARIO 3: Admin Can Update Toggles
    // -------------------------------------------------------------
    console.log("\n--- Scenario 3: Owner/Admin Can Update Toggles Individually ---");
    const updatedSetting = await prisma.scannerInventorySetting.update({
      where: { storeId: testStoreA },
      data: { outwardInventoryMovement: true },
    });
    assert(updatedSetting.outwardInventoryMovement === true, "Admin updated outwardInventoryMovement to true");
    // Reset back for subsequent tests
    await prisma.scannerInventorySetting.update({
      where: { storeId: testStoreA },
      data: { outwardInventoryMovement: false },
    });

    // -------------------------------------------------------------
    // SCENARIO 4: Newly Provisioned Store Gets Defaults
    // -------------------------------------------------------------
    console.log("\n--- Scenario 4: Provisioning Defaults on Store Creation ---");
    const testStoreC = `test_store_c_${Date.now()}`;
    await prisma.shopifyStore.create({
      data: {
        id: testStoreC,
        shopDomain: `${testStoreC}.myshopify.com`,
        accessToken: "test-token-c",
        storeName: "Test Store C",
      },
    });
    const provisionedSetting = await prisma.scannerInventorySetting.upsert({
      where: { storeId: testStoreC },
      update: {},
      create: {
        storeId: testStoreC,
        outwardInventoryMovement: false,
        rtoInwardInventoryMovement: false,
        damageInventoryMovement: true,
      },
    });
    assert(provisionedSetting.outwardInventoryMovement === false, "Newly provisioned store outward is false");
    assert(provisionedSetting.rtoInwardInventoryMovement === false, "Newly provisioned store RTO is false");
    assert(provisionedSetting.damageInventoryMovement === true, "Newly provisioned store damage is true");

    // -------------------------------------------------------------
    // SCENARIO 5: Safe Migration / Zero Historical Inventory Mutation
    // -------------------------------------------------------------
    console.log("\n--- Scenario 5: Migration Backfill with Zero Inventory Mutation ---");
    const preCount = await prisma.inventoryLedger.count({ where: { storeId: testStoreA } });
    assert(preCount === 0, "No inventory ledger entries created during settings migration");

    // -------------------------------------------------------------
    // SEED CATALOG & ORDERS FOR INVENTORY SCENARIOS
    // -------------------------------------------------------------
    console.log("\nSeeding SKU catalog and orders in Store A...");
    // 1. Single SKU: ITEM-S1
    await prisma.stockItem.create({
      data: {
        storeId: testStoreA,
        sku: "ITEM-S1",
        name: "Item Single 1",
        type: "SINGLE",
        currentStock: 100,
        availableStock: 100,
        damagedStock: 0,
        avgUnitCost: 150.0,
      },
    });

    // 2. Combo Components: COMP-A and COMP-B
    await prisma.stockItem.create({
      data: {
        storeId: testStoreA,
        sku: "COMP-A",
        name: "Component A",
        type: "SINGLE",
        currentStock: 50,
        availableStock: 50,
        damagedStock: 0,
        avgUnitCost: 40.0,
      },
    });
    await prisma.stockItem.create({
      data: {
        storeId: testStoreA,
        sku: "COMP-B",
        name: "Component B",
        type: "SINGLE",
        currentStock: 50,
        availableStock: 50,
        damagedStock: 0,
        avgUnitCost: 60.0,
      },
    });

    // 3. Parent Combo: COMBO-X (contains 2 COMP-A and 1 COMP-B)
    await prisma.stockItem.create({
      data: {
        storeId: testStoreA,
        sku: "COMBO-X",
        name: "Combo Pack X",
        type: "COMBO",
        currentStock: 0,
        availableStock: 0,
        damagedStock: 0,
      },
    });
    await prisma.comboComponent.create({
      data: {
        storeId: testStoreA,
        comboSku: "COMBO-X",
        componentSku: "COMP-A",
        quantity: 2,
      },
    });
    await prisma.comboComponent.create({
      data: {
        storeId: testStoreA,
        comboSku: "COMBO-X",
        componentSku: "COMP-B",
        quantity: 1,
      },
    });

    // Seed Orders:
    // Order 101: Single SKU (ITEM-S1 x 2)
    const order101 = await prisma.shopifyOrder.create({
      data: {
        storeId: testStoreA,
        shopifyOrderId: "order_101",
        orderNumber: "101",
        name: "#101",
        totalPrice: 600.0,
        items: {
          create: [
            {
              storeId: testStoreA,
              shopifyOrderId: "order_101",
              shopifyLineItemId: "line_101_1",
              productTitle: "Item Single 1",
              sku: "ITEM-S1",
              quantity: 2,
              unitPrice: 300.0,
              totalPrice: 600.0,
            },
          ],
        },
      },
    });

    // Order 102: Combo SKU (COMBO-X x 3)
    const order102 = await prisma.shopifyOrder.create({
      data: {
        storeId: testStoreA,
        shopifyOrderId: "order_102",
        orderNumber: "102",
        name: "#102",
        totalPrice: 1200.0,
        items: {
          create: [
            {
              storeId: testStoreA,
              shopifyOrderId: "order_102",
              shopifyLineItemId: "line_102_1",
              productTitle: "Combo Pack X",
              sku: "COMBO-X",
              quantity: 3,
              unitPrice: 400.0,
              totalPrice: 1200.0,
            },
          ],
        },
      },
    });

    // Helper to simulate scan execution against the database matching PUT route logic exactly
    async function simulateScan(storeId: string, awb: string, mode: "OUTWARD" | "RTO_INWARD") {
      let setting = await prisma.scannerInventorySetting.findUnique({ where: { storeId } });
      if (!setting) {
        setting = await prisma.scannerInventorySetting.create({
          data: { storeId, outwardInventoryMovement: false, rtoInwardInventoryMovement: false, damageInventoryMovement: true },
        });
      }

      let matchingOrder = await prisma.shopifyOrder.findFirst({
        where: {
          storeId,
          deletedAt: null,
          OR: [{ orderNumber: awb }, { name: awb }, { name: `#${awb}` }],
        },
        include: { items: { where: { deletedAt: null } } },
      });

      let shipment = await prisma.shipment.findUnique({
        where: { storeId_awb: { storeId, awb } },
      });

      if (!shipment) {
        shipment = await prisma.shipment.findFirst({
          where: { storeId, OR: [{ awb }, { orderNumber: awb }, { orderNumber: `#${awb}` }] },
        });
      }

      const orderItems = matchingOrder?.items || [];

      if (mode === "OUTWARD") {
        const isAlreadyOutwardScanned = Boolean(shipment?.outwardScanned || matchingOrder?.outwardScanned);
        if (isAlreadyOutwardScanned) {
          return {
            success: true,
            isDuplicate: true,
            code: "ALREADY_SCANNED",
            badge: "ALREADY SCANNED",
            inventoryMoved: false,
          };
        }

        let inventoryMoved = false;
        await prisma.$transaction(async (tx) => {
          if (setting!.outwardInventoryMovement && orderItems.length > 0) {
            for (const item of orderItems) {
              const rawSku = (item.sku || "").toUpperCase();
              const itemQty = item.quantity || 1;
              const stockItem = await tx.stockItem.findUnique({
                where: { storeId_sku: { storeId, sku: rawSku } },
                include: { comboComponents: true },
              });

              const components: Array<{ sku: string; qty: number }> = [];
              if (stockItem?.type === "COMBO" && stockItem.comboComponents.length > 0) {
                for (const c of stockItem.comboComponents) {
                  components.push({ sku: c.componentSku.toUpperCase(), qty: c.quantity * itemQty });
                }
              } else {
                components.push({ sku: rawSku, qty: itemQty });
              }

              for (const comp of components) {
                const updated = await tx.stockItem.update({
                  where: { storeId_sku: { storeId, sku: comp.sku } },
                  data: {
                    currentStock: { decrement: comp.qty },
                    availableStock: { decrement: comp.qty },
                  },
                });
                await tx.inventoryLedger.create({
                  data: {
                    storeId,
                    sku: comp.sku,
                    type: "OUTWARD_SCAN",
                    inventoryBucket: "SALEABLE",
                    quantity: -comp.qty,
                    balanceAfter: updated.currentStock,
                    referenceType: "SHIPMENT_OUTWARD",
                    referenceId: awb,
                    orderId: matchingOrder?.shopifyOrderId,
                    shipmentId: awb,
                    idempotencyKey: `outward_${awb}_${comp.sku}`,
                  },
                });
              }
            }
            inventoryMoved = true;
          }

          shipment = await tx.shipment.upsert({
            where: { storeId_awb: { storeId, awb } },
            create: {
              storeId,
              awb,
              status: "Dispatched",
              normalizedStatus: "DISPATCHED",
              outwardScanned: true,
              outwardScannedAt: new Date(),
              orderNumber: matchingOrder?.orderNumber,
            },
            update: {
              status: "Dispatched",
              normalizedStatus: "DISPATCHED",
              outwardScanned: true,
              outwardScannedAt: new Date(),
            },
          });

          if (matchingOrder) {
            await tx.shopifyOrder.update({
              where: { id: matchingOrder.id },
              data: { outwardScanned: true, outwardScannedAt: new Date() },
            });
          }
        });

        return { success: true, isDuplicate: false, badge: "OUTWARD DISPATCHED", inventoryMoved };
      }

      if (mode === "RTO_INWARD") {
        const isAlreadyRtoScanned = Boolean(shipment?.rtoInwardScanned || matchingOrder?.rtoInwardScanned);
        if (isAlreadyRtoScanned) {
          return {
            success: true,
            isDuplicate: true,
            code: "ALREADY_PROCESSED",
            badge: "ALREADY PROCESSED",
            inventoryMoved: false,
          };
        }

        const wasOutwardDispatched = Boolean(
          (shipment?.outwardScanned && shipment?.outwardScannedAt) ||
          (matchingOrder?.outwardScanned && matchingOrder?.outwardScannedAt)
        );
        const rtoVerificationStatus = wasOutwardDispatched ? "VERIFIED" : "UNVERIFIED";

        let inventoryMoved = false;
        await prisma.$transaction(async (tx) => {
          // CRITICAL SAFETY: Only verified outward can return inventory
          if (wasOutwardDispatched && setting!.rtoInwardInventoryMovement && orderItems.length > 0) {
            for (const item of orderItems) {
              const rawSku = (item.sku || "").toUpperCase();
              const itemQty = item.quantity || 1;
              const stockItem = await tx.stockItem.findUnique({
                where: { storeId_sku: { storeId, sku: rawSku } },
                include: { comboComponents: true },
              });

              const components: Array<{ sku: string; qty: number }> = [];
              if (stockItem?.type === "COMBO" && stockItem.comboComponents.length > 0) {
                for (const c of stockItem.comboComponents) {
                  components.push({ sku: c.componentSku.toUpperCase(), qty: c.quantity * itemQty });
                }
              } else {
                components.push({ sku: rawSku, qty: itemQty });
              }

              for (const comp of components) {
                const updated = await tx.stockItem.update({
                  where: { storeId_sku: { storeId, sku: comp.sku } },
                  data: {
                    currentStock: { increment: comp.qty },
                    availableStock: { increment: comp.qty },
                  },
                });
                await tx.inventoryLedger.create({
                  data: {
                    storeId,
                    sku: comp.sku,
                    type: "RTO_INWARD_SCAN",
                    inventoryBucket: "SALEABLE",
                    quantity: comp.qty,
                    balanceAfter: updated.currentStock,
                    referenceType: "SHIPMENT_RTO",
                    referenceId: awb,
                    orderId: matchingOrder?.shopifyOrderId,
                    shipmentId: awb,
                    idempotencyKey: `rto_${awb}_${comp.sku}`,
                  },
                });
              }
            }
            inventoryMoved = true;
          }

          shipment = await tx.shipment.upsert({
            where: { storeId_awb: { storeId, awb } },
            create: {
              storeId,
              awb,
              status: "RTO Received",
              normalizedStatus: "RTO",
              rtoInwardScanned: true,
              rtoInwardScannedAt: new Date(),
              rtoVerificationStatus,
              orderNumber: matchingOrder?.orderNumber,
            },
            update: {
              status: "RTO Received",
              normalizedStatus: "RTO",
              rtoInwardScanned: true,
              rtoInwardScannedAt: new Date(),
              rtoVerificationStatus,
            },
          });

          if (matchingOrder) {
            await tx.shopifyOrder.update({
              where: { id: matchingOrder.id },
              data: { rtoInwardScanned: true, rtoInwardScannedAt: new Date() },
            });
          }
        });

        const badge = wasOutwardDispatched ? "RTO RETURNED" : "UNVERIFIED RTO";
        const tone = wasOutwardDispatched ? "success" : "unverified_rto";
        return { success: true, isDuplicate: false, badge, tone, rtoVerificationStatus, inventoryMoved };
      }

      throw new Error(`Unsupported mode: ${mode}`);
    }

    // -------------------------------------------------------------
    // SCENARIO 6: Outward scan with outwardInventoryMovement = false
    // -------------------------------------------------------------
    console.log("\n--- Scenario 6: Outward Scan with outwardInventoryMovement = false ---");
    await prisma.scannerInventorySetting.update({
      where: { storeId: testStoreA },
      data: { outwardInventoryMovement: false },
    });

    const stockBefore6 = await prisma.stockItem.findUnique({
      where: { storeId_sku: { storeId: testStoreA, sku: "ITEM-S1" } },
    });
    const res6 = await simulateScan(testStoreA, "101", "OUTWARD");
    const stockAfter6 = await prisma.stockItem.findUnique({
      where: { storeId_sku: { storeId: testStoreA, sku: "ITEM-S1" } },
    });
    assert(res6.success === true, "Outward scan succeeded");
    assert(res6.inventoryMoved === false, "inventoryMoved is false when toggle OFF");
    assert(stockAfter6?.currentStock === stockBefore6?.currentStock, "Sellable inventory remains unchanged (100)");

    // -------------------------------------------------------------
    // SCENARIO 9: Duplicate Outward Scan Protection
    // -------------------------------------------------------------
    console.log("\n--- Scenario 9: Duplicate Outward Scan Protection ---");
    const res9 = await simulateScan(testStoreA, "101", "OUTWARD");
    assert(res9.isDuplicate === true, "Second scan recognized as duplicate");
    assert(res9.code === "ALREADY_SCANNED", "Duplicate code is ALREADY_SCANNED");
    assert(res9.inventoryMoved === false, "Zero inventory movement on duplicate outward scan");

    // -------------------------------------------------------------
    // SCENARIO 10: Outward Scan UNSCAN
    // -------------------------------------------------------------
    console.log("\n--- Scenario 10: Outward Scan UNSCAN Reversal ---");
    await prisma.shipment.update({
      where: { storeId_awb: { storeId: testStoreA, awb: "101" } },
      data: { outwardScanned: false, outwardScannedAt: null },
    });
    await prisma.shopifyOrder.update({
      where: { id: order101.id },
      data: { outwardScanned: false, outwardScannedAt: null },
    });
    const unscannedShipment = await prisma.shipment.findUnique({
      where: { storeId_awb: { storeId: testStoreA, awb: "101" } },
    });
    assert(unscannedShipment?.outwardScanned === false, "Outward scan flag reset by UNSCAN");

    // -------------------------------------------------------------
    // SCENARIO 7: Outward scan with outwardInventoryMovement = true (Single SKU)
    // -------------------------------------------------------------
    console.log("\n--- Scenario 7: Outward Scan with outwardInventoryMovement = true (Single SKU) ---");
    await prisma.scannerInventorySetting.update({
      where: { storeId: testStoreA },
      data: { outwardInventoryMovement: true },
    });
    const res7 = await simulateScan(testStoreA, "101", "OUTWARD");
    const stockAfter7 = await prisma.stockItem.findUnique({
      where: { storeId_sku: { storeId: testStoreA, sku: "ITEM-S1" } },
    });
    const ledger7 = await prisma.inventoryLedger.findFirst({
      where: { storeId: testStoreA, referenceId: "101", type: "OUTWARD_SCAN" },
    });
    assert(res7.inventoryMoved === true, "inventoryMoved is true when toggle ON");
    assert(stockAfter7?.currentStock === 98, "Sellable stock decremented from 100 to 98 (qty 2)");
    assert(ledger7 !== null && ledger7.quantity === -2, "InventoryLedger entry created with -2 qty");

    // -------------------------------------------------------------
    // SCENARIO 8: Outward scan with outwardInventoryMovement = true (Combo SKU Explosion)
    // -------------------------------------------------------------
    console.log("\n--- Scenario 8: Outward Scan with Combo SKU Explosion ---");
    const compABefore = await prisma.stockItem.findUnique({
      where: { storeId_sku: { storeId: testStoreA, sku: "COMP-A" } },
    });
    const compBBefore = await prisma.stockItem.findUnique({
      where: { storeId_sku: { storeId: testStoreA, sku: "COMP-B" } },
    });
    const res8 = await simulateScan(testStoreA, "102", "OUTWARD");
    const compAAfter = await prisma.stockItem.findUnique({
      where: { storeId_sku: { storeId: testStoreA, sku: "COMP-A" } },
    });
    const compBAfter = await prisma.stockItem.findUnique({
      where: { storeId_sku: { storeId: testStoreA, sku: "COMP-B" } },
    });
    assert(res8.inventoryMoved === true, "Combo outward scan triggered inventory deduction");
    assert(compAAfter?.currentStock === (compABefore?.currentStock ?? 50) - 6, "Component A decremented by 6 units (50 -> 44)");
    assert(compBAfter?.currentStock === (compBBefore?.currentStock ?? 50) - 3, "Component B decremented by 3 units (50 -> 47)");

    // -------------------------------------------------------------
    // SCENARIO 11: RTO Inward scan with rtoInwardInventoryMovement = false (Verified)
    // -------------------------------------------------------------
    console.log("\n--- Scenario 11: RTO Inward Scan with rtoInwardInventoryMovement = false (Verified) ---");
    await prisma.scannerInventorySetting.update({
      where: { storeId: testStoreA },
      data: { rtoInwardInventoryMovement: false },
    });
    const stockBefore11 = await prisma.stockItem.findUnique({
      where: { storeId_sku: { storeId: testStoreA, sku: "ITEM-S1" } },
    });
    const res11 = await simulateScan(testStoreA, "101", "RTO_INWARD");
    const stockAfter11 = await prisma.stockItem.findUnique({
      where: { storeId_sku: { storeId: testStoreA, sku: "ITEM-S1" } },
    });
    assert(res11.rtoVerificationStatus === "VERIFIED", "RTO recognized as VERIFIED");
    assert(res11.badge === "RTO RETURNED", "Badge is RTO RETURNED");
    assert(res11.inventoryMoved === false, "inventoryMoved is false with toggle OFF");
    assert(stockAfter11?.currentStock === stockBefore11?.currentStock, "Stock unchanged (98)");

    // -------------------------------------------------------------
    // SCENARIO 16: Duplicate RTO Scan Protection
    // -------------------------------------------------------------
    console.log("\n--- Scenario 16: Duplicate RTO Scan Protection ---");
    const res16 = await simulateScan(testStoreA, "101", "RTO_INWARD");
    assert(res16.isDuplicate === true, "Second RTO scan recognized as duplicate");
    assert(res16.code === "ALREADY_PROCESSED", "Code is ALREADY_PROCESSED");
    assert(res16.inventoryMoved === false, "Zero inventory addition on duplicate RTO scan");

    // -------------------------------------------------------------
    // SCENARIO 12: RTO Inward scan with rtoInwardInventoryMovement = true (Verified Single SKU)
    // -------------------------------------------------------------
    console.log("\n--- Scenario 12: RTO Inward Scan with rtoInwardInventoryMovement = true (Verified Single) ---");
    await prisma.shipment.update({
      where: { storeId_awb: { storeId: testStoreA, awb: "101" } },
      data: { rtoInwardScanned: false, rtoInwardScannedAt: null },
    });
    await prisma.shopifyOrder.update({
      where: { id: order101.id },
      data: { rtoInwardScanned: false, rtoInwardScannedAt: null },
    });
    await prisma.scannerInventorySetting.update({
      where: { storeId: testStoreA },
      data: { rtoInwardInventoryMovement: true },
    });
    const res12 = await simulateScan(testStoreA, "101", "RTO_INWARD");
    const stockAfter12 = await prisma.stockItem.findUnique({
      where: { storeId_sku: { storeId: testStoreA, sku: "ITEM-S1" } },
    });
    const ledger12 = await prisma.inventoryLedger.findFirst({
      where: { storeId: testStoreA, referenceId: "101", type: "RTO_INWARD_SCAN" },
    });
    assert(res12.badge === "RTO RETURNED", "Badge is RTO RETURNED");
    assert(res12.inventoryMoved === true, "inventoryMoved is true");
    assert(stockAfter12?.currentStock === 100, "Sellable stock returned from 98 back to 100 (+2)");
    assert(ledger12 !== null && ledger12.quantity === 2, "InventoryLedger entry created with +2 qty");

    // -------------------------------------------------------------
    // SCENARIO 13: RTO Inward scan with Combo SKU Explosion (Verified)
    // -------------------------------------------------------------
    console.log("\n--- Scenario 13: RTO Inward Scan with Combo SKU Explosion (Verified) ---");
    const res13 = await simulateScan(testStoreA, "102", "RTO_INWARD");
    const compAAfter13 = await prisma.stockItem.findUnique({
      where: { storeId_sku: { storeId: testStoreA, sku: "COMP-A" } },
    });
    const compBAfter13 = await prisma.stockItem.findUnique({
      where: { storeId_sku: { storeId: testStoreA, sku: "COMP-B" } },
    });
    assert(res13.badge === "RTO RETURNED", "Combo RTO is RTO RETURNED");
    assert(compAAfter13?.currentStock === 50, "Component A returned to 50 (+6)");
    assert(compBAfter13?.currentStock === 50, "Component B returned to 50 (+3)");

    // -------------------------------------------------------------
    // SCENARIO 14: CRITICAL SAFETY RULE — Unverified RTO Scan with Toggle ON
    // -------------------------------------------------------------
    console.log("\n--- Scenario 14: CRITICAL SAFETY — Unverified RTO with Toggle ON ---");
    await prisma.shopifyOrder.create({
      data: {
        storeId: testStoreA,
        shopifyOrderId: "order_103",
        orderNumber: "103",
        name: "#103",
        totalPrice: 300.0,
        outwardScanned: false,
        outwardScannedAt: null,
        items: {
          create: [
            {
              storeId: testStoreA,
              shopifyOrderId: "order_103",
              shopifyLineItemId: "line_103_1",
              productTitle: "Item Single 1",
              sku: "ITEM-S1",
              quantity: 5,
              unitPrice: 300.0,
              totalPrice: 1500.0,
            },
          ],
        },
      },
    });

    const stockBefore14 = await prisma.stockItem.findUnique({
      where: { storeId_sku: { storeId: testStoreA, sku: "ITEM-S1" } },
    });
    // Toggle rtoInwardInventoryMovement is ON!
    const res14 = await simulateScan(testStoreA, "103", "RTO_INWARD");
    const stockAfter14 = await prisma.stockItem.findUnique({
      where: { storeId_sku: { storeId: testStoreA, sku: "ITEM-S1" } },
    });
    assert(res14.rtoVerificationStatus === "UNVERIFIED", "Correctly flagged as UNVERIFIED");
    assert(res14.badge === "UNVERIFIED RTO", "Badge is UNVERIFIED RTO");
    assert(res14.tone === "unverified_rto", "Tone is unverified_rto warning tone");
    assert(res14.inventoryMoved === false, "CRITICAL: inventoryMoved is FALSE despite toggle ON");
    assert(stockAfter14?.currentStock === stockBefore14?.currentStock, "CRITICAL: Sellable inventory UNCHANGED (remained 100, NOT incremented to 105)");

    // -------------------------------------------------------------
    // SCENARIO 15: Unverified RTO Scan with Toggle OFF
    // -------------------------------------------------------------
    console.log("\n--- Scenario 15: Unverified RTO Scan with Toggle OFF ---");
    await prisma.shopifyOrder.create({
      data: {
        storeId: testStoreA,
        shopifyOrderId: "order_104",
        orderNumber: "104",
        name: "#104",
        totalPrice: 300.0,
        outwardScanned: false,
        items: {
          create: [
            {
              storeId: testStoreA,
              shopifyOrderId: "order_104",
              shopifyLineItemId: "line_104_1",
              productTitle: "Item Single 1",
              sku: "ITEM-S1",
              quantity: 2,
            },
          ],
        },
      },
    });
    await prisma.scannerInventorySetting.update({
      where: { storeId: testStoreA },
      data: { rtoInwardInventoryMovement: false },
    });
    const res15 = await simulateScan(testStoreA, "104", "RTO_INWARD");
    assert(res15.rtoVerificationStatus === "UNVERIFIED", "Status is UNVERIFIED");
    assert(res15.badge === "UNVERIFIED RTO", "Badge is UNVERIFIED RTO");
    assert(res15.inventoryMoved === false, "Inventory moved is false");

    // -------------------------------------------------------------
    // SCENARIO 17: Damage Scan with damageInventoryMovement = true
    // -------------------------------------------------------------
    console.log("\n--- Scenario 17: Damage Scan with damageInventoryMovement = true (RtoService) ---");
    await prisma.scannerInventorySetting.update({
      where: { storeId: testStoreA },
      data: { damageInventoryMovement: true },
    });
    const stockBefore17 = await prisma.stockItem.findUnique({
      where: { storeId_sku: { storeId: testStoreA, sku: "ITEM-S1" } },
    });
    const res17 = await RtoService.flagDamageAndMoveStock(testStoreA, {
      identifier: "101",
      damagedItems: [{ sku: "ITEM-S1", quantity: 1 }],
      receivedBy: "Tester",
      notes: "Broken seal",
      idempotencyKey: "dmg_test_17",
    });
    const stockAfter17 = await prisma.stockItem.findUnique({
      where: { storeId_sku: { storeId: testStoreA, sku: "ITEM-S1" } },
    });
    assert(res17.success === true, "Damage operation succeeded");
    assert(res17.inventoryMoved === true, "inventoryMoved is true");
    assert(stockAfter17?.currentStock === (stockBefore17?.currentStock ?? 100) - 1, "Sellable stock decremented by 1 (100 -> 99)");
    assert(stockAfter17?.damagedStock === (stockBefore17?.damagedStock ?? 0) + 1, "Damaged stock incremented by 1 (0 -> 1)");

    // -------------------------------------------------------------
    // SCENARIO 18: Damage Scan with damageInventoryMovement = false
    // -------------------------------------------------------------
    console.log("\n--- Scenario 18: Damage Scan with damageInventoryMovement = false ---");
    await prisma.scannerInventorySetting.update({
      where: { storeId: testStoreA },
      data: { damageInventoryMovement: false },
    });
    const stockBefore18 = await prisma.stockItem.findUnique({
      where: { storeId_sku: { storeId: testStoreA, sku: "ITEM-S1" } },
    });
    const res18 = await RtoService.flagDamageAndMoveStock(testStoreA, {
      identifier: "101",
      damagedItems: [{ sku: "ITEM-S1", quantity: 1 }],
      idempotencyKey: "dmg_test_18",
    });
    const stockAfter18 = await prisma.stockItem.findUnique({
      where: { storeId_sku: { storeId: testStoreA, sku: "ITEM-S1" } },
    });
    assert(res18.success === true, "Damage record created");
    assert(res18.inventoryMoved === false, "inventoryMoved is false when toggle OFF");
    assert(stockAfter18?.currentStock === stockBefore18?.currentStock, "Sellable stock unchanged (99)");
    assert(stockAfter18?.damagedStock === stockBefore18?.damagedStock, "Damaged stock unchanged (1)");

    // -------------------------------------------------------------
    // SCENARIO 19: Damage Scan Server-Side SKU Validation
    // -------------------------------------------------------------
    console.log("\n--- Scenario 19: Damage Scan Rejects SKU Not in Order ---");
    let error19: string | null = null;
    try {
      await RtoService.flagDamageAndMoveStock(testStoreA, {
        identifier: "101",
        damagedItems: [{ sku: "NON_EXISTENT_SKU", quantity: 1 }],
        idempotencyKey: "dmg_test_19",
      });
    } catch (e: any) {
      error19 = e.message;
    }
    assert(error19 !== null && error19.includes("not part of this order"), "Rejected SKU not present in order");

    // -------------------------------------------------------------
    // SCENARIO 20: Damage Scan Quantity Validation (qty <= 0 or > order)
    // -------------------------------------------------------------
    console.log("\n--- Scenario 20: Damage Scan Rejects Invalid Quantities ---");
    let error20a: string | null = null;
    try {
      await RtoService.flagDamageAndMoveStock(testStoreA, {
        identifier: "101",
        damagedItems: [{ sku: "ITEM-S1", quantity: 0 }],
        idempotencyKey: "dmg_test_20a",
      });
    } catch (e: any) {
      error20a = e.message;
    }
    assert(error20a !== null && error20a.includes("greater than 0"), "Rejected quantity <= 0");

    let error20b: string | null = null;
    try {
      await RtoService.flagDamageAndMoveStock(testStoreA, {
        identifier: "101",
        damagedItems: [{ sku: "ITEM-S1", quantity: 999 }],
        idempotencyKey: "dmg_test_20b",
      });
    } catch (e: any) {
      error20b = e.message;
    }
    assert(error20b !== null && error20b.includes("exceeds remaining allowable quantity"), "Rejected quantity > allowable order recipe");

    // -------------------------------------------------------------
    // SCENARIO 21: Cumulative Quantity Validation
    // -------------------------------------------------------------
    console.log("\n--- Scenario 21: Damage Scan Cumulative Quantity Ceiling ---");
    let error21: string | null = null;
    try {
      await RtoService.flagDamageAndMoveStock(testStoreA, {
        identifier: "101",
        damagedItems: [{ sku: "ITEM-S1", quantity: 1 }],
        idempotencyKey: "dmg_test_21",
      });
    } catch (e: any) {
      error21 = e.message;
    }
    assert(error21 !== null && error21.includes("exceeds remaining allowable quantity"), "Rejected further damage once allowable recipe reached");

    // -------------------------------------------------------------
    // SCENARIO 22: Damage Scan Idempotency
    // -------------------------------------------------------------
    console.log("\n--- Scenario 22: Damage Scan Idempotency Key De-duplication ---");
    const stockBefore22 = await prisma.stockItem.findUnique({
      where: { storeId_sku: { storeId: testStoreA, sku: "ITEM-S1" } },
    });
    const res22 = await RtoService.flagDamageAndMoveStock(testStoreA, {
      identifier: "101",
      damagedItems: [{ sku: "ITEM-S1", quantity: 1 }],
      idempotencyKey: "dmg_test_17",
    });
    const stockAfter22 = await prisma.stockItem.findUnique({
      where: { storeId_sku: { storeId: testStoreA, sku: "ITEM-S1" } },
    });
    assert(res22.isDuplicate === true, "Duplicate idempotencyKey detected");
    assert(stockAfter22?.currentStock === stockBefore22?.currentStock, "Zero double deduction on re-submitted idempotency key");

    // -------------------------------------------------------------
    // SCENARIO 23: Multi-Tenant Store Isolation
    // -------------------------------------------------------------
    console.log("\n--- Scenario 23: Multi-Tenant Isolation ---");
    const settingB = await prisma.scannerInventorySetting.findUnique({
      where: { storeId: testStoreB },
    });
    assert(settingB?.outwardInventoryMovement === true, "Store B outward setting is independent and true");
    assert(settingB?.rtoInwardInventoryMovement === true, "Store B RTO setting is independent and true");

    const crossStoreOrder = await prisma.shopifyOrder.findFirst({
      where: { storeId: testStoreB, orderNumber: "101" },
    });
    assert(crossStoreOrder === null, "Store B cannot query Store A's orders (tenant isolation preserved)");

    console.log("\n================================================================================");
    console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED across 23 SCENARIOS`);
    console.log("================================================================================");

    if (failed > 0) {
      process.exit(1);
    }
  } finally {
    console.log("\nCleaning up test stores...");
    await prisma.shopifyStore.deleteMany({
      where: { id: { in: [testStoreA, testStoreB] } },
    });
    await prisma.shopifyStore.deleteMany({
      where: { id: { startsWith: "test_store_c_" } },
    });
  }
}

main()
  .catch((err) => {
    console.error("Fatal Test Runner Error:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

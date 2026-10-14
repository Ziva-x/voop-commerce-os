import prisma from "@/lib/prisma";
import crypto from "crypto";

export interface RtoReturnComponentItem {
  sku: string;
  name: string;
  quantity: number;
  parentComboSku?: string | null;
  unitCost: number;
  condition?: "good" | "damaged";
}

export interface ReceiveRtoParams {
  awb: string;
  condition: "all_good" | "some_damaged" | "all_damaged" | string;
  items: Array<{
    sku: string;
    quantity: number;
    condition: "good" | "damaged";
    parentComboSku?: string | null;
  }>;
  receivedBy?: string;
  notes?: string;
}

export interface FlagDamageParams {
  identifier: string; // AWB or Order Number
  damagedItems: Array<{
    sku: string;
    quantity: number;
    parentComboSku?: string | null;
    reason?: string;
  }>;
  receivedBy?: string;
  notes?: string;
  idempotencyKey?: string;
}

export class RtoService {
  /**
   * Fetch shipment/order details and explode all line items / combos into constituent Single SKUs.
   * Resolves by AWB, Order Number, or Order Name.
   */
  static async getShipmentReturnDetails(storeId: string, query: string) {
    const cleanQuery = query.trim().replace(/^#+/, "");

    // 1. Try finding shipment by exact AWB
    let shipment = await prisma.shipment.findUnique({
      where: { storeId_awb: { storeId, awb: cleanQuery } },
    });

    // 2. Try finding shipment by orderNumber or raw clean query
    if (!shipment) {
      shipment = await prisma.shipment.findFirst({
        where: {
          storeId,
          OR: [
            { awb: cleanQuery },
            { orderNumber: cleanQuery },
            { orderNumber: `#${cleanQuery}` },
            { awb: { contains: cleanQuery } },
          ],
        },
      });
    }

    // 3. Try finding order
    let order = null;
    let orderItems: any[] = [];

    if (shipment?.shopifyOrderId) {
      order = await prisma.shopifyOrder.findFirst({
        where: { storeId, shopifyOrderId: shipment.shopifyOrderId },
        include: {
          items: { where: { deletedAt: null } },
        },
      });
    }

    if (!order && (shipment?.orderNumber || cleanQuery)) {
      const orderSearch = shipment?.orderNumber || cleanQuery;
      order = await prisma.shopifyOrder.findFirst({
        where: {
          storeId,
          deletedAt: null,
          OR: [
            { orderNumber: orderSearch },
            { name: orderSearch },
            { name: `#${orderSearch}` },
            { shopifyOrderId: orderSearch },
          ],
        },
        include: {
          items: { where: { deletedAt: null } },
        },
      });
    }

    orderItems = order?.items || [];

    if (!shipment && !order) {
      throw new Error(`No shipment or order found matching barcode / AWB "${query}".`);
    }

    // Explode items into Single SKUs & Combo components
    const explodedComponents: RtoReturnComponentItem[] = [];

    for (const item of orderItems) {
      const rawSku = (item.sku || "").trim().toUpperCase();
      if (!rawSku || rawSku === "NO_SKU" || rawSku === "NULL") continue;

      const itemQty = item.quantity || 1;

      // Lookup StockItem in VOOP
      const stockItem = await prisma.stockItem.findUnique({
        where: { storeId_sku: { storeId, sku: rawSku } },
        include: {
          comboComponents: {
            include: { componentItem: true },
          },
        },
      });

      if (stockItem?.type === "COMBO" && stockItem.comboComponents.length > 0) {
        // Explode Combo into components
        for (const comp of stockItem.comboComponents) {
          const compQty = (comp.quantity || 1) * itemQty;
          explodedComponents.push({
            sku: comp.componentSku,
            name: comp.componentItem?.name || comp.componentSku,
            quantity: compQty,
            parentComboSku: stockItem.sku,
            unitCost: comp.componentItem?.avgUnitCost || 0,
            condition: "good",
          });
        }
      } else {
        // Single SKU
        explodedComponents.push({
          sku: stockItem?.sku || rawSku,
          name: stockItem?.name || item.productTitle,
          quantity: itemQty,
          parentComboSku: null,
          unitCost: stockItem?.avgUnitCost || 0,
          condition: "good",
        });
      }
    }

    return {
      shipment: shipment || {
        awb: cleanQuery,
        orderNumber: order?.orderNumber || order?.name,
        customerName: order?.name,
        status: "RTO Received",
        rtoInwardScanned: order?.rtoInwardScanned || false,
      },
      order,
      returnItems: explodedComponents,
      isAlreadyProcessed: shipment?.rtoInventoryProcessed || false,
    };
  }

  /**
   * Process physical RTO receipt with component-level inspection and update stock
   */
  static async receiveRtoShipment(storeId: string, params: ReceiveRtoParams) {
    const cleanAwb = params.awb.trim();
    let shipment = await prisma.shipment.findUnique({
      where: { storeId_awb: { storeId, awb: cleanAwb } },
    });

    if (!shipment) {
      // Fallback search
      shipment = await prisma.shipment.findFirst({
        where: {
          storeId,
          OR: [{ awb: cleanAwb }, { orderNumber: cleanAwb }, { orderNumber: `#${cleanAwb}` }],
        },
      });
    }

    const { items, condition, receivedBy = "Warehouse Staff", notes } = params;

    if (!items || items.length === 0) {
      throw new Error("No return items provided for inspection.");
    }

    // Execute in a strict atomic transaction
    return await prisma.$transaction(async (tx) => {
      const saleableAdded: Array<{ sku: string; quantity: number }> = [];
      const damagedAdded: Array<{ sku: string; quantity: number; parentComboSku?: string | null }> = [];

      for (const item of items) {
        const itemSku = (item.sku || "").trim().toUpperCase();
        const quantity = Math.max(0, Number(item.quantity) || 0);

        if (!itemSku || quantity === 0) continue;

        // Ensure Single StockItem exists
        let stockItem = await tx.stockItem.findUnique({
          where: { storeId_sku: { storeId, sku: itemSku } },
        });

        if (!stockItem) {
          stockItem = await tx.stockItem.create({
            data: {
              storeId,
              sku: itemSku,
              name: itemSku,
              type: "SINGLE",
              currentStock: 0,
              damagedStock: 0,
              availableStock: 0,
            },
          });
        }

        if (item.condition === "good") {
          // Add to Saleable Stock
          const updated = await tx.stockItem.update({
            where: { storeId_sku: { storeId, sku: itemSku } },
            data: {
              currentStock: { increment: quantity },
              availableStock: { increment: quantity },
            },
          });

          // Ledger Entry
          await tx.inventoryLedger.create({
            data: {
              storeId,
              sku: itemSku,
              type: "RTO_RETURN",
              inventoryBucket: "SALEABLE",
              quantity: quantity,
              unitCost: stockItem.avgUnitCost,
              balanceAfter: updated.currentStock,
              referenceType: "SHIPMENT_RTO",
              referenceId: cleanAwb,
              orderId: shipment?.shopifyOrderId,
              shipmentId: cleanAwb,
              createdBy: receivedBy,
              notes: notes || `RTO receipt in good condition (AWB: ${cleanAwb}, Order #${shipment?.orderNumber || ""})`,
            },
          });

          saleableAdded.push({ sku: itemSku, quantity });
        } else if (item.condition === "damaged") {
          // Add to Damaged Stock
          const updated = await tx.stockItem.update({
            where: { storeId_sku: { storeId, sku: itemSku } },
            data: {
              damagedStock: { increment: quantity },
            },
          });

          // Ledger Entry
          await tx.inventoryLedger.create({
            data: {
              storeId,
              sku: itemSku,
              type: "RTO_DAMAGE",
              inventoryBucket: "DAMAGED",
              quantity: quantity,
              unitCost: stockItem.avgUnitCost,
              balanceAfter: updated.damagedStock,
              referenceType: "SHIPMENT_RTO",
              referenceId: cleanAwb,
              orderId: shipment?.shopifyOrderId,
              shipmentId: cleanAwb,
              createdBy: receivedBy,
              notes:
                notes ||
                `RTO receipt marked DAMAGED${item.parentComboSku ? ` (from Combo: ${item.parentComboSku})` : ""} (AWB: ${cleanAwb}, Order #${shipment?.orderNumber || ""})`,
            },
          });

          damagedAdded.push({ sku: itemSku, quantity, parentComboSku: item.parentComboSku });
        }
      }

      // Update Shipment record if exists
      if (shipment) {
        await tx.shipment.update({
          where: { storeId_awb: { storeId, awb: shipment.awb } },
          data: {
            status: "RTO Delivered",
            normalizedStatus: "RTO_DELIVERED",
            rtoInventoryProcessed: true,
            rtoReceivedAt: new Date(),
            rtoCondition: condition,
            rtoReceivedBy: receivedBy,
            rtoInspectionDetails: JSON.stringify(items),
            rtoInwardScanned: true,
            rtoInwardScannedAt: new Date(),
          },
        });
      }

      return {
        success: true,
        shipmentAwb: cleanAwb,
        orderNumber: shipment?.orderNumber,
        saleableAdded,
        damagedAdded,
        message: "RTO inspection successfully recorded and inventory updated.",
      };
    });
  }

  /**
   * Dedicated Damage Scan Engine:
   * Moves specific Single / Combo component SKUs from Saleable Stock to Damaged Quarantine Stock.
   * Enforces:
   * 1. Store-scoped Idempotency (duplicate submissions return previous result without double movement)
   * 2. Server-side SKU validation against actual order line items & combo components
   * 3. Remaining allowable quantity validation (prevents over-damage across repeated scans)
   * 4. Store setting enforcement (if damageInventoryMovement is OFF, records damage without moving stock)
   * 5. Complete InventoryLedger audit trail with productId, variantId, orderId, shipmentId, idempotencyKey
   */
  static async flagDamageAndMoveStock(storeId: string, params: FlagDamageParams) {
    const cleanId = params.identifier.trim().replace(/^#+/, "");
    const { damagedItems, receivedBy = "Warehouse Inspector", notes } = params;

    if (!damagedItems || damagedItems.length === 0) {
      throw new Error("Please select at least one damaged SKU to move to the damage list.");
    }

    // 1. Resolve or compute store-scoped Idempotency Key
    const itemsHash = crypto
      .createHash("md5")
      .update(JSON.stringify(damagedItems.map((i) => ({ sku: i.sku.toUpperCase(), qty: i.quantity }))))
      .digest("hex")
      .slice(0, 16);
    const idempotencyKey = params.idempotencyKey || `dmg_${cleanId}_${itemsHash}`;

    // 2. Check Idempotency: If already executed, return previous result immediately
    const existingRecord = await prisma.damageRecord.findUnique({
      where: { storeId_idempotencyKey: { storeId, idempotencyKey } },
    });
    if (existingRecord) {
      let parsedItems: any[] = [];
      try {
        parsedItems = JSON.parse(existingRecord.damagedItems);
      } catch (_) {}
      return {
        success: true,
        referenceId: cleanId,
        isDuplicate: true,
        idempotencyKey,
        inventoryMoved: existingRecord.inventoryMoved,
        movedToDamage: parsedItems,
        message: "Damage operation already processed (idempotent duplicate).",
      };
    }

    // 3. Resolve Shipment and Associated Order server-side for independent validation
    let shipment = await prisma.shipment.findUnique({
      where: { storeId_awb: { storeId, awb: cleanId } },
    });

    if (!shipment) {
      shipment = await prisma.shipment.findFirst({
        where: {
          storeId,
          OR: [
            { awb: cleanId },
            { orderNumber: cleanId },
            { orderNumber: `#${cleanId}` },
            { awb: { contains: cleanId } },
          ],
        },
      });
    }

    let order = null;
    if (shipment?.shopifyOrderId) {
      order = await prisma.shopifyOrder.findFirst({
        where: { storeId, shopifyOrderId: shipment.shopifyOrderId },
        include: {
          items: { where: { deletedAt: null } },
        },
      });
    }

    if (!order && (shipment?.orderNumber || cleanId)) {
      const orderSearch = shipment?.orderNumber || cleanId;
      order = await prisma.shopifyOrder.findFirst({
        where: {
          storeId,
          deletedAt: null,
          OR: [
            { orderNumber: orderSearch },
            { name: orderSearch },
            { name: `#${orderSearch}` },
            { shopifyOrderId: orderSearch },
          ],
        },
        include: {
          items: { where: { deletedAt: null } },
        },
      });
    }

    // 4. Server-Side Validation: Build allowable items recipe from order line items and combo definitions
    const orderItems = order?.items || [];
    const allowableRecipeMap = new Map<string, { maxQuantity: number; name: string; parentComboSku: string | null }>();

    for (const item of orderItems) {
      const rawSku = (item.sku || "").trim().toUpperCase();
      if (!rawSku || rawSku === "NO_SKU" || rawSku === "NULL") continue;
      const itemQty = Math.max(1, Number(item.quantity) || 1);

      const stockItem = await prisma.stockItem.findUnique({
        where: { storeId_sku: { storeId, sku: rawSku } },
        include: {
          comboComponents: {
            include: { componentItem: true },
          },
        },
      });

      if (stockItem?.type === "COMBO" && stockItem.comboComponents.length > 0) {
        for (const comp of stockItem.comboComponents) {
          const compSku = comp.componentSku.toUpperCase();
          const compQty = (comp.quantity || 1) * itemQty;
          const prev = allowableRecipeMap.get(compSku);
          if (prev) {
            prev.maxQuantity += compQty;
          } else {
            allowableRecipeMap.set(compSku, {
              maxQuantity: compQty,
              name: comp.componentItem?.name || comp.componentSku,
              parentComboSku: stockItem.sku,
            });
          }
        }
      } else {
        const singleSku = (stockItem?.sku || rawSku).toUpperCase();
        const prev = allowableRecipeMap.get(singleSku);
        if (prev) {
          prev.maxQuantity += itemQty;
        } else {
          allowableRecipeMap.set(singleSku, {
            maxQuantity: itemQty,
            name: stockItem?.name || item.productTitle,
            parentComboSku: null,
          });
        }
      }
    }

    // 5. Query previously recorded damage for this AWB to validate remaining allowable quantity
    const previousDamageRecords = await prisma.damageRecord.findMany({
      where: { storeId, awb: cleanId },
    });
    const previouslyDamagedMap = new Map<string, number>();
    for (const rec of previousDamageRecords) {
      try {
        const items = JSON.parse(rec.damagedItems);
        if (Array.isArray(items)) {
          for (const it of items) {
            const s = (it.sku || "").trim().toUpperCase();
            const q = Number(it.quantity) || 0;
            previouslyDamagedMap.set(s, (previouslyDamagedMap.get(s) || 0) + q);
          }
        }
      } catch (_) {}
    }

    // 6. Validate every requested damaged SKU and quantity
    for (const item of damagedItems) {
      const sku = (item.sku || "").trim().toUpperCase();
      const quantity = Number(item.quantity);

      if (!quantity || quantity <= 0) {
        throw new Error(`Invalid damage quantity (${quantity}) for SKU "${sku}". Quantity must be greater than 0.`);
      }

      // If the order has items, strictly enforce that submitted SKU belongs to the order
      if (orderItems.length > 0) {
        const allowable = allowableRecipeMap.get(sku);
        if (!allowable) {
          throw new Error(`Rejected: SKU "${sku}" is not part of this order / shipment "${params.identifier}".`);
        }

        const alreadyDamaged = previouslyDamagedMap.get(sku) || 0;
        const remainingAllowable = allowable.maxQuantity - alreadyDamaged;
        if (quantity > remainingAllowable) {
          throw new Error(
            `Rejected: Quantity ${quantity} for SKU "${sku}" exceeds remaining allowable quantity of ${remainingAllowable} unit(s) (Order total: ${allowable.maxQuantity}, previously damaged: ${alreadyDamaged}).`
          );
        }
      }
    }

    // 7. Inventory movement flag for explicit damage quarantine confirmation
    const shouldMoveInventory = true;

    // 8. Execute Atomic Transaction
    return await prisma.$transaction(async (tx) => {
      const movedList: Array<{
        sku: string;
        name: string;
        quantity: number;
        parentComboSku?: string | null;
        saleableRemaining: number;
        damagedTotal: number;
      }> = [];

      for (const item of damagedItems) {
        const sku = (item.sku || "").trim().toUpperCase();
        const quantity = Math.max(1, Number(item.quantity) || 1);

        if (!sku) continue;

        let stockItem = await tx.stockItem.findUnique({
          where: { storeId_sku: { storeId, sku } },
        });

        if (!stockItem) {
          stockItem = await tx.stockItem.create({
            data: {
              storeId,
              sku,
              name: sku,
              type: "SINGLE",
              currentStock: 0,
              damagedStock: 0,
              availableStock: 0,
            },
          });
        }

        let updatedStockItem = stockItem;
        if (shouldMoveInventory) {
          // Deduct from Saleable Stock and Add to Damaged Stock
          updatedStockItem = await tx.stockItem.update({
            where: { storeId_sku: { storeId, sku } },
            data: {
              currentStock: { decrement: quantity },
              availableStock: { decrement: quantity },
              damagedStock: { increment: quantity },
            },
          });

          // Lookup variant for productId / variantId audit traceability
          const variant = await tx.shopifyVariant.findFirst({
            where: { storeId, sku },
            select: { shopifyProductId: true, shopifyVariantId: true },
          });

          // Create complete audit ledger entry
          await tx.inventoryLedger.create({
            data: {
              storeId,
              sku,
              type: "DAMAGE_QUARANTINE",
              inventoryBucket: "DAMAGED",
              quantity,
              unitCost: stockItem.avgUnitCost,
              balanceAfter: updatedStockItem.damagedStock,
              referenceType: "DAMAGE_SCAN",
              referenceId: cleanId,
              orderId: order?.shopifyOrderId || shipment?.shopifyOrderId || null,
              shipmentId: shipment?.id || cleanId,
              productId: variant?.shopifyProductId || null,
              variantId: variant?.shopifyVariantId || null,
              idempotencyKey,
              createdBy: receivedBy,
              notes:
                notes ||
                `Damage Scan: Moved ${quantity}x ${sku}${item.parentComboSku ? ` (from Combo ${item.parentComboSku})` : ""} from Saleable Stock into Damaged Quarantine (Ref: ${cleanId})`,
            },
          });
        }

        movedList.push({
          sku,
          name: stockItem.name || sku,
          quantity,
          parentComboSku: item.parentComboSku || null,
          saleableRemaining: updatedStockItem.currentStock,
          damagedTotal: updatedStockItem.damagedStock,
        });
      }

      // Record the Damage Operation for audit and idempotency
      await tx.damageRecord.create({
        data: {
          storeId,
          shipmentId: shipment?.id || cleanId,
          orderId: order?.shopifyOrderId || shipment?.shopifyOrderId || null,
          awb: cleanId,
          idempotencyKey,
          damagedItems: JSON.stringify(damagedItems),
          receivedBy,
          notes,
          inventoryMoved: shouldMoveInventory,
        },
      });

      // Update shipment if found
      if (shipment) {
        await tx.shipment.update({
          where: { storeId_awb: { storeId, awb: shipment.awb } },
          data: {
            rtoCondition: "damaged",
            rtoInspectionDetails: JSON.stringify(damagedItems),
          },
        });
      }

      // Update order if found
      if (order) {
        await tx.shopifyOrder.update({
          where: { id: order.id },
          data: { deliveryStatus: "RTO_DAMAGED" },
        });
      }

      return {
        success: true,
        referenceId: cleanId,
        idempotencyKey,
        inventoryMoved: shouldMoveInventory,
        movedToDamage: movedList,
        message: shouldMoveInventory
          ? `Successfully moved ${movedList.length} damaged SKU(s) from Saleable Stock to Damaged Quarantine!`
          : `Damage recorded successfully for ${movedList.length} SKU(s) (Inventory movement is toggled OFF).`,
      };
    });
  }
}

import { prisma } from "../prisma";

export interface PurchaseBillInput {
  billNumber: string;
  billType?: string; // INVENTORY, TRANSPORTATION, SHIPPING_LOGISTICS, PACKAGING, MARKETING_ADS, OPERATIONAL_OVERHEAD, MISC
  supplier: string;
  billDate?: string | Date;
  dueDate?: string | Date;
  paymentStatus?: string; // PAID, PENDING, PARTIAL, OVERDUE
  paymentMode?: string;
  notes?: string;
  attachmentUrl?: string;
  items: Array<{
    sku?: string;
    itemName: string;
    category?: string;
    quantity: number;
    unitCost: number;
    taxRate?: number;
    discount?: number;
    /** When true this line is excluded from P&L expense calculations (prevents double-counting) */
    alreadyAddedToPnl?: boolean;
  }>;
}

export class PurchasesService {
  /**
   * List all purchase and expense bills
   */
  static async getBills(storeId: string, filter?: { billType?: string; paymentStatus?: string; supplier?: string }) {
    const where: any = { storeId };
    if (filter?.billType && filter.billType !== "ALL") {
      if (filter.billType === "TRANSPORTATION" || filter.billType === "SHIPPING_LOGISTICS") {
        where.billType = { in: ["TRANSPORTATION", "SHIPPING_LOGISTICS"] };
      } else {
        where.billType = filter.billType;
      }
    }
    if (filter?.paymentStatus && filter.paymentStatus !== "ALL") {
      where.paymentStatus = filter.paymentStatus;
    }
    if (filter?.supplier) {
      where.supplier = { contains: filter.supplier, mode: "insensitive" };
    }

    const bills = await prisma.purchaseBill.findMany({
      where,
      include: {
        items: true,
      },
      orderBy: { billDate: "desc" },
    });

    const totalAmount = bills.reduce((acc, b) => acc + b.totalAmount, 0);
    const paidAmount = bills.filter((b) => b.paymentStatus === "PAID").reduce((acc, b) => acc + b.totalAmount, 0);
    const pendingAmount = bills.filter((b) => b.paymentStatus !== "PAID").reduce((acc, b) => acc + b.totalAmount, 0);

    const typeBreakdown = {
      INVENTORY: bills.filter((b) => b.billType === "INVENTORY").reduce((acc, b) => acc + b.totalAmount, 0),
      TRANSPORTATION: bills.filter((b) => b.billType === "TRANSPORTATION" || b.billType === "SHIPPING_LOGISTICS").reduce((acc, b) => acc + b.totalAmount, 0),
      PACKAGING: bills.filter((b) => b.billType === "PACKAGING").reduce((acc, b) => acc + b.totalAmount, 0),
      MARKETING_ADS: bills.filter((b) => b.billType === "MARKETING_ADS").reduce((acc, b) => acc + b.totalAmount, 0),
      OPERATIONAL_OVERHEAD: bills.filter((b) => b.billType === "OPERATIONAL_OVERHEAD").reduce((acc, b) => acc + b.totalAmount, 0),
      MISC: bills.filter((b) => b.billType === "MISC").reduce((acc, b) => acc + b.totalAmount, 0),
    };

    return {
      summary: {
        totalBills: bills.length,
        totalAmount,
        paidAmount,
        pendingAmount,
        typeBreakdown,
      },
      bills,
    };
  }

  /**
   * Create and Post a Purchase Bill
   * Automatically adds physical stock for any item with an SKU and logs ledger entries.
   */
  static async createBill(storeId: string, input: PurchaseBillInput) {
    const billDate = input.billDate ? new Date(input.billDate) : new Date();
    const dueDate = input.dueDate ? new Date(input.dueDate) : null;
    const billType = input.billType || "INVENTORY";

    let subtotal = 0;
    let taxTotal = 0;
    let discountTotal = 0;

    const formattedItems = input.items.map((item) => {
      const qty = Math.max(1, Number(item.quantity) || 1);
      const unitCost = Number(item.unitCost) || 0;
      const discount = Number(item.discount) || 0;
      const taxRate = Number(item.taxRate) || 0;
      const lineSubtotal = qty * unitCost - discount;
      const taxAmount = (lineSubtotal * taxRate) / 100;
      const totalAmount = lineSubtotal + taxAmount;

      subtotal += lineSubtotal;
      taxTotal += taxAmount;
      discountTotal += discount;

      return {
        storeId,
        sku: item.sku ? item.sku.trim().toUpperCase() : null,
        itemName: item.itemName,
        category: item.category || billType,
        quantity: qty,
        unitCost,
        taxRate,
        taxAmount,
        discount,
        totalAmount,
        // Preserve the flag; default false so existing behaviour is unchanged
        alreadyAddedToPnl: Boolean(item.alreadyAddedToPnl),
      };
    });

    const finalTotal = subtotal + taxTotal;

    // Create the Bill record
    const bill = await prisma.purchaseBill.create({
      data: {
        storeId,
        billNumber: input.billNumber,
        billType,
        supplier: input.supplier,
        billDate,
        dueDate,
        paymentStatus: input.paymentStatus || "PAID",
        paymentMode: input.paymentMode || "BANK_TRANSFER",
        notes: input.notes,
        attachmentUrl: input.attachmentUrl,
        subtotal,
        taxTotal,
        discountTotal,
        totalAmount: finalTotal,
        status: "POSTED",
        items: {
          create: formattedItems,
        },
      },
      include: {
        items: true,
      },
    });

    // If Inventory items with SKUs exist, credit physical stock and log ledger
    for (const item of formattedItems) {
      if (item.sku) {
        const existingStock = await prisma.stockItem.findUnique({
          where: { storeId_sku: { storeId, sku: item.sku } },
        });

        if (existingStock) {
          const newQty = existingStock.currentStock + item.quantity;
          const oldTotalCost = existingStock.currentStock * existingStock.avgUnitCost;
          const newTotalCost = oldTotalCost + item.quantity * item.unitCost;
          const newAvgCost = newQty > 0 ? newTotalCost / newQty : item.unitCost;

          await prisma.stockItem.update({
            where: { storeId_sku: { storeId, sku: item.sku } },
            data: {
              currentStock: newQty,
              availableStock: Math.max(0, newQty - existingStock.reservedStock),
              avgUnitCost: newAvgCost,
            },
          });

          await prisma.inventoryLedger.create({
            data: {
              storeId,
              sku: item.sku,
              type: "GRN_PURCHASE",
              quantity: item.quantity,
              unitCost: item.unitCost,
              balanceAfter: newQty,
              referenceType: "PURCHASE_BILL",
              referenceId: bill.billNumber,
              billId: bill.id,
              notes: `GRN from ${input.supplier} (Bill #${bill.billNumber})`,
            },
          });
        }
      }
    }

    return bill;
  }

  /**
   * Delete a Purchase Bill and roll back inventory
   */
  static async deleteBill(storeId: string, id: string) {
    const bill = await prisma.purchaseBill.findFirst({
      where: { id, storeId },
      include: { items: true },
    });

    if (!bill) throw new Error("Bill not found");

    for (const item of bill.items) {
      if (item.sku) {
        const stock = await prisma.stockItem.findUnique({
          where: { storeId_sku: { storeId, sku: item.sku } },
        });

        if (stock) {
          const revertedStock = Math.max(0, stock.currentStock - item.quantity);
          await prisma.stockItem.update({
            where: { storeId_sku: { storeId, sku: item.sku } },
            data: {
              currentStock: revertedStock,
              availableStock: Math.max(0, revertedStock - stock.reservedStock),
            },
          });

          await prisma.inventoryLedger.create({
            data: {
              storeId,
              sku: item.sku,
              type: "ADJUSTMENT",
              quantity: -item.quantity,
              unitCost: item.unitCost,
              balanceAfter: revertedStock,
              referenceType: "MANUAL_ADJUSTMENT",
              referenceId: `DELETED_${bill.billNumber}`,
              notes: `Reversal of deleted bill #${bill.billNumber}`,
            },
          });
        }
      }
    }

    await prisma.purchaseBill.delete({
      where: { id },
    });

    return { success: true };
  }
}

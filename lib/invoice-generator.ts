import { prisma } from "@/lib/prisma";
import { resolveIndianState, IndianStateInfo } from "@/lib/gst-state-helper";
import { numberToIndianWords } from "@/lib/number-to-words";

export interface InvoiceCompanySnapshot {
  legalEntityName: string;
  tradeName: string;
  gstin: string;
  pan: string;
  cin: string;
  lutNumber: string;
  logo: string;
  addressLine: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
  phone: string;
  bankName: string;
  bankAccountNumber: string;
  ifsc: string;
  upi: string;
  termsAndConditions: string;
  authorizedSignatory: string;
  stateCode?: string;
  email?: string;
  website?: string;
  invoicePrefix?: string;
  declaration?: string;
  signatureUrl?: string;
  accountHolderName?: string;
  branchName?: string;
}

/**
 * Resolves Company Profile & Invoice Master for an order:
 * 1. If order already has invoiceCompanySnapshot and not forced refresh, preserve that issued snapshot.
 * 2. If new invoice, load store_settings for storeId.
 * 3. Validate required fields (companyName and gstin). Reject invoice generation if missing!
 * 4. Create snapshot, persist to order, and return snapshot.
 */
async function resolveAndSnapshotCompany(
  storeId: string,
  orderRecord: { id: string; invoiceCompanySnapshot?: string | null },
  isOfflineOrder: boolean,
  cachedCompany?: any,
  options?: { refreshCompanySnapshot?: boolean }
): Promise<InvoiceCompanySnapshot> {
  // 1. Preserve existing issued snapshot if already present
  if (orderRecord.invoiceCompanySnapshot && !options?.refreshCompanySnapshot) {
    try {
      const parsed = JSON.parse(orderRecord.invoiceCompanySnapshot);
      if (parsed && (parsed.legalEntityName || parsed.companyName) && parsed.gstin) {
        return {
          legalEntityName: parsed.legalEntityName || parsed.companyName || "",
          tradeName: parsed.tradeName || "",
          gstin: parsed.gstin || "",
          pan: parsed.pan || "",
          cin: parsed.cin || "",
          lutNumber: parsed.lutNumber || "",
          logo: parsed.logo || parsed.logoUrl || "",
          addressLine: parsed.addressLine || parsed.address || "",
          city: parsed.city || "",
          state: parsed.state || "",
          pincode: parsed.pincode || "",
          country: parsed.country || "India",
          phone: parsed.phone || "",
          bankName: parsed.bankName || "",
          bankAccountNumber: parsed.bankAccountNumber || parsed.accountNumber || "",
          ifsc: parsed.ifsc || parsed.ifscCode || "",
          upi: parsed.upi || parsed.upiId || "",
          termsAndConditions: parsed.termsAndConditions || parsed.termsConditions || "",
          authorizedSignatory: parsed.authorizedSignatory || "Authorized Signatory",
          stateCode: parsed.stateCode || "",
          email: parsed.email || "",
          website: parsed.website || "",
          invoicePrefix: parsed.invoicePrefix || "",
          declaration: parsed.declaration || "",
          signatureUrl: parsed.signatureUrl || "",
          accountHolderName: parsed.accountHolderName || parsed.legalEntityName || "",
          branchName: parsed.branchName || "",
        };
      }
    } catch (e) {
      console.warn("Failed to parse existing invoiceCompanySnapshot:", e);
    }
  }

  // 2. Fetch Company Master for this storeId from database
  const companyMaster = cachedCompany || (await prisma.storeSetting.findUnique({
    where: { storeId },
  }));

  // 3. VALIDATION: Reject if required company information is missing
  const legalName = (companyMaster?.companyName || "").trim();
  const gstin = (companyMaster?.gstin || "").trim();

  if (!companyMaster || !legalName || !gstin) {
    throw new Error(
      `Cannot generate invoice: Company Profile & Invoice Master has not been configured for this store (${storeId}). Please configure Legal Entity Name and GSTIN in Settings > Company & Invoice.`
    );
  }

  // 4. Build immutable snapshot containing all 18 specified fields
  const snapshot: InvoiceCompanySnapshot = {
    legalEntityName: legalName,
    tradeName: (companyMaster.tradeName || "").trim(),
    gstin: gstin,
    pan: (companyMaster.pan || "").trim(),
    cin: (companyMaster.cin || "").trim(),
    lutNumber: (companyMaster.lutNumber || "").trim(),
    logo: companyMaster.logoUrl || "",
    addressLine: `${companyMaster.addressLine1 || ""}${companyMaster.addressLine2 ? `, ${companyMaster.addressLine2}` : ""}`.trim(),
    city: (companyMaster.city || "").trim(),
    state: (companyMaster.state || "").trim(),
    pincode: (companyMaster.pincode || "").trim(),
    country: companyMaster.country || "India",
    phone: (companyMaster.phone || "").trim(),
    bankName: (companyMaster.bankName || "").trim(),
    bankAccountNumber: (companyMaster.accountNumber || "").trim(),
    ifsc: (companyMaster.ifscCode || "").trim(),
    upi: (companyMaster.upiId || "").trim(),
    termsAndConditions: (companyMaster.termsConditions || "").trim(),
    authorizedSignatory: (companyMaster.authorizedSignatory || "Authorized Signatory").trim(),
    stateCode: (companyMaster.stateCode || "").trim(),
    email: (companyMaster.email || "").trim(),
    website: (companyMaster.website || "").trim(),
    invoicePrefix: (companyMaster.invoicePrefix || "").trim(),
    declaration: (companyMaster.declaration || "").trim(),
    signatureUrl: (companyMaster.signatureUrl || "").trim(),
    accountHolderName: (companyMaster.accountHolderName || legalName).trim(),
    branchName: (companyMaster.branchName || "").trim(),
  };

  // 5. Persist snapshot onto order record
  try {
    const snapshotStr = JSON.stringify(snapshot);
    if (isOfflineOrder) {
      await prisma.offlineOrder.update({
        where: { id: orderRecord.id },
        data: { invoiceCompanySnapshot: snapshotStr },
      });
    } else {
      await prisma.shopifyOrder.update({
        where: { id: orderRecord.id },
        data: { invoiceCompanySnapshot: snapshotStr },
      });
    }
  } catch (err) {
    console.error("Failed to persist invoiceCompanySnapshot to order:", err);
  }

  return snapshot;
}

export async function generateInvoiceForOrder(
  orderIdOrNumber: string,
  cachedCompany?: any,
  cachedTaxConfigs?: Map<string, any>,
  authenticatedStoreId?: string,
  options?: { refreshCompanySnapshot?: boolean; refreshComboSnapshot?: boolean }
) {
  // 1. Fetch Order with Items and Fulfillments (scoped to authenticatedStoreId if provided)
  const order = await prisma.shopifyOrder.findFirst({
    where: {
      ...(authenticatedStoreId ? { storeId: authenticatedStoreId } : {}),
      OR: [
        { id: orderIdOrNumber },
        { shopifyOrderId: orderIdOrNumber },
        { orderNumber: orderIdOrNumber },
        { orderNumber: `#${orderIdOrNumber}` },
      ],
    },
    include: {
      items: {
        where: { deletedAt: null },
      },
      fulfillments: true,
    },
  });

  if (!order) return null;

  // 2. Resolve Company Master & Snapshot (Strictly isolated by storeId, zero hardcoded fallbacks)
  const companySnapshot = await resolveAndSnapshotCompany(
    order.storeId,
    order,
    false,
    cachedCompany,
    options
  );

  // 3. Fetch Shipment (Strictly isolated by storeId)
  const cleanOrderNum = (order.orderNumber || "").replace("#", "").trim();
  const shipment = await prisma.shipment.findFirst({
    where: { storeId: order.storeId, orderNumber: cleanOrderNum, deletedAt: null },
  });

  // Determine if order invoice is finalized/issued
  // Finalized orders (outward scanned, delivered, or fulfilled) retain immutable historical snapshots.
  // Unfinalized draft/previews dynamically reflect current store configuration.
  const isOrderFinalized = Boolean(
    order.outwardScanned ||
    order.deliveryStatus === "DELIVERED" ||
    order.deliveryStatus === "IN_TRANSIT" ||
    order.deliveryStatus === "SHIPPED" ||
    order.fulfillmentStatus === "FULFILLED"
  );

  // 4. Resolve States
  const originStateInfo: IndianStateInfo = resolveIndianState(companySnapshot.state || "KERALA");

  let shippingAddressObj: any = null;
  if (order.shippingAddress) {
    try {
      shippingAddressObj = JSON.parse(order.shippingAddress);
    } catch {
      shippingAddressObj = { province: order.shippingAddress };
    }
  }

  let billingAddressObj: any = shippingAddressObj;
  if (order.rawPayload) {
    try {
      const raw = JSON.parse(order.rawPayload);
      if (raw.billing_address) {
        billingAddressObj = raw.billing_address;
      }
    } catch {}
  }

  const destStateInfo: IndianStateInfo = resolveIndianState(shippingAddressObj);
  const isIntraState = destStateInfo.code === originStateInfo.code;

  // 5. Fetch Stock Items, Variants, Tax Configs & Combo Invoice Components (STRICTLY SCOPED TO THIS STORE)
  const storeId = order.storeId;
  const [stockItems, shopifyVariants, taxConfigs, comboInvoiceConfigs] = await Promise.all([
    prisma.stockItem.findMany({
      where: { storeId },
      include: {
        comboComponents: {
          include: { componentItem: true },
        },
      },
    }),
    prisma.shopifyVariant.findMany({
      where: { storeId },
      include: { product: true },
    }),
    prisma.productTaxConfig.findMany({
      where: { storeId },
    }),
    prisma.comboInvoiceComponent.findMany({
      where: { storeId },
    }),
  ]);

  const stockItemMap = new Map<string, any>();
  stockItems.forEach((si) => stockItemMap.set(si.sku.toUpperCase().trim(), si));

  const variantSkuMap = new Map<string, any>();
  shopifyVariants.forEach((v) => {
    if (v.sku) variantSkuMap.set(v.sku.toUpperCase().trim(), v);
  });

  const taxConfigMap = new Map<string, any>();
  taxConfigs.forEach((tc) => taxConfigMap.set(tc.sku.toUpperCase().trim(), tc));

  const comboInvoiceMap = new Map<string, any[]>();
  comboInvoiceConfigs.forEach((cic) => {
    const cSku = cic.comboSku.toUpperCase().trim();
    if (!comboInvoiceMap.has(cSku)) comboInvoiceMap.set(cSku, []);
    comboInvoiceMap.get(cSku)!.push(cic);
  });

  // 6. Calculate Line Items from Authoritative Order Snapshot (Strict Minor-Unit / Paise Reconciliation)
  let subtotalTaxablePaise = 0;
  let totalCgstPaise = 0;
  let totalSgstPaise = 0;
  let totalIgstPaise = 0;
  let totalTaxPaise = 0;
  let totalGrossPaise = 0;
  let totalDiscountPaise = 0;

  const invoiceItems: any[] = [];
  let srCounter = 1;

  for (const item of order.items) {
    const rawSku = (item.sku || "").toUpperCase().trim();
    const itemQty = item.quantity || 1;
    const originalUnitPrice = item.unitPrice || 0;
    const stockItem = stockItemMap.get(rawSku);
    const isCombo = stockItem?.type === "COMBO" || (stockItem?.comboComponents && stockItem.comboComponents.length > 0);

    // Extract line item discount from authoritative order snapshot
    let lineDiscount = 0;

    // Source 1: item.rawPayload (discount_allocations)
    if (item.rawPayload) {
      try {
        const parsedItem = JSON.parse(item.rawPayload);
        if (parsedItem.discount_allocations && Array.isArray(parsedItem.discount_allocations)) {
          const allocSum = parsedItem.discount_allocations.reduce((sum: number, alloc: any) => {
            return sum + (parseFloat(alloc.amount || alloc.allocatedAmountSet?.shopMoney?.amount || "0") || 0);
          }, 0);
          if (allocSum > lineDiscount) lineDiscount = allocSum;
        }
        if (parsedItem.total_discount) {
          const tot = parseFloat(parsedItem.total_discount) || 0;
          if (tot > lineDiscount) lineDiscount = tot;
        }
      } catch {}
    }

    // Source 2: order.rawPayload line_items matching this line item
    if (order.rawPayload && lineDiscount === 0) {
      try {
        const parsedOrder = JSON.parse(order.rawPayload);
        if (parsedOrder.line_items && Array.isArray(parsedOrder.line_items)) {
          const matchedRaw = parsedOrder.line_items.find((li: any) =>
            (item.shopifyLineItemId && String(li.id) === String(item.shopifyLineItemId)) ||
            (rawSku && (li.sku || "").toUpperCase().trim() === rawSku)
          );
          if (matchedRaw?.discount_allocations && Array.isArray(matchedRaw.discount_allocations)) {
            const allocSum = matchedRaw.discount_allocations.reduce((sum: number, alloc: any) => {
              return sum + (parseFloat(alloc.amount || alloc.allocatedAmountSet?.shopMoney?.amount || "0") || 0);
            }, 0);
            if (allocSum > lineDiscount) lineDiscount = allocSum;
          }
        }
      } catch {}
    }

    // Source 3: item.discountTotal
    if (item.discountTotal && item.discountTotal > lineDiscount) {
      lineDiscount = item.discountTotal;
    }

    // Source 4: Proportional fallback if order has totalDiscounts but line item had no direct allocation
    if (lineDiscount === 0 && order.totalDiscounts && order.totalDiscounts > 0) {
      const orderGrossTotal = order.items.reduce((sum: number, it: any) => sum + (it.unitPrice || 0) * (it.quantity || 1), 0);
      if (orderGrossTotal > 0) {
        const lineGross = originalUnitPrice * itemQty;
        lineDiscount = Number(((lineGross / orderGrossTotal) * order.totalDiscounts).toFixed(2));
      }
    }

    // Net line transaction amount
    const originalGrossTotal = originalUnitPrice * itemQty;
    const netGrossTotal = Math.max(0, Number((originalGrossTotal - lineDiscount).toFixed(2)));

    // Check if this Combo has custom invoice components (from order snapshot or store config)
    let comboComponentsToUse: any[] | null = null;
    if (isCombo) {
      const savedConfigs = rawSku ? comboInvoiceMap.get(rawSku) : undefined;
      const forceRefresh = options?.refreshComboSnapshot === true;

      // DATA PRIORITY RULES:
      // 1. Unfinalized Order / Draft Preview (or explicit refresh requested):
      //    The current authoritative store configuration (ComboInvoiceComponent) takes precedence.
      //    We synchronize the latest snapshot onto the order item so draft data is always fresh.
      // 2. Finalized / Issued Order (outward scanned, delivered, or fulfilled):
      //    Historical financial records are IMMUTABLE. Preserved from item.comboInvoiceComponents snapshot.
      if (!isOrderFinalized || forceRefresh) {
        if (savedConfigs && savedConfigs.length > 0) {
          comboComponentsToUse = savedConfigs;
          // Synchronize snapshot on draft order item
          try {
            const snapshotJson = JSON.stringify(
              savedConfigs.map((c: any) => ({
                componentSku: c.componentSku,
                quantity: c.quantity,
                allocatedValue: c.allocatedValue,
                gstRate: c.gstRate,
                hsnCode: c.hsnCode || "",
                taxMode: c.taxMode || "INCLUSIVE",
              }))
            );
            if (item.comboInvoiceComponents !== snapshotJson) {
              await prisma.shopifyOrderItem.update({
                where: { id: item.id },
                data: { comboInvoiceComponents: snapshotJson },
              });
              item.comboInvoiceComponents = snapshotJson;
            }
          } catch (snapshotErr) {
            console.warn("Could not sync draft comboInvoiceComponents to line item:", snapshotErr);
          }
        } else if (item.comboInvoiceComponents) {
          try {
            const parsed = JSON.parse(item.comboInvoiceComponents);
            if (Array.isArray(parsed) && parsed.length > 0) {
              comboComponentsToUse = parsed;
            }
          } catch {}
        }
      } else {
        // Finalized order: check historical immutable snapshot first
        if (item.comboInvoiceComponents) {
          try {
            const parsed = JSON.parse(item.comboInvoiceComponents);
            if (Array.isArray(parsed) && parsed.length > 0) {
              comboComponentsToUse = parsed;
            }
          } catch {}
        }

        // Fallback only if historical snapshot was missing on finalized order
        if (!comboComponentsToUse && savedConfigs && savedConfigs.length > 0) {
          comboComponentsToUse = savedConfigs;
          try {
            const snapshotJson = JSON.stringify(
              savedConfigs.map((c: any) => ({
                componentSku: c.componentSku,
                quantity: c.quantity,
                allocatedValue: c.allocatedValue,
                gstRate: c.gstRate,
                hsnCode: c.hsnCode || "",
                taxMode: c.taxMode || "INCLUSIVE",
              }))
            );
            await prisma.shopifyOrderItem.update({
              where: { id: item.id },
              data: { comboInvoiceComponents: snapshotJson },
            });
            item.comboInvoiceComponents = snapshotJson;
          } catch (snapshotErr) {
            console.warn("Could not persist initial snapshot to finalized line item:", snapshotErr);
          }
        }
      }
    }

    // IF COMBO WITH CUSTOM COMPONENT BREAKDOWN:
    if (isCombo && comboComponentsToUse && comboComponentsToUse.length > 0) {
      const comboTitle = stockItem?.name || item.productTitle || "Combo Item";
      const totalConfigAllocPaise = comboComponentsToUse.reduce(
        (sum, c) => sum + Math.round((parseFloat(c.allocatedValue) || 0) * (parseFloat(c.quantity) || 1) * 100),
        0
      );

      const totalLineGrossPaise = Math.round(originalGrossTotal * 100);
      const totalLineDiscountPaise = Math.round(lineDiscount * 100);

      // Step A: Calculate proportional discount for each component with exact reconciliation
      const compCalculations: any[] = [];
      let distributedDiscountPaise = 0;

      for (let i = 0; i < comboComponentsToUse.length; i++) {
        const comp = comboComponentsToUse[i];
        const compSku = (comp.componentSku || "").toUpperCase().trim();
        const compQty = (parseFloat(comp.quantity) || 1) * itemQty;
        const compAllocVal = parseFloat(comp.allocatedValue) || 0;
        const compBaseGrossPaise = Math.round(compAllocVal * compQty * 100);

        // Proportional discount allocation based on configured value
        let compDiscPaise = 0;
        if (totalLineDiscountPaise > 0 && totalConfigAllocPaise > 0) {
          compDiscPaise = Math.round(
            (compBaseGrossPaise / (totalConfigAllocPaise * itemQty)) * totalLineDiscountPaise
          );
        }
        distributedDiscountPaise += compDiscPaise;

        compCalculations.push({
          comp,
          compSku,
          compQty,
          compAllocVal,
          compBaseGrossPaise,
          compDiscPaise,
        });
      }

      // Reconcile discount rounding drift onto the largest component
      const discountDriftPaise = totalLineDiscountPaise - distributedDiscountPaise;
      if (discountDriftPaise !== 0 && compCalculations.length > 0) {
        let maxComp = compCalculations[0];
        for (const cc of compCalculations) {
          if (cc.compBaseGrossPaise > maxComp.compBaseGrossPaise) maxComp = cc;
        }
        maxComp.compDiscPaise += discountDriftPaise;
      }

      // Push Parent Combo Header row
      invoiceItems.push({
        srNo: srCounter++,
        title: comboTitle,
        variantTitle: item.variantTitle,
        sku: rawSku,
        type: "COMBO",
        hsnCode: "",
        quantity: itemQty,
        unitPrice: Number(originalUnitPrice.toFixed(2)),
        discountAmount: Number(lineDiscount.toFixed(2)),
        unitPriceExclTax: 0,
        grossItemTotal: Number(originalGrossTotal.toFixed(2)),
        taxableValue: 0,
        taxRate: 0,
        isTaxInclusive: true,
        cgstRate: 0,
        cgstAmount: 0,
        sgstRate: 0,
        sgstAmount: 0,
        igstRate: 0,
        igstAmount: 0,
        grossTotal: Number(netGrossTotal.toFixed(2)),
        isComboHeader: true,
        hasComponents: true,
      });

      // Step B: Calculate taxes per component
      for (const cc of compCalculations) {
        const { comp, compSku, compQty, compAllocVal, compBaseGrossPaise, compDiscPaise } = cc;
        const compNetGrossPaise = compBaseGrossPaise - compDiscPaise;
        const compGstRate = comp.gstRate !== undefined ? parseFloat(comp.gstRate) : 18.0;
        const isCompTaxInclusive = comp.taxMode !== "EXCLUSIVE";

        let compTaxablePaise = 0;
        let compTaxPaise = 0;

        if (isCompTaxInclusive) {
          if (compGstRate > 0) {
            compTaxablePaise = Math.round(compNetGrossPaise / (1 + compGstRate / 100));
            compTaxPaise = compNetGrossPaise - compTaxablePaise;
          } else {
            compTaxablePaise = compNetGrossPaise;
            compTaxPaise = 0;
          }
        } else {
          compTaxablePaise = compNetGrossPaise;
          compTaxPaise = compGstRate > 0 ? Math.round(compTaxablePaise * (compGstRate / 100)) : 0;
        }

        let compCgstPaise = 0;
        let compSgstPaise = 0;
        let compIgstPaise = 0;

        if (isIntraState) {
          compCgstPaise = Math.floor(compTaxPaise / 2);
          compSgstPaise = compTaxPaise - compCgstPaise;
        } else {
          compIgstPaise = compTaxPaise;
        }

        const compTaxableValue = compTaxablePaise / 100;
        const compTaxAmount = compTaxPaise / 100;
        const compCgstAmount = compCgstPaise / 100;
        const compSgstAmount = compSgstPaise / 100;
        const compIgstAmount = compIgstPaise / 100;
        const compFinalLineTotal = (compTaxablePaise + compTaxPaise) / 100;
        const compUnitPriceExcl = compQty > 0 ? Number((compTaxableValue / compQty).toFixed(2)) : compTaxableValue;

        subtotalTaxablePaise += compTaxablePaise;
        totalCgstPaise += compCgstPaise;
        totalSgstPaise += compSgstPaise;
        totalIgstPaise += compIgstPaise;
        totalTaxPaise += compTaxPaise;
        totalGrossPaise += Math.round(compFinalLineTotal * 100);
        totalDiscountPaise += compDiscPaise;

        const compStockItem = stockItemMap.get(compSku);
        const compTitle = compStockItem?.name || comp.name || compSku;

        invoiceItems.push({
          srNo: null, // Sub-line under combo header
          title: compTitle,
          variantTitle: null,
          sku: compSku,
          type: "COMPONENT",
          parentComboSku: rawSku,
          parentComboTitle: comboTitle,
          isComboComponent: true,
          hsnCode: comp.hsnCode || "",
          quantity: compQty,
          unitPrice: Number(compAllocVal.toFixed(2)),
          discountAmount: Number((compDiscPaise / 100).toFixed(2)),
          unitPriceExclTax: compUnitPriceExcl,
          grossItemTotal: Number((compBaseGrossPaise / 100).toFixed(2)),
          taxableValue: Number(compTaxableValue.toFixed(2)),
          taxRate: compGstRate,
          isTaxInclusive: isCompTaxInclusive,
          cgstRate: isIntraState ? compGstRate / 2 : 0,
          cgstAmount: Number(compCgstAmount.toFixed(2)),
          sgstRate: isIntraState ? compGstRate / 2 : 0,
          sgstAmount: Number(compSgstAmount.toFixed(2)),
          igstRate: !isIntraState ? compGstRate : 0,
          igstAmount: Number(compIgstAmount.toFixed(2)),
          grossTotal: Number(compFinalLineTotal.toFixed(2)),
          isFromBundle: false,
        });
      }
    } else {
      // STANDARD SINGLE SKU OR UNCONFIGURED COMBO (Clean SKU configuration)
      const taxConfig = taxConfigMap.get(rawSku);
      const taxRate = taxConfig?.taxRate !== undefined ? taxConfig.taxRate : 18.0;
      const hsnCode = taxConfig?.hsnCode || "";
      const isTaxInclusive = taxConfig?.isTaxInclusive ?? true;

      // Strict integer paise calculations (No floating-point drift)
      const netPaise = Math.round(netGrossTotal * 100);
      let taxablePaise = 0;
      let taxPaise = 0;

      if (isTaxInclusive) {
        if (taxRate > 0) {
          taxablePaise = Math.round(netPaise / (1 + taxRate / 100));
          taxPaise = netPaise - taxablePaise;
        } else {
          taxablePaise = netPaise;
          taxPaise = 0;
        }
      } else {
        taxablePaise = netPaise;
        taxPaise = taxRate > 0 ? Math.round(taxablePaise * (taxRate / 100)) : 0;
      }

      let cgstPaise = 0;
      let sgstPaise = 0;
      let igstPaise = 0;

      if (isIntraState) {
        cgstPaise = Math.floor(taxPaise / 2);
        sgstPaise = taxPaise - cgstPaise;
      } else {
        igstPaise = taxPaise;
      }

      const taxableValue = taxablePaise / 100;
      const taxAmount = taxPaise / 100;
      const cgstAmount = cgstPaise / 100;
      const sgstAmount = sgstPaise / 100;
      const igstAmount = igstPaise / 100;
      const lineFinalTotal = (taxablePaise + taxPaise) / 100;
      const unitPriceExclTax = itemQty > 0 ? Number((taxableValue / itemQty).toFixed(2)) : taxableValue;

      subtotalTaxablePaise += taxablePaise;
      totalCgstPaise += cgstPaise;
      totalSgstPaise += sgstPaise;
      totalIgstPaise += igstPaise;
      totalTaxPaise += taxPaise;
      totalGrossPaise += Math.round(lineFinalTotal * 100);
      totalDiscountPaise += Math.round(lineDiscount * 100);

      const singleTitle = stockItem?.name || item.productTitle || "Item";

      invoiceItems.push({
        srNo: srCounter++,
        title: singleTitle,
        variantTitle: item.variantTitle,
        sku: item.sku || "N/A",
        type: stockItem?.type || "SINGLE",
        hsnCode,
        quantity: itemQty,
        unitPrice: Number(originalUnitPrice.toFixed(2)),
        discountAmount: Number(lineDiscount.toFixed(2)),
        unitPriceExclTax,
        grossItemTotal: Number(originalGrossTotal.toFixed(2)),
        taxableValue: Number(taxableValue.toFixed(2)),
        taxRate,
        isTaxInclusive,
        cgstRate: isIntraState ? taxRate / 2 : 0,
        cgstAmount: Number(cgstAmount.toFixed(2)),
        sgstRate: isIntraState ? taxRate / 2 : 0,
        sgstAmount: Number(sgstAmount.toFixed(2)),
        igstRate: !isIntraState ? taxRate : 0,
        igstAmount: Number(igstAmount.toFixed(2)),
        grossTotal: Number(lineFinalTotal.toFixed(2)),
        isFromBundle: false,
      });
    }
  }

  const subtotalTaxable = subtotalTaxablePaise / 100;
  const totalCgst = totalCgstPaise / 100;
  const totalSgst = totalSgstPaise / 100;
  const totalIgst = totalIgstPaise / 100;
  const totalTax = totalTaxPaise / 100;
  const totalGross = totalGrossPaise / 100;
  const totalDiscounts = totalDiscountPaise / 100;

  const shippingCharge = 0.0;
  const finalAmount = totalGross + shippingCharge;
  const roundedTotal = Number(finalAmount.toFixed(2));
  const roundOff = 0.0;
  const amountInWords = numberToIndianWords(roundedTotal);

  // Invoice numbering
  const rawOrderNum = (order.orderNumber || order.name || "").trim();
  const cleanNum = rawOrderNum.replace(/^#+/, "");
  let invoiceNumber = rawOrderNum.startsWith("#") ? rawOrderNum : `#${rawOrderNum}`;

  const prefix = companySnapshot.invoicePrefix?.trim() || "";
  if (prefix && prefix !== "SHOPIFY_ORDER" && prefix !== "NONE") {
    if (prefix.includes("2026") && cleanNum.startsWith("2026-")) {
      invoiceNumber = `${prefix}${cleanNum.replace(/^2026-/, "")}`;
    } else {
      invoiceNumber = `${prefix}${cleanNum}`;
    }
  }

  return {
    orderId: order.id,
    invoiceNumber,
    invoiceDate: order.createdAt.toISOString(),
    orderNumber: order.orderNumber,
    orderDate: order.createdAt.toISOString(),
    deliveryDate: shipment?.deliveryDate || order.fulfillments?.[0]?.deliveryDate || null,
    deliveryStatus: shipment?.normalizedStatus || order.fulfillments?.[0]?.deliveryStatus || order.fulfillmentStatus || "FULFILLED",
    awb: shipment?.awb || order.fulfillments?.[0]?.trackingNumber || null,
    paymentMethod: order.financialStatus === "PAID" ? "Prepaid" : "Cash on Delivery (COD)",
    financialStatus: order.financialStatus,
    reverseCharge: "No",
    placeOfSupply: `${destStateInfo.name} (${destStateInfo.code})`,
    isIntraState,
    company: {
      legalName: companySnapshot.legalEntityName,
      tradeName: companySnapshot.tradeName,
      gstin: companySnapshot.gstin,
      pan: companySnapshot.pan,
      cin: companySnapshot.cin,
      lutNumber: companySnapshot.lutNumber,
      address: companySnapshot.addressLine,
      city: companySnapshot.city,
      state: companySnapshot.state,
      stateCode: companySnapshot.stateCode,
      pincode: companySnapshot.pincode,
      country: companySnapshot.country,
      email: companySnapshot.email,
      phone: companySnapshot.phone,
      website: companySnapshot.website,
      logoUrl: companySnapshot.logo,
      bankName: companySnapshot.bankName,
      accountNumber: companySnapshot.bankAccountNumber,
      ifscCode: companySnapshot.ifsc,
      accountHolderName: companySnapshot.accountHolderName,
      branchName: companySnapshot.branchName,
      upiId: companySnapshot.upi,
      termsConditions: companySnapshot.termsAndConditions,
      authorizedSignatory: companySnapshot.authorizedSignatory,
      declaration: companySnapshot.declaration,
      signatureUrl: companySnapshot.signatureUrl,
    },
    company_snapshot: companySnapshot,
    customer: {
      name: shippingAddressObj?.name || order.name || "Customer",
      email: order.email || "",
      phone: shippingAddressObj?.phone || order.phone || "",
      billingAddress: {
        name: billingAddressObj?.name || shippingAddressObj?.name || order.name,
        address1: billingAddressObj?.address1 || shippingAddressObj?.address1 || "",
        address2: billingAddressObj?.address2 || shippingAddressObj?.address2 || "",
        city: billingAddressObj?.city || shippingAddressObj?.city || "",
        state: billingAddressObj?.province || shippingAddressObj?.province || destStateInfo.name,
        stateCode: destStateInfo.code,
        zip: billingAddressObj?.zip || shippingAddressObj?.zip || "",
        country: billingAddressObj?.country || shippingAddressObj?.country || "India",
      },
      shippingAddress: {
        name: shippingAddressObj?.name || order.name,
        address1: shippingAddressObj?.address1 || "",
        address2: shippingAddressObj?.address2 || "",
        city: shippingAddressObj?.city || "",
        state: shippingAddressObj?.province || destStateInfo.name,
        stateCode: destStateInfo.code,
        zip: shippingAddressObj?.zip || "",
        country: shippingAddressObj?.country || "India",
      },
    },
    items: invoiceItems,
    summary: {
      subtotalTaxable: Number(subtotalTaxable.toFixed(2)),
      totalDiscounts: Number(totalDiscounts.toFixed(2)),
      totalCgst: Number(totalCgst.toFixed(2)),
      totalSgst: Number(totalSgst.toFixed(2)),
      totalIgst: Number(totalIgst.toFixed(2)),
      totalTax: Number(totalTax.toFixed(2)),
      shippingCharge: Number(shippingCharge.toFixed(2)),
      roundOff,
      grandTotal: roundedTotal,
      amountInWords,
    },
  };
}

export async function generateInvoiceForOfflineOrder(
  orderIdOrNumber: string,
  cachedCompany?: any,
  authenticatedStoreId?: string,
  options?: { refreshCompanySnapshot?: boolean }
) {
  const order = await prisma.offlineOrder.findFirst({
    where: {
      ...(authenticatedStoreId ? { storeId: authenticatedStoreId } : {}),
      OR: [
        { id: orderIdOrNumber },
        { orderNumber: orderIdOrNumber },
      ],
    },
    include: {
      items: true,
    },
  });

  if (!order) return null;

  // Resolve Company Master & Snapshot (Strictly isolated by storeId, zero hardcoded fallbacks)
  const companySnapshot = await resolveAndSnapshotCompany(
    order.storeId,
    order,
    true,
    cachedCompany,
    options
  );

  const originStateInfo = resolveIndianState(companySnapshot.state || "KERALA");
  
  // For offline orders, assume intra-state if customer address is not explicitly out of state.
  // We'll parse the customerAddress JSON if it exists.
  let destStateInfo = originStateInfo;
  if (order.customerAddress) {
    try {
      const parsed = JSON.parse(order.customerAddress);
      if (parsed.state) {
        destStateInfo = resolveIndianState(parsed.state);
      }
    } catch {}
  }

  const isIntraState = destStateInfo.code === originStateInfo.code;

  let subtotalTaxable = 0;
  let totalCgst = 0;
  let totalSgst = 0;
  let totalIgst = 0;
  let totalTax = 0;
  let totalGross = 0;

  const invoiceItems: any[] = [];
  let srCounter = 1;

  for (const item of order.items) {
    const itemQty = item.quantity || 1;
    const itemGrossTotal = item.totalAmount || (item.unitPrice * itemQty - item.discount + item.taxAmount);
    
    // We already have taxAmount and taxRate from the DB for offline orders.
    const taxRate = item.taxRate || 0;
    const taxAmount = item.taxAmount || 0;
    const taxableValue = itemGrossTotal - taxAmount;
    const unitPriceExclTax = taxableValue / itemQty;

    let cgstRate = 0, cgstAmount = 0, sgstRate = 0, sgstAmount = 0, igstRate = 0, igstAmount = 0;
    
    if (isIntraState) {
      cgstRate = taxRate / 2;
      cgstAmount = taxAmount / 2;
      sgstRate = taxRate / 2;
      sgstAmount = taxAmount / 2;
      totalCgst += cgstAmount;
      totalSgst += sgstAmount;
    } else {
      igstRate = taxRate;
      igstAmount = taxAmount;
      totalIgst += igstAmount;
    }

    subtotalTaxable += taxableValue;
    totalTax += taxAmount;
    totalGross += itemGrossTotal;

    invoiceItems.push({
      srNo: srCounter++,
      title: item.productName,
      variantTitle: null,
      sku: item.sku,
      hsnCode: item.hsnCode || "8424",
      quantity: itemQty,
      unitPrice: Number((item.unitPrice || 0).toFixed(2)),
      discountAmount: Number((item.discount || 0).toFixed(2)),
      unitPriceExclTax: Number(unitPriceExclTax.toFixed(2)),
      grossItemTotal: Number(itemGrossTotal.toFixed(2)),
      taxableValue: Number(taxableValue.toFixed(2)),
      taxRate,
      isTaxInclusive: true, // Offline billing is mostly inclusive unless split logic says otherwise
      cgstRate,
      cgstAmount: Number(cgstAmount.toFixed(2)),
      sgstRate,
      sgstAmount: Number(sgstAmount.toFixed(2)),
      igstRate,
      igstAmount: Number(igstAmount.toFixed(2)),
      grossTotal: Number(itemGrossTotal.toFixed(2)),
      isFromBundle: false,
    });
  }

  const shippingCharge = order.shippingCharge || 0.0;
  const finalAmount = totalGross + shippingCharge;
  const roundedTotal = Number(finalAmount.toFixed(2));
  const roundOff = 0.0;
  const amountInWords = numberToIndianWords(roundedTotal);

  let customerAddrStr = "";
  if (order.customerAddress) {
    try {
      const parsed = JSON.parse(order.customerAddress);
      customerAddrStr = `${parsed.line1 || ""}, ${parsed.city || ""}, ${parsed.state || ""} - ${parsed.pincode || ""}`.replace(/^, /, '').trim();
    } catch {
      customerAddrStr = order.customerAddress;
    }
  }

  return {
    orderId: order.id,
    invoiceNumber: order.orderNumber, // Offline orders use their order number as bill number
    invoiceDate: order.createdAt.toISOString(),
    orderNumber: order.orderNumber,
    orderDate: order.createdAt.toISOString(),
    deliveryDate: null,
    deliveryStatus: order.status,
    awb: order.trackingNumber || null,
    paymentMethod: order.paymentMode,
    financialStatus: order.paymentStatus,
    reverseCharge: "No",
    placeOfSupply: `${destStateInfo.name} (${destStateInfo.code})`,
    isIntraState,
    company: {
      legalName: companySnapshot.legalEntityName,
      tradeName: companySnapshot.tradeName,
      gstin: companySnapshot.gstin,
      pan: companySnapshot.pan,
      cin: companySnapshot.cin,
      lutNumber: companySnapshot.lutNumber,
      address: companySnapshot.addressLine,
      city: companySnapshot.city,
      state: companySnapshot.state,
      stateCode: companySnapshot.stateCode,
      pincode: companySnapshot.pincode,
      country: companySnapshot.country,
      email: companySnapshot.email,
      phone: companySnapshot.phone,
      website: companySnapshot.website,
      logoUrl: companySnapshot.logo,
      bankName: companySnapshot.bankName,
      accountNumber: companySnapshot.bankAccountNumber,
      ifscCode: companySnapshot.ifsc,
      accountHolderName: companySnapshot.accountHolderName,
      branchName: companySnapshot.branchName,
      upiId: companySnapshot.upi,
      termsConditions: companySnapshot.termsAndConditions,
      authorizedSignatory: companySnapshot.authorizedSignatory,
      declaration: companySnapshot.declaration,
      signatureUrl: companySnapshot.signatureUrl,
    },
    company_snapshot: companySnapshot,
    customer: {
      name: order.customerName || "Walk-in Customer",
      email: "",
      phone: order.customerPhone || "",
      billingAddress: {
        name: order.customerName || "Walk-in Customer",
        address1: customerAddrStr,
        address2: "",
        city: "",
        state: destStateInfo.name,
        stateCode: destStateInfo.code,
        zip: "",
        country: "India",
      },
      shippingAddress: {
        name: order.customerName || "Walk-in Customer",
        address1: customerAddrStr,
        address2: "",
        city: "",
        state: destStateInfo.name,
        stateCode: destStateInfo.code,
        zip: "",
        country: "India",
      },
    },
    items: invoiceItems,
    summary: {
      subtotalTaxable: Number(subtotalTaxable.toFixed(2)),
      totalDiscounts: Number((order.items.reduce((s, i) => s + (i.discount || 0), 0)).toFixed(2)),
      totalCgst: Number(totalCgst.toFixed(2)),
      totalSgst: Number(totalSgst.toFixed(2)),
      totalIgst: Number(totalIgst.toFixed(2)),
      totalTax: Number(totalTax.toFixed(2)),
      shippingCharge: Number(shippingCharge.toFixed(2)),
      roundOff,
      grandTotal: roundedTotal,
      amountInWords,
    },
  };
}

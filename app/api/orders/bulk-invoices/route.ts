import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateInvoiceForOrder, generateInvoiceForOfflineOrder } from "@/lib/invoice-generator";
import { requireStoreAccess } from "@/lib/auth-helpers";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireStoreAccess(request, { requiredPermission: "orders.view" });
    if (!auth.authorized || !auth.storeId) {
      return NextResponse.json({ error: auth.error || "Unauthorized" }, { status: auth.status || 401 });
    }
    const storeId = auth.storeId;

    const body = await request.json();
    const ids: string[] = body.ids || [];

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: "No order IDs provided" }, { status: 400 });
    }

    // 1. Fetch Company Settings once for all invoices
    const company = await prisma.storeSetting.findUnique({
      where: { storeId },
    });

    if (!company || !company.companyName?.trim() || !company.gstin?.trim()) {
      return NextResponse.json(
        {
          error: "Incomplete Company Profile. Please configure your Company Name and GSTIN in Settings → Company Profile & Invoice Master before generating GST invoices.",
          code: "COMPANY_PROFILE_INCOMPLETE",
        },
        { status: 400 }
      );
    }

    // 2. Fetch all Tax Configs for THIS store once
    const allTaxConfigs = await prisma.productTaxConfig.findMany({
      where: { storeId },
    });
    const taxConfigMap = new Map<string, any>();
    for (const tc of allTaxConfigs) {
      taxConfigMap.set(tc.sku.toUpperCase().trim(), tc);
    }

    // 3. Generate Invoices
    const invoices = [];
    for (const id of ids) {
      try {
        let inv = await generateInvoiceForOrder(id, company, taxConfigMap, storeId);
        if (!inv) {
          inv = await generateInvoiceForOfflineOrder(id, company, storeId);
        }
        if (inv) {
          invoices.push(inv);
        }
      } catch (err) {
        console.error(`Error generating invoice for order ${id}:`, err);
      }
    }

    return NextResponse.json({
      success: true,
      count: invoices.length,
      invoices,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireStoreAccess(request, { requiredPermission: "orders.view" });
    if (!auth.authorized || !auth.storeId) {
      return NextResponse.json({ error: auth.error || "Unauthorized" }, { status: auth.status || 401 });
    }
    const storeId = auth.storeId;

    const searchParams = request.nextUrl.searchParams;
    const rawIds = searchParams.get("ids") || "";
    const ids = rawIds
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    if (ids.length === 0) {
      return NextResponse.json({ error: "No order IDs provided" }, { status: 400 });
    }

    const company = await prisma.storeSetting.findUnique({
      where: { storeId },
    });

    if (!company || !company.companyName?.trim() || !company.gstin?.trim()) {
      return NextResponse.json(
        {
          error: "Incomplete Company Profile. Please configure your Company Name and GSTIN in Settings → Company Profile & Invoice Master before generating GST invoices.",
          code: "COMPANY_PROFILE_INCOMPLETE",
        },
        { status: 400 }
      );
    }

    const allTaxConfigs = await prisma.productTaxConfig.findMany({
      where: { storeId },
    });
    const taxConfigMap = new Map<string, any>();
    for (const tc of allTaxConfigs) {
      taxConfigMap.set(tc.sku.toUpperCase().trim(), tc);
    }

    const invoices = [];
    for (const id of ids) {
      try {
        let inv = await generateInvoiceForOrder(id, company, taxConfigMap, storeId);
        if (!inv) {
          inv = await generateInvoiceForOfflineOrder(id, company, storeId);
        }
        if (inv) {
          invoices.push(inv);
        }
      } catch (err) {
        console.error(`Error generating invoice for order ${id}:`, err);
      }
    }

    return NextResponse.json({
      success: true,
      count: invoices.length,
      invoices,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { AnalyticsService, normalizeExpenseCategory } from "@/lib/services/AnalyticsService";
import { PurchasesService } from "@/lib/services/PurchasesService";
import { authorizeStoreAccess } from "@/lib/auth-helpers";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const auth = await authorizeStoreAccess(request, { requiredPermission: "dashboard.view" });
    if (!auth.authorized || !auth.storeId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { bills } = await PurchasesService.getBills(auth.storeId);
    const expenses = bills.map((b) => ({
      id: b.id,
      date: b.billDate,
      category: normalizeExpenseCategory(b.items?.[0]?.category, b.billType),
      description: b.items && b.items.length > 0
        ? b.items.map((i) => i.itemName).filter(Boolean).join(", ")
        : b.notes || b.billNumber || "Business Expense",
      vendor: b.supplier || "—",
      amount: b.totalAmount,
      note: b.notes,
      billNumber: b.billNumber,
    }));

    return NextResponse.json({ success: true, expenses });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authorizeStoreAccess(request, { requiredPermission: "pnl.view" });
    if (!auth.authorized || !auth.storeId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    if (!body.amount || !body.category || !body.description) {
      return NextResponse.json(
        { success: false, error: "Amount, Category, and Description are required" },
        { status: 400 }
      );
    }

    const expense = await AnalyticsService.createExpense(auth.storeId, body);
    return NextResponse.json({ success: true, expense });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await authorizeStoreAccess(request, { requiredPermission: "pnl.view" });
    if (!auth.authorized || !auth.storeId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ success: false, error: "Expense ID required" }, { status: 400 });
    }

    await AnalyticsService.deleteExpense(auth.storeId, id);
    return NextResponse.json({ success: true, deletedId: id });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

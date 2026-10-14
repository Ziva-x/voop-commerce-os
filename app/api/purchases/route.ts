import { NextRequest, NextResponse } from "next/server";
import { PurchasesService } from "@/lib/services/PurchasesService";
import { authorizeStoreAccess } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const auth = await authorizeStoreAccess(request, { requiredPermission: "purchases.view" });
    if (!auth.authorized || !auth.storeId) {
      return NextResponse.json(
        { error: auth.error || "Unauthorized" },
        { status: auth.status || 401, headers: { "Cache-Control": "no-store" } }
      );
    }
    const storeId = auth.storeId;

    const { searchParams } = new URL(request.url);
    const billType = searchParams.get("billType") || undefined;
    const paymentStatus = searchParams.get("paymentStatus") || undefined;
    const supplier = searchParams.get("supplier") || undefined;

    const data = await PurchasesService.getBills(storeId, { billType, paymentStatus, supplier });
    return NextResponse.json({ success: true, ...data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authorizeStoreAccess(request, { requiredPermission: "purchases.manage" });
    if (!auth.authorized || !auth.storeId) {
      return NextResponse.json(
        { error: auth.error || "Unauthorized" },
        { status: auth.status || 401, headers: { "Cache-Control": "no-store" } }
      );
    }
    const storeId = auth.storeId;

    const body = await request.json();
    const bill = await PurchasesService.createBill(storeId, body);
    return NextResponse.json({ success: true, bill });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await authorizeStoreAccess(request, { requiredPermission: "purchases.manage" });
    if (!auth.authorized || !auth.storeId) {
      return NextResponse.json(
        { error: auth.error || "Unauthorized" },
        { status: auth.status || 401, headers: { "Cache-Control": "no-store" } }
      );
    }
    const storeId = auth.storeId;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Missing bill id" }, { status: 400 });

    const result = await PurchasesService.deleteBill(storeId, id);
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

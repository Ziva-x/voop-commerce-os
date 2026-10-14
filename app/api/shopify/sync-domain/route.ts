import { NextRequest, NextResponse } from "next/server";
import { syncAndCorrectStoreDomain } from "@/lib/shopify";
import { authorizeStoreAccess } from "@/lib/auth-helpers";
import { extractCleanShopDomain } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const auth = await authorizeStoreAccess(request, { requiredPermission: "settings.manage" });
    const body = await request.json().catch(() => ({}));
    const candidateDomain = body.shopDomain || body.candidateDomain;

    const storeId = auth.storeId || body.storeId;
    if (!storeId && !candidateDomain) {
      return NextResponse.json({ error: "Missing storeId or shopDomain" }, { status: 400 });
    }

    const updatedStore = await syncAndCorrectStoreDomain({
      storeId,
      candidateDomain: candidateDomain ? extractCleanShopDomain(candidateDomain) : undefined,
    });

    if (!updatedStore) {
      return NextResponse.json(
        { error: "Store not found or unable to verify shop domain with Shopify API" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      store: {
        id: updatedStore.id,
        shopDomain: updatedStore.shopDomain,
        storeName: updatedStore.storeName,
        isConnected: updatedStore.isConnected,
        currency: updatedStore.currency,
      },
      message: `Store domain verified and synchronized: ${updatedStore.shopDomain}`,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

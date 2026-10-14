import { NextRequest, NextResponse } from "next/server";
import { resolveStoreId } from "@/lib/auth-helpers";
import { AdPlatformService } from "@/lib/services/AdPlatformService";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const storeId = await resolveStoreId(request);
    if (!storeId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let accountId: string | undefined;
    try {
      const body = await request.json();
      accountId = body?.accountId;
    } catch (_) {
      // Empty body is valid: sync all accounts
    }

    if (accountId) {
      const result = await AdPlatformService.syncAccount(accountId, storeId);
      return NextResponse.json({ success: true, result });
    }

    const results = await AdPlatformService.syncAllConnectedAccounts(storeId);
    return NextResponse.json({ success: true, ...results });
  } catch (error: any) {
    console.error("[ADS_SYNC_ERROR]", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const storeId = await resolveStoreId(request);
    if (!storeId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const results = await AdPlatformService.syncAllConnectedAccounts(storeId);
    return NextResponse.json({ success: true, ...results });
  } catch (error: any) {
    console.error("[ADS_SYNC_GET_ERROR]", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { resolveStoreId } from "@/lib/auth-helpers";
import { AdPlatformService } from "@/lib/services/AdPlatformService";

export async function GET(request: NextRequest) {
  try {
    const storeId = await resolveStoreId(request);
    if (!storeId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const period = searchParams.get("period") || "7d";
    const platform = searchParams.get("platform") || "ALL";

    const data = await AdPlatformService.getOmnichannelOverview(storeId, period, platform);
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const storeId = await resolveStoreId(request);
    if (!storeId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const account = await AdPlatformService.connectAccount({ ...body, storeId });
    return NextResponse.json({ success: true, account });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const storeId = await resolveStoreId(request);
    if (!storeId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Missing account ID" }, { status: 400 });
    }
    await AdPlatformService.disconnectAccount(id, storeId);
    return NextResponse.json({ success: true, message: "Ad Account disconnected successfully." });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const storeId = await resolveStoreId(request);
    if (!storeId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { id, status } = body;
    if (!id || !status) {
      return NextResponse.json({ error: "Missing id or status" }, { status: 400 });
    }
    const updated = await AdPlatformService.toggleAccountStatus(id, status);
    return NextResponse.json({ success: true, account: updated });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

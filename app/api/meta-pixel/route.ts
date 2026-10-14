import { NextRequest, NextResponse } from "next/server";
import { MetaPixelService } from "@/lib/services/MetaPixelService";
import { resolveStoreId } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const storeId = await resolveStoreId(request);
    if (!storeId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const period = searchParams.get("period") || "7d";
    const startDate = searchParams.get("startDate") || undefined;
    const endDate = searchParams.get("endDate") || undefined;

    const data = await MetaPixelService.getOverview(storeId, period, startDate, endDate);
    return NextResponse.json({ success: true, ...data });
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
    if (body.action === "SYNC") {
      const result = await MetaPixelService.syncPixelData(storeId, body.period || "7d");
      return NextResponse.json({ success: true, ...result });
    }
    const result = await MetaPixelService.connectPixel(storeId, body);
    return NextResponse.json(result);
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
    const pixelId = searchParams.get("pixelId");
    if (!pixelId) {
      return NextResponse.json({ error: "Missing pixelId" }, { status: 400 });
    }
    await MetaPixelService.disconnectPixel(storeId, pixelId);
    return NextResponse.json({ success: true, message: "Pixel disconnected." });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

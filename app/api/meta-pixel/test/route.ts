import { NextRequest, NextResponse } from "next/server";
import { resolveStoreId } from "@/lib/auth-helpers";
import { MetaPixelService } from "@/lib/services/MetaPixelService";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const storeId = await resolveStoreId(request);
    if (!storeId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const result = await MetaPixelService.sendCapiEvent(storeId, {
      eventName: body.eventName || "PageView",
      eventId: `test_${Date.now()}`,
      customData: {
        currency: "INR",
        value: Number(body.value) || 999.0,
      },
    });
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}

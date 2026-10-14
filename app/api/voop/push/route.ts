import { NextRequest, NextResponse } from "next/server";
import { pushSyncDataToWebApp } from "@/lib/services/VoopPushService";
import { validateVoopRequest } from "@/lib/auth-voop";

export async function POST(request: NextRequest) {
  const auth = await validateVoopRequest(request);
  if (!auth.isValid) {
    return NextResponse.json({ error: auth.error || "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const result = await pushSyncDataToWebApp(auth.storeId as string, body.webAppUrl);
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

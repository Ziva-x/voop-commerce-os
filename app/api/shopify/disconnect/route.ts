import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveShopifyContext } from "@/lib/shopifyAuth";

export async function POST(request: NextRequest) {
  try {
    const ctx = await resolveShopifyContext({ request });

    const store = await prisma.shopifyStore.findUnique({
      where: { id: ctx.storeId },
    });

    if (!store) {
      return NextResponse.json({ error: "No active store found to disconnect." }, { status: 404 });
    }

    await prisma.shopifyStore.update({
      where: { id: store.id },
      data: { isConnected: false },
    });

    return NextResponse.json({
      success: true,
      message: `Store ${store.shopDomain} disconnected successfully.`,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

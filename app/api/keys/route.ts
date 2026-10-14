import { NextRequest, NextResponse } from "next/server";
import { resolveStoreId } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { generateApiKey } from "@/lib/auth-voop";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const storeId = await resolveStoreId(request);
    if (!storeId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const keys = await prisma.voopApiKey.findMany({
      where: { storeId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        lastUsedAt: true,
        isActive: true,
        createdAt: true,
      },
    });

    const defaultKey = process.env.VOOP_DEFAULT_API_KEY || "voop_live_sync_key_774b6c7d";

    return NextResponse.json({
      keys,
      defaultKey,
    });
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

    const body = await request.json().catch(() => ({}));
    const name = body.name || "VOOP Integration Key";

    const { key, hash, prefix } = generateApiKey("voop_live");

    const record = await prisma.voopApiKey.create({
      data: {
        storeId,
        name,
        keyHash: hash,
        keyPrefix: prefix,
        isActive: true,
      },
    });

    return NextResponse.json({
      success: true,
      message: "New VOOP API Key generated! Please store it securely.",
      apiKey: key, // Only returned once on creation
      keyRecord: {
        id: record.id,
        name: record.name,
        keyPrefix: record.keyPrefix,
        createdAt: record.createdAt,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
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
      return NextResponse.json({ error: "Key ID required" }, { status: 400 });
    }

    // Ensure the key belongs to this store
    await prisma.voopApiKey.deleteMany({ where: { id, storeId } });

    return NextResponse.json({ success: true, message: "API key deleted." });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

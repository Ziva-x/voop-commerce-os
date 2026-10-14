import { NextRequest, NextResponse } from "next/server";
import { resolveStoreId } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const storeId = await resolveStoreId(request);
    if (!storeId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || "ALL";
    const collabType = searchParams.get("collabType") || "ALL";
    const search = searchParams.get("search") || "";

    const where: any = { storeId };
    if (status && status !== "ALL") where.status = status;
    if (collabType && collabType !== "ALL") where.collabType = collabType;

    if (search) {
      where.OR = [
        { fullName: { contains: search } },
        { instagramId: { contains: search } },
        { whatsappNumber: { contains: search } },
        { place: { contains: search } },
      ];
    }

    const collabs = await prisma.collaboration.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ success: true, collaborations: collabs });
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
    const {
      fullName,
      instagramId,
      instagramLink,
      whatsappNumber,
      place,
      address,
      contentType,
      platforms,
      vehicleOwned,
      vehicleUsed,
      daysToCreate,
      collabType,
      customResponses,
    } = body;

    const collab = await prisma.collaboration.create({
      data: {
        storeId,
        fullName: fullName || "Anonymous Creator",
        instagramId: instagramId || null,
        instagramLink: instagramLink || null,
        whatsappNumber: whatsappNumber || null,
        place: place || null,
        address: address || null,
        contentType: contentType || null,
        platforms: platforms || null,
        vehicleOwned: vehicleOwned || null,
        vehicleUsed: vehicleUsed || null,
        daysToCreate: daysToCreate || null,
        collabType: collabType || "Barter",
        status: "New Request",
        customResponses: typeof customResponses === "object" ? JSON.stringify(customResponses) : customResponses || null,
      },
    });

    return NextResponse.json({ success: true, collaboration: collab });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const storeId = await resolveStoreId(request);
    if (!storeId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { id, status, awb, couponCode } = body;

    if (!id) {
      return NextResponse.json({ error: "Collaboration ID is required" }, { status: 400 });
    }

    const collab = await prisma.collaboration.update({
      where: { id: parseInt(id, 10), storeId },
      data: {
        status: status !== undefined ? status : undefined,
        awb: awb !== undefined ? awb : undefined,
        couponCode: couponCode !== undefined ? couponCode : undefined,
      },
    });

    return NextResponse.json({ success: true, collaboration: collab });
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
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    await prisma.collaboration.delete({ where: { id: parseInt(id, 10), storeId } });
    return NextResponse.json({ success: true, message: "Collaboration deleted" });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { authorizeStoreAccess } from "@/lib/auth-helpers";
import bcrypt from "bcryptjs";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const auth = await authorizeStoreAccess(request, { requiredPermission: "staff.view" });
    if (!auth.authorized || !auth.storeId) {
      return NextResponse.json(
        { error: auth.error || "Unauthorized / No store connected" },
        { status: auth.status || 401 }
      );
    }
    const storeId = auth.storeId;

    if (auth.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden: Only ADMIN can access staff list" }, { status: 403 });
    }

    const staff = await prisma.user.findMany({
      where: {
        OR: [
          { storeId },
          { memberships: { some: { storeId } } },
        ],
        role: "STAFF",
      },
      select: {
        id: true,
        name: true,
        username: true,
        email: true,
        role: true,
        permissions: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ success: true, staff });
  } catch (error: any) {
    console.error("Staff GET Error:", error);
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authorizeStoreAccess(request, { requiredPermission: "staff.manage" });
    if (!auth.authorized || !auth.storeId) {
      return NextResponse.json(
        { error: auth.error || "Unauthorized / No store connected" },
        { status: auth.status || 401 }
      );
    }
    const storeId = auth.storeId;

    if (auth.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden: Only ADMIN can create staff" }, { status: 403 });
    }

    const body = await request.json();
    const { name, email, password, permissions } = body;

    if (!name || !email || !password) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (existingUser) {
      return NextResponse.json({ error: "User already exists with this email" }, { status: 400 });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const permissionsString = Array.isArray(permissions) ? JSON.stringify(permissions) : null;

    let baseUsername = (email.split("@")[0] || name || "staff")
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, "");
    if (!baseUsername || baseUsername.length < 3) baseUsername = "staff_user";

    let usernameCandidate = baseUsername;
    let counter = 1;
    while (true) {
      const existingUsername = await prisma.user.findUnique({ where: { username: usernameCandidate } });
      if (!existingUsername) break;
      usernameCandidate = `${baseUsername}${counter}`;
      counter++;
    }

    const store = await prisma.shopifyStore.findUnique({
      where: { id: storeId },
      select: { voopStoreId: true, tenantId: true },
    });

    const newStaff = await prisma.user.create({
      data: {
        name,
        email: email.toLowerCase(),
        username: usernameCandidate,
        passwordHash,
        storeId,
        voopStoreId: store?.voopStoreId || null,
        tenantId: store?.tenantId || null,
        createdById: auth.userId || null,
        role: "STAFF",
        permissions: permissionsString,
      },
      select: {
        id: true,
        name: true,
        username: true,
        email: true,
        role: true,
        permissions: true,
        createdAt: true,
      },
    });

    // Create server-side StoreMembership with tenantId and status = "ACTIVE"
    await prisma.storeMembership.upsert({
      where: {
        userId_storeId: {
          userId: newStaff.id,
          storeId,
        },
      },
      create: {
        userId: newStaff.id,
        storeId,
        tenantId: auth.tenantId,
        status: "ACTIVE",
        role: "STAFF",
        permissions: permissionsString,
      },
      update: {
        tenantId: auth.tenantId,
        status: "ACTIVE",
        role: "STAFF",
        permissions: permissionsString,
      },
    }).catch(() => {});

    return NextResponse.json({ success: true, staff: newStaff });
  } catch (error: any) {
    console.error("Staff POST Error:", error);
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await authorizeStoreAccess(request, { requiredPermission: "staff.manage" });
    if (!auth.authorized || !auth.storeId) {
      return NextResponse.json(
        { error: auth.error || "Unauthorized / No store connected" },
        { status: auth.status || 401 }
      );
    }
    const storeId = auth.storeId;

    if (auth.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden: Only ADMIN can update staff" }, { status: 403 });
    }

    const body = await request.json();
    const { id, name, permissions } = body;

    if (!id) {
      return NextResponse.json({ error: "Missing staff ID" }, { status: 400 });
    }

    const targetUser = await prisma.user.findUnique({ where: { id } });
    if (!targetUser || targetUser.storeId !== storeId) {
      return NextResponse.json({ error: "Staff not found in your store" }, { status: 404 });
    }

    if (targetUser.role === "ADMIN") {
      return NextResponse.json({ error: "Cannot modify permissions of ADMIN" }, { status: 403 });
    }

    const updateData: any = {};
    if (name) updateData.name = name;
    if (permissions !== undefined) {
      updateData.permissions = Array.isArray(permissions) ? JSON.stringify(permissions) : null;
    }

    const updatedStaff = await prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        name: true,
        username: true,
        email: true,
        role: true,
        permissions: true,
        createdAt: true,
      },
    });

    if (updateData.permissions !== undefined) {
      await prisma.storeMembership.upsert({
        where: {
          userId_storeId: {
            userId: id,
            storeId,
          },
        },
        create: {
          userId: id,
          storeId,
          role: "STAFF",
          permissions: updateData.permissions,
        },
        update: {
          permissions: updateData.permissions,
        },
      }).catch(() => {});
    }

    return NextResponse.json({ success: true, staff: updatedStaff });
  } catch (error: any) {
    console.error("Staff PUT Error:", error);
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await authorizeStoreAccess(request, { requiredPermission: "staff.manage" });
    if (!auth.authorized || !auth.storeId) {
      return NextResponse.json(
        { error: auth.error || "Unauthorized / No store connected" },
        { status: auth.status || 401 }
      );
    }
    const storeId = auth.storeId;

    if (auth.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden: Only ADMIN can delete staff" }, { status: 403 });
    }

    const myId = auth.userId;
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Missing staff ID" }, { status: 400 });
    }

    if (id === myId) {
      return NextResponse.json({ error: "Cannot delete yourself" }, { status: 400 });
    }

    // Ensure the staff being deleted belongs strictly to the same storeId
    const targetUser = await prisma.user.findUnique({ where: { id } });
    const membership = await prisma.storeMembership.findUnique({
      where: {
        userId_storeId: {
          userId: id,
          storeId,
        },
      },
    }).catch(() => null);

    if (!targetUser || (targetUser.storeId !== storeId && !membership)) {
      return NextResponse.json({ error: "Staff not found in your store" }, { status: 404 });
    }

    if (targetUser.role === "ADMIN") {
      return NextResponse.json({ error: "Cannot delete another ADMIN" }, { status: 403 });
    }

    await prisma.storeMembership.deleteMany({ where: { userId: id, storeId } }).catch(() => {});
    await prisma.user.delete({ where: { id } });

    return NextResponse.json({ success: true, message: "Staff deleted successfully" });
  } catch (error: any) {
    console.error("Staff DELETE Error:", error);
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}

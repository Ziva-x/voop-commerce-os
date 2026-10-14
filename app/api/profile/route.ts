import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensureUserHasUsername, ensureUserIsLinkedToStore, resolveUserIdFromRequest } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

const USERNAME_COOLDOWN_DAYS = 14;

function daysUntilNextChange(lastChangedAt: Date | null): number {
  if (!lastChangedAt) return 0;
  const nextAllowed = new Date(lastChangedAt.getTime() + USERNAME_COOLDOWN_DAYS * 24 * 60 * 60 * 1000);
  const now = new Date();
  if (now >= nextAllowed) return 0;
  return Math.ceil((nextAllowed.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

export async function GET(request: NextRequest) {
  try {
    // Tab-isolated: Bearer token first, cookie fallback
    const userId = await resolveUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }


    let user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        usernameLastChangedAt: true,
        email: true,
        name: true,
        contactNo: true,
        businessName: true,
        address: true,
        city: true,
        state: true,
        pincode: true,
        country: true,
        storeId: true,
        voopStoreId: true,
        tenantId: true,
        createdAt: true,
        store: {
          select: {
            id: true,
            voopStoreId: true,
            tenantId: true,
            publicStoreRef: true,
            shopDomain: true,
            storeName: true,
            isConnected: true,
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Ensure username is populated
    if (!user.username) {
      const genUsername = await ensureUserHasUsername(user.id, user.email, user.name);
      user.username = genUsername;
    }

    // Ensure store link if not yet linked
    if (!user.storeId) {
      const linkedStoreId = await ensureUserIsLinkedToStore(user.id, user.email);
      if (linkedStoreId) {
        user.storeId = linkedStoreId;
        const storeObj = await prisma.shopifyStore.findUnique({
          where: { id: linkedStoreId },
          select: { id: true, voopStoreId: true, tenantId: true, publicStoreRef: true, shopDomain: true, storeName: true, isConnected: true },
        });
        (user as any).store = storeObj;
      }
    }

    // Ensure permanent VOOP Store ID and Tenant ID are generated if store is connected
    let permanentVoopStoreId = user.store?.voopStoreId || user.voopStoreId;
    let permanentTenantId = user.store?.tenantId || (user as any).tenantId;
    if (user.storeId && (!permanentVoopStoreId || !permanentTenantId)) {
      try {
        const { ensureStorePermanentIdentities } = await import("@/lib/tenant-ids");
        const ids = await ensureStorePermanentIdentities(user.storeId, user.id);
        permanentVoopStoreId = ids.voopStoreId;
        permanentTenantId = ids.tenantId;
        (user as any).voopStoreId = permanentVoopStoreId;
        (user as any).tenantId = permanentTenantId;
        if ((user as any).store) {
          (user as any).store.voopStoreId = permanentVoopStoreId;
          (user as any).store.tenantId = permanentTenantId;
        }
      } catch (_err) {}
    }

    const daysRemaining = daysUntilNextChange(user.usernameLastChangedAt);

    return NextResponse.json(
      {
        success: true,
        profile: {
          ...user,
          voopStoreId: permanentVoopStoreId || null,
          tenantId: permanentTenantId || null,
        },
        voopStoreId: permanentVoopStoreId || null,
        tenantId: permanentTenantId || null,
        usernamePolicy: {
          cooldownDays: USERNAME_COOLDOWN_DAYS,
          daysUntilNextChange: daysRemaining,
          canChange: daysRemaining === 0,
          nextChangeDate: user.usernameLastChangedAt
            ? new Date(user.usernameLastChangedAt.getTime() + USERNAME_COOLDOWN_DAYS * 24 * 60 * 60 * 1000).toISOString()
            : null,
        },
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      }
    );
  } catch (error: any) {
    console.error("Profile GET Error:", error);
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    // Tab-isolated: Bearer token first, cookie fallback
    const userId = await resolveUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { username, name, email, contactNo, businessName, address, city, state, pincode, country } = body;

    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    // Fetch current user to check cooldown
    const currentUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { username: true, usernameLastChangedAt: true },
    });

    // If username is being changed, validate uniqueness and 14-day cooldown
    let cleanUsername: string | undefined = undefined;
    let usernameChanged = false;

    if (username && typeof username === "string") {
      const formatted = username.replace(/^@/, "").trim().toLowerCase();
      if (formatted.length < 3) {
        return NextResponse.json({ error: "Username must be at least 3 characters long." }, { status: 400 });
      }

      // Only apply cooldown if the username is actually different
      if (formatted !== currentUser?.username) {
        // Enforce 14-day cooldown
        const daysRemaining = daysUntilNextChange(currentUser?.usernameLastChangedAt ?? null);
        if (daysRemaining > 0) {
          return NextResponse.json(
            {
              error: `You can change your username again in ${daysRemaining} day${daysRemaining === 1 ? "" : "s"}. Username changes are allowed once every ${USERNAME_COOLDOWN_DAYS} days.`,
              daysRemaining,
              cooldownActive: true,
            },
            { status: 429 }
          );
        }

        // Check uniqueness
        const existing = await prisma.user.findUnique({ where: { username: formatted } });
        if (existing && existing.id !== userId) {
          return NextResponse.json({ error: "Username is already taken by another account." }, { status: 400 });
        }

        cleanUsername = formatted;
        usernameChanged = true;
      } else {
        // Same username, no change needed
        cleanUsername = formatted;
      }
    }

    const updateData: any = {
      name,
      contactNo,
      businessName,
      address,
      city,
      state,
      pincode,
      country,
    };

    if (cleanUsername) {
      updateData.username = cleanUsername;
    }

    // Only update the cooldown timestamp when the username actually changed
    if (usernameChanged) {
      updateData.usernameLastChangedAt = new Date();
    }

    // Allow updating email while preserving account_id and storeId relationship
    if (email && typeof email === "string" && email.trim().length > 0) {
      const lowerEmail = email.trim().toLowerCase();
      const existingEmailUser = await prisma.user.findUnique({ where: { email: lowerEmail } });
      if (existingEmailUser && existingEmailUser.id !== userId) {
        return NextResponse.json({ error: "Email address is already in use." }, { status: 400 });
      }
      updateData.email = lowerEmail;
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        username: true,
        usernameLastChangedAt: true,
        email: true,
        name: true,
        contactNo: true,
        businessName: true,
        address: true,
        city: true,
        state: true,
        pincode: true,
        country: true,
        storeId: true,
        store: {
          select: {
            id: true,
            shopDomain: true,
            storeName: true,
            isConnected: true,
          },
        },
      },
    });

    const daysRemaining = daysUntilNextChange(updatedUser.usernameLastChangedAt);

    return NextResponse.json({
      success: true,
      message: usernameChanged
        ? `Profile updated. Your next username change will be available in ${USERNAME_COOLDOWN_DAYS} days.`
        : "Profile updated successfully",
      profile: updatedUser,
      usernamePolicy: {
        cooldownDays: USERNAME_COOLDOWN_DAYS,
        daysUntilNextChange: daysRemaining,
        canChange: daysRemaining === 0,
      },
    });
  } catch (error: any) {
    console.error("Profile PUT Error:", error);
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const { handleAccountDeletion } = await import("@/lib/account-deletion");
  return handleAccountDeletion(request);
}


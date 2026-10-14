import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveUserIdFromRequest, logAuthDecision } from "@/lib/auth-helpers";

/**
 * Permanently delete an authenticated VOOP user account.
 * Follows strict ACID transactional requirements:
 * 1. Validates user authentication (tab Bearer token or session).
 * 2. Requires explicit confirmation: { confirmation: "DELETE" }.
 * 3. Safely handles store ownership: preserves stores if other members/staff exist.
 * 4. Orphans stores if 0 members remain, preserving permanent store ID & publicStoreRef.
 * 5. Removes user preferences, memberships, and credentials.
 * 6. Revokes all session cookies and tab credentials.
 */
export async function handleAccountDeletion(request: NextRequest) {
  const requestId = "del_" + Math.random().toString(36).substring(2, 9);
  const route = "/api/account/delete";

  // 1. Authenticate user
  const userId = await resolveUserIdFromRequest(request);
  if (!userId) {
    logAuthDecision({
      requestId,
      route,
      decision: "DENY",
      reason: "UNAUTHENTICATED",
    });
    return NextResponse.json(
      { error: "Unauthorized: Please sign in to your VOOP account." },
      { status: 401 }
    );
  }

  // 2. Validate confirmation payload
  let body: any = {};
  try {
    body = await request.json();
  } catch (_err) {
    body = {};
  }

  if (!body.confirmation || body.confirmation.trim() !== "DELETE") {
    logAuthDecision({
      requestId,
      userId,
      route,
      decision: "DENY",
      reason: "INVALID_CONFIRMATION",
    });
    return NextResponse.json(
      {
        error:
          "Confirmation required. You must explicitly type 'DELETE' to confirm permanent account deletion.",
      },
      { status: 400 }
    );
  }

  // 3. Database Transaction
  try {
    const result = await prisma.$transaction(async (tx) => {
      // Step A: Lock & verify user exists
      const user = await tx.user.findUnique({
        where: { id: userId },
        include: {
          memberships: true,
          preference: true,
        },
      });

      if (!user) {
        throw new Error("User account not found or has already been deleted.");
      }

      // Step B: Inspect all stores linked to this user
      const linkedStores = await tx.shopifyStore.findMany({
        where: {
          OR: [
            { accountId: user.id },
            { users: { some: { id: user.id } } },
            ...(user.storeId ? [{ id: user.storeId }] : []),
          ],
        },
        include: {
          memberships: {
            where: { userId: { not: user.id } },
            include: { user: true },
          },
          users: {
            where: { id: { not: user.id } },
          },
        },
      });

      for (const store of linkedStores) {
        const remainingAdmins = store.memberships.filter((m) => m.role === "ADMIN");
        const remainingMembers = store.memberships;
        const remainingUsers = store.users;

        if (remainingAdmins.length > 0) {
          // Reassign primary ownership to the next authorized admin
          const newAdmin = remainingAdmins[0];
          await tx.shopifyStore.update({
            where: { id: store.id },
            data: { accountId: newAdmin.userId },
          });
        } else if (remainingMembers.length > 0) {
          // Promote the first remaining staff member to admin and transfer ownership
          const firstStaff = remainingMembers[0];
          await tx.storeMembership.update({
            where: { id: firstStaff.id },
            data: { role: "ADMIN" },
          });
          await tx.shopifyStore.update({
            where: { id: store.id },
            data: { accountId: firstStaff.userId },
          });
        } else if (remainingUsers.length > 0) {
          // Linked users exist in store.users[]
          const nextUser = remainingUsers[0];
          await tx.shopifyStore.update({
            where: { id: store.id },
            data: { accountId: nextUser.id },
          });
        } else {
          // No authorized owner or staff remains: mark store as orphaned.
          // Store ID and publicStoreRef remain permanent and immutable.
          await tx.shopifyStore.update({
            where: { id: store.id },
            data: {
              accountId: null,
              isConnected: false,
            },
          });
        }
      }

      // Step C: Clear createdById on any staff created by this user
      await tx.user.updateMany({
        where: { createdById: user.id },
        data: { createdById: null },
      });

      // Step D: Delete user memberships
      await tx.storeMembership.deleteMany({
        where: { userId: user.id },
      });

      // Step E: Delete user preferences
      await tx.userPreference.deleteMany({
        where: { userId: user.id },
      });

      // Step F: Delete the user record permanently
      await tx.user.delete({
        where: { id: user.id },
      });

      return {
        deletedUserId: user.id,
        email: user.email,
        name: user.name,
      };
    });

    logAuthDecision({
      requestId,
      userId: result.deletedUserId,
      route,
      decision: "ALLOW",
      reason: "ACCOUNT_PERMANENTLY_DELETED",
    });

    // 4. Revoke session cookies
    const response = NextResponse.json(
      {
        success: true,
        message: "Your VOOP account has been permanently deleted.",
        deletedUserId: result.deletedUserId,
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      }
    );

    const isProd = process.env.NODE_ENV === "production";
    const expiredCookies = [
      "next-auth.session-token",
      "__Secure-next-auth.session-token",
      "next-auth.callback-url",
      "__Secure-next-auth.callback-url",
      "next-auth.csrf-token",
      "__Secure-next-auth.csrf-token",
      "voop-session",
    ];

    for (const name of expiredCookies) {
      response.cookies.set(name, "", {
        path: "/",
        maxAge: 0,
        expires: new Date(0),
        httpOnly: true,
        secure: isProd,
        sameSite: isProd ? "none" : "lax",
      });
    }

    return response;
  } catch (err: any) {
    console.error("[Account Deletion Error]:", err);
    logAuthDecision({
      requestId,
      userId,
      route,
      decision: "DENY",
      reason: err.message,
    });
    return NextResponse.json(
      { error: err.message || "Failed to permanently delete account." },
      { status: 500 }
    );
  }
}

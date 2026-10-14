import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

/**
 * POST /api/shopify/link-account
 *
 * Repair endpoint: Explicitly links the currently authenticated VOOP account
 * to a specific Shopify store by storeId.
 *
 * Used in two scenarios:
 * 1. Onboarding flow: After a new Shopify Admin install, the merchant creates
 *    a VOOP account and this endpoint binds their new account to the store.
 * 2. Manual repair: Admin wants to explicitly re-link their account to a store.
 *
 * Security rules:
 * - The store must exist.
 * - The store must NOT already be owned by a DIFFERENT ADMIN account.
 * - The requesting account must be authenticated.
 *
 * Body: { storeId: string }
 *
 * ─── GET /api/shopify/link-account ──────────────────────────────────────────
 * Diagnostic endpoint. Returns the current link state for this account.
 * Does NOT perform any mutations or heuristic guessing.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = (session.user as any).id as string;
    if (!userId) return NextResponse.json({ error: "No user ID in session" }, { status: 400 });

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { store: true },
    });

    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    if (user.storeId && user.store) {
      return NextResponse.json({
        status: "linked",
        storeId: user.storeId,
        shopDomain: user.store.shopDomain,
        storeName: user.store.storeName,
        isConnected: user.store.isConnected,
      });
    }

    // Check if the user is a member of a store (repair case)
    const memberStore = await prisma.shopifyStore.findFirst({
      where: { users: { some: { id: userId } } },
      orderBy: { createdAt: "desc" },
    });

    if (memberStore) {
      return NextResponse.json({
        status: "membership_found_not_linked",
        storeId: memberStore.id,
        shopDomain: memberStore.shopDomain,
        storeName: memberStore.storeName,
        message: "Store membership exists but User.storeId is null — call POST to repair.",
      });
    }

    return NextResponse.json({
      status: "no_store_found",
      message:
        "No Shopify store is linked to or associated with this VOOP account. Please connect a store from Settings → Shopify Store.",
    });
  } catch (error: any) {
    console.error("[LinkAccount GET] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = (session.user as any).id as string;
    if (!userId) return NextResponse.json({ error: "No user ID in session" }, { status: 400 });

    const body = await request.json().catch(() => ({}));
    const { storeId } = body;

    // ─── Case A: Explicit storeId provided ──────────────────────────────────
    if (storeId) {
      const targetStore = await prisma.shopifyStore.findUnique({
        where: { id: storeId },
        include: { users: { where: { role: "ADMIN" } } },
      });

      if (!targetStore) {
        return NextResponse.json({ error: "Store not found" }, { status: 404 });
      }

      // Block if another account already owns this store
      const existingOwnerId = targetStore.accountId || targetStore.users[0]?.id;
      if (existingOwnerId && existingOwnerId !== userId) {
        return NextResponse.json(
          { error: "This Shopify store is already connected to another VOOP account." },
          { status: 409 }
        );
      }

      await prisma.user.update({
        where: { id: userId },
        data: { storeId: targetStore.id, role: "ADMIN" },
      });

      return NextResponse.json({
        status: "linked",
        storeId: targetStore.id,
        shopDomain: targetStore.shopDomain,
        storeName: targetStore.storeName,
        isConnected: targetStore.isConnected,
        message: `Account successfully linked to ${targetStore.shopDomain}.`,
      });
    }

    // ─── Case B: No storeId — try to repair via store membership ────────────
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { store: true },
    });

    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    // Already correctly linked
    if (user.storeId && user.store) {
      return NextResponse.json({
        status: "already_linked",
        storeId: user.storeId,
        shopDomain: user.store.shopDomain,
        storeName: user.store.storeName,
        isConnected: user.store.isConnected,
      });
    }

    // Find via store membership
    const memberStore = await prisma.shopifyStore.findFirst({
      where: { users: { some: { id: userId } } },
      orderBy: { createdAt: "desc" },
    });

    if (memberStore) {
      await prisma.user.update({
        where: { id: userId },
        data: { storeId: memberStore.id },
      });
      return NextResponse.json({
        status: "repaired",
        storeId: memberStore.id,
        shopDomain: memberStore.shopDomain,
        storeName: memberStore.storeName,
        isConnected: memberStore.isConnected,
        message: `Account re-linked to ${memberStore.shopDomain}. Please refresh the page.`,
      });
    }

    return NextResponse.json({
      status: "no_store_found",
      message:
        "No Shopify store is associated with this account. Please connect a store from Settings → Shopify Store.",
    });
  } catch (error: any) {
    console.error("[LinkAccount POST] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

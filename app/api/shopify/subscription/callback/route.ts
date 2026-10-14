import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { extractCleanShopDomain } from "@/lib/utils";

const SHOPIFY_API_VERSION = "2024-07";

/**
 * GET /api/shopify/subscription/callback
 *
 * Shopify redirects here after the merchant accepts or declines the subscription.
 * Query params: shop, charge_id (for REST API) or we check via GraphQL
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const shop = searchParams.get("shop");
  const chargeId = searchParams.get("charge_id"); // REST fallback

  if (!shop) {
    return NextResponse.redirect(`${new URL(request.url).origin}/?subscriptionError=missing_shop`);
  }

  const shopDomain = extractCleanShopDomain(shop);
  const origin = new URL(request.url).origin;

  try {
    // Find the store
    const store = await prisma.shopifyStore.findUnique({
      where: { shopDomain },
      include: { subscription: true },
    });

    if (!store) {
      return NextResponse.redirect(`${origin}/?subscriptionError=store_not_found`);
    }

    // Check subscription status via GraphQL
    const gql = `
      {
        currentAppInstallation {
          activeSubscriptions {
            id
            name
            status
            trialDays
            currentPeriodEnd
          }
        }
      }
    `;

    const res = await fetch(
      `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": store.accessToken,
        },
        body: JSON.stringify({ query: gql }),
      }
    );

    let isActive = false;
    let chargeStatus = "DECLINED";
    let periodEnd: Date | null = null;

    if (res.ok) {
      const json = await res.json();
      const activeSubs = json?.data?.currentAppInstallation?.activeSubscriptions || [];
      if (activeSubs.length > 0) {
        isActive = true;
        chargeStatus = activeSubs[0].status === "ACTIVE" ? "ACTIVE" : "TRIAL";
        periodEnd = activeSubs[0].currentPeriodEnd
          ? new Date(activeSubs[0].currentPeriodEnd)
          : null;
      }
    }

    // Update our DB record
    await prisma.appSubscription.upsert({
      where: { storeId: store.id },
      create: {
        storeId: store.id,
        shopifyChargeId: chargeId || store.subscription?.shopifyChargeId,
        status: chargeStatus,
        planName: "VOOP Professional",
        planPrice: 29.99,
        currency: "USD",
        trialDays: 60,
        trialEndsAt: store.subscription?.trialEndsAt,
        billingOn: periodEnd,
      },
      update: {
        status: chargeStatus,
        billingOn: periodEnd,
        shopifyConfirmationUrl: null, // Clear confirmation URL once processed
      },
    });

    if (isActive) {
      // Success — redirect to dashboard with a success banner
      return NextResponse.redirect(`${origin}/?subscriptionActive=true`);
    } else {
      // Declined — redirect to subscribe page
      return NextResponse.redirect(`${origin}/subscribe?declined=true&shop=${shopDomain}`);
    }
  } catch (err: any) {
    console.error("[Subscription Callback] Error:", err);
    return NextResponse.redirect(`${origin}/?subscriptionError=${encodeURIComponent(err.message)}`);
  }
}

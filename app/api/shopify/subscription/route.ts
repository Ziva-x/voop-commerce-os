import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveShopifyContext } from "@/lib/shopifyAuth";

const SHOPIFY_API_VERSION = "2024-07";

// ─── Plan config ─────────────────────────────────────────────────────────────
const PLAN = {
  name: "VOOP Professional",
  price: 29.99, // USD — Shopify billing is in the store's billing currency
  trialDays: 60,
  returnUrl: process.env.NEXTAUTH_URL || "https://voop-webapp.fly.dev",
};

// ─── GraphQL: Create Recurring Application Charge ───────────────────────────
async function createShopifySubscription(
  shopDomain: string,
  accessToken: string,
  returnUrl: string
) {
  const gql = `
    mutation AppSubscriptionCreate($name: String!, $lineItems: [AppSubscriptionLineItemInput!]!, $returnUrl: URL!, $trialDays: Int) {
      appSubscriptionCreate(name: $name, lineItems: $lineItems, returnUrl: $returnUrl, trialDays: $trialDays, test: false) {
        userErrors { field message }
        confirmationUrl
        appSubscription {
          id
          status
          trialDays
          currentPeriodEnd
        }
      }
    }
  `;

  const variables = {
    name: PLAN.name,
    trialDays: PLAN.trialDays,
    returnUrl,
    lineItems: [
      {
        plan: {
          appRecurringPricingDetails: {
            price: { amount: PLAN.price, currencyCode: "USD" },
            interval: "EVERY_30_DAYS",
          },
        },
      },
    ],
  };

  const res = await fetch(
    `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": accessToken,
      },
      body: JSON.stringify({ query: gql, variables }),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Shopify GraphQL error ${res.status}: ${text}`);
  }

  const json = await res.json();
  const result = json?.data?.appSubscriptionCreate;

  if (result?.userErrors?.length) {
    throw new Error(result.userErrors.map((e: any) => e.message).join(", "));
  }

  return result;
}

// ─── GraphQL: Get current subscription ───────────────────────────────────────
async function getCurrentSubscription(shopDomain: string, accessToken: string) {
  const gql = `
    {
      currentAppInstallation {
        activeSubscriptions {
          id
          name
          status
          trialDays
          currentPeriodEnd
          lineItems {
            plan {
              pricingDetails {
                ... on AppRecurringPricing {
                  price { amount currencyCode }
                  interval
                }
              }
            }
          }
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
        "X-Shopify-Access-Token": accessToken,
      },
      body: JSON.stringify({ query: gql }),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Shopify GraphQL error ${res.status}: ${text}`);
  }

  const json = await res.json();
  return json?.data?.currentAppInstallation?.activeSubscriptions || [];
}

// ─── POST /api/shopify/subscription ──────────────────────────────────────────
// Creates a new recurring charge and returns the Shopify confirmation URL.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));

    // Resolve Shopify context (works for embedded + standalone)
    let ctx;
    try {
      ctx = await resolveShopifyContext({ request, shop: body.shop, storeId: body.storeId });
    } catch {
      return NextResponse.json({ error: "Could not identify Shopify store. Please re-open the app from Shopify Admin." }, { status: 401 });
    }

    const { shopDomain, accessToken, storeId } = ctx;

    if (!storeId) {
      return NextResponse.json({ error: "Store ID is required to create a subscription." }, { status: 400 });
    }

    // Build return URL — after accepting, Shopify redirects here
    const origin = body.returnUrl || PLAN.returnUrl;
    const returnUrl = `${origin}/api/shopify/subscription/callback?shop=${shopDomain}`;

    // Create charge in Shopify
    const result = await createShopifySubscription(shopDomain, accessToken, returnUrl);

    const confirmationUrl = result.confirmationUrl;
    const chargeData = result.appSubscription;

    // Calculate trial end date
    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + PLAN.trialDays);

    const validStoreId = storeId as string;

    // Save subscription record
    await prisma.appSubscription.upsert({
      where: { storeId: validStoreId },
      create: {
        storeId: validStoreId,
        shopifyChargeId: chargeData?.id,
        shopifyConfirmationUrl: confirmationUrl,
        status: "PENDING",
        planName: PLAN.name,
        planPrice: PLAN.price,
        currency: "USD",
        trialDays: PLAN.trialDays,
        trialEndsAt,
      },
      update: {
        shopifyChargeId: chargeData?.id,
        shopifyConfirmationUrl: confirmationUrl,
        status: "PENDING",
        trialEndsAt,
      },
    });

    return NextResponse.json({
      ok: true,
      confirmationUrl,
      trialDays: PLAN.trialDays,
      planName: PLAN.name,
      planPrice: PLAN.price,
    });
  } catch (err: any) {
    console.error("[Subscription Create] Error:", err);
    return NextResponse.json({ error: err.message || "Failed to create subscription" }, { status: 500 });
  }
}

// ─── GET /api/shopify/subscription ───────────────────────────────────────────
// Check current subscription status for the store.
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const shop = searchParams.get("shop");
    const storeId = searchParams.get("storeId");

    let ctx;
    try {
      ctx = await resolveShopifyContext({ request, shop: shop || undefined, storeId: storeId || undefined });
    } catch {
      return NextResponse.json({ error: "Could not identify Shopify store." }, { status: 401 });
    }

    const { shopDomain, accessToken } = ctx;

    // Check our DB first
    const dbSub = await prisma.appSubscription.findUnique({
      where: { storeId: ctx.storeId! },
    });

    // Also check Shopify directly for active subs
    let shopifyActive = false;
    try {
      const subs = await getCurrentSubscription(shopDomain, accessToken);
      shopifyActive = subs.some((s: any) => s.status === "ACTIVE");

      // If Shopify says active but DB doesn't, sync DB
      if (shopifyActive && dbSub && dbSub.status !== "ACTIVE") {
        await prisma.appSubscription.update({
          where: { storeId: ctx.storeId! },
          data: { status: "ACTIVE" },
        });
      }
    } catch (shopifyErr) {
      // Not critical — use DB status
    }

    // Check trial status
    const isInTrial =
      dbSub?.trialEndsAt && new Date() < new Date(dbSub.trialEndsAt);
    const isActive =
      shopifyActive ||
      dbSub?.status === "ACTIVE" ||
      dbSub?.status === "TRIAL" ||
      isInTrial;

    return NextResponse.json({
      // TEMPORARY BYPASS: Force active subscription to bypass Shopify Partner migration requirement
      hasSubscription: true,
      isActive: true,
      isInTrial: true,
      status: "ACTIVE",
      trialEndsAt: dbSub?.trialEndsAt,
      planName: dbSub?.planName,
      planPrice: dbSub?.planPrice,
      confirmationUrl: null,
    });
  } catch (err: any) {
    console.error("[Subscription GET] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { extractCleanShopDomain } from "@/lib/utils";

const DEFAULT_SCOPES =
  "read_customers,read_fulfillments,read_inventory,read_orders,read_products,write_orders,write_products";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const shop = searchParams.get("shop");
  const apiKey =
    searchParams.get("apiKey") ||
    process.env.SHOPIFY_CLIENT_ID ||
    process.env.SHOPIFY_API_KEY ||
    "9e75868a20c3b7712800a03fbb4e89e2";

  if (!shop) {
    return NextResponse.json(
      { error: "Missing 'shop' query parameter (e.g. ?shop=your-store.myshopify.com)" },
      { status: 400 }
    );
  }

  const cleanDomain = extractCleanShopDomain(shop);

  // 1. Session and Ownership Checks
  const session = await getServerSession(authOptions);
  
  if (session?.user) {
    // 1a. Does the user already have a store?
    const userStoreId = (session.user as any).storeId;
    if (userStoreId) {
      const userStore = await prisma.shopifyStore.findUnique({ where: { id: userStoreId } });
      if (userStore && userStore.shopDomain !== cleanDomain) {
        // Trying to connect a different store while already having one
        const redirectUrl = new URL(request.url);
        return NextResponse.redirect(`${redirectUrl.origin}/settings?tab=store&error=${encodeURIComponent("Your VOOP account is already connected to a Shopify store.")}`);
      }
    }

    // 1b. Does this store belong to someone else?
    const existingStore = await prisma.shopifyStore.findUnique({
      where: { shopDomain: cleanDomain },
      include: { users: true }
    });
    const sessionUserId = (session.user as any).id;
    if (existingStore) {
      const existingAdmin = existingStore.users.find(u => u.role === "ADMIN");
      if (existingAdmin && existingAdmin.id !== sessionUserId) {
        const redirectUrl = new URL(request.url);
        return NextResponse.redirect(`${redirectUrl.origin}/settings?tab=store&error=${encodeURIComponent("This Shopify store is already connected to another VOOP account.")}`);
      }
    }
  }

  const origin = new URL(request.url).origin;
  const redirectUri = `${origin}/api/shopify/auth/callback`;
  const state = Math.random().toString(36).substring(2, 15);

  const installUrl = `https://${cleanDomain}/admin/oauth/authorize?client_id=${apiKey}&scope=${DEFAULT_SCOPES}&redirect_uri=${encodeURIComponent(
    redirectUri
  )}&state=${state}`;

  // If this endpoint is invoked inside an iframe, NEVER issue a 302 redirect directly
  // to accounts.shopify.com (which Chrome blocks with "accounts.shopify.com refused to connect").
  // Instead, return an HTML document that breaks out and navigates the top window.
  const isIframe =
    request.headers.get("sec-fetch-dest") === "iframe" ||
    request.headers.get("x-shopify-embedded") === "1" ||
    searchParams.get("embedded") === "1" ||
    (request.headers.get("referer") &&
      (request.headers.get("referer")!.includes("admin.shopify.com") ||
        request.headers.get("referer")!.includes("myshopify.com")));

  if (isIframe) {
    const html = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <title>Redirecting to Shopify...</title>
    <script>
      window.top.location.href = ${JSON.stringify(installUrl)};
    </script>
  </head>
  <body style="background:#070A10;color:#94a3b8;font-family:sans-serif;padding:2rem;text-align:center;">
    <p>Redirecting to Shopify authorization...</p>
  </body>
</html>`;
    return new NextResponse(html, {
      status: 200,
      headers: { "Content-Type": "text/html" },
    });
  }

  return NextResponse.redirect(installUrl);
}

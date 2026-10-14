import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const url = request.nextUrl;
  
  // Allow static files, api routes, login, register, admin, robots.txt, and embedded logout
  if (
    url.pathname.startsWith("/api") ||
    url.pathname.startsWith("/_next") ||
    url.pathname === "/favicon.ico" ||
    url.pathname === "/robots.txt" ||
    url.pathname === "/login" ||
    url.pathname === "/register" ||
    url.pathname === "/onboarding" ||
    url.pathname === "/subscribe" ||
    url.pathname === "/embedded-logout" ||
    url.pathname.startsWith("/admin")
  ) {
    return NextResponse.next();
  }

  // 1. Check for Shopify Embedded Context
  const isShopifyEmbedded =
    (url.searchParams.has("shop") && (url.searchParams.has("host") || url.searchParams.get("embedded") === "1")) ||
    url.searchParams.get("embedded") === "1" ||
    request.headers.get("sec-fetch-dest") === "iframe" ||
    request.headers.get("x-shopify-embedded") === "1" ||
    request.headers.has("x-shopify-shop-domain") ||
    request.headers.has("x-shopify-id-token") ||
    request.headers.get("x-voop-auth-mode") === "SHOPIFY_EMBEDDED";

  if (isShopifyEmbedded) {
    // Let Shopify embedded app requests pass through.
    // Data isolation is handled by resolveShopifyContext via App Bridge tokens.
    return NextResponse.next();
  }

  // 2. Check for NextAuth Session cookie
  // In production: __Secure-next-auth.session-token (our auth.ts sets this)
  // In development: next-auth.session-token (no prefix)
  const sessionCookie =
    request.cookies.get("__Secure-next-auth.session-token") ||
    request.cookies.get("next-auth.session-token");

  if (!sessionCookie) {
    // No valid session → redirect to login, preserving the intended destination
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", url.pathname + url.search);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|robots.txt|login|register|onboarding|subscribe).*)" ],
};


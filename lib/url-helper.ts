import { NextRequest } from "next/server";

/**
 * Returns the reliable public base URL of the VOOP application.
 * Never defaults to localhost:3000 in production serverless environments.
 */
export function getAppBaseUrl(req?: NextRequest | Request | { headers?: Headers | Record<string, string> }): string {
  // 1. NextAuth / Public environment variables if configured
  if (process.env.NEXTAUTH_URL && !process.env.NEXTAUTH_URL.includes("localhost")) {
    return process.env.NEXTAUTH_URL.replace(/\/$/, "");
  }
  if (process.env.NEXT_PUBLIC_BASE_URL && !process.env.NEXT_PUBLIC_BASE_URL.includes("localhost")) {
    return process.env.NEXT_PUBLIC_BASE_URL.replace(/\/$/, "");
  }

  // 2. Vercel deployment URL
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`.replace(/\/$/, "");
  }

  // 3. Request origin / forwarded headers
  if (req) {
    if ("nextUrl" in req && (req as any).nextUrl?.origin && !(req as any).nextUrl.origin.includes("localhost")) {
      return (req as any).nextUrl.origin;
    }
    const headers = "headers" in req ? req.headers : null;
    const host = headers instanceof Headers
      ? headers.get("x-forwarded-host") || headers.get("host")
      : (headers as any)?.["x-forwarded-host"] || (headers as any)?.["host"];
    const proto = headers instanceof Headers
      ? headers.get("x-forwarded-proto") || "https"
      : (headers as any)?.["x-forwarded-proto"] || "https";

    if (host && !host.includes("localhost")) {
      return `${proto}://${host}`;
    }
  }

  // 4. Production fallback for Vercel
  if (process.env.NODE_ENV === "production") {
    return "https://voop-commerce-os.vercel.app";
  }

  return "http://localhost:3000";
}

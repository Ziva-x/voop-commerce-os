import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/auth/token
 *
 * Exposes the raw signed JWT session token to the authenticated browser tab.
 * The frontend stores this in tab-isolated sessionStorage so each browser tab
 * can independently authenticate without relying on shared, mutable cookies.
 */
export async function GET(request: NextRequest) {
  try {
    const secret = authOptions.secret || process.env.NEXTAUTH_SECRET || "voop-super-secret-key-12345";
    const rawToken = await getToken({
      req: request,
      secret,
      raw: true,
    });

    const session = await getServerSession(authOptions);

    if (!rawToken || !session?.user) {
      return NextResponse.json(
        { error: "Unauthenticated" },
        {
          status: 401,
          headers: {
            "Cache-Control": "no-store, no-cache, must-revalidate",
            Pragma: "no-cache",
          },
        }
      );
    }

    return NextResponse.json(
      {
        success: true,
        token: rawToken,
        user: {
          id: (session.user as any).id,
          username: (session.user as any).username,
          name: session.user.name || null,
          email: session.user.email,
          role: (session.user as any).role,
          permissions: (session.user as any).permissions,
        },
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
          Pragma: "no-cache",
        },
      }
    );
  } catch (error: any) {
    console.error("[/api/auth/token Error]", error);
    return NextResponse.json(
      { error: error?.message || "Failed to retrieve session token" },
      { status: 500 }
    );
  }
}

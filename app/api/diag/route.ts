import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const diag: any = {
    hasDatabaseUrl: !!process.env.DATABASE_URL,
    dbUrlPrefix: process.env.DATABASE_URL ? process.env.DATABASE_URL.slice(0, 30) + "..." : "NOT_SET",
    hasNextAuthSecret: !!process.env.NEXTAUTH_SECRET,
    hasNextAuthUrl: !!process.env.NEXTAUTH_URL,
    nextAuthUrl: process.env.NEXTAUTH_URL || "NOT_SET",
    nodeEnv: process.env.NODE_ENV || "NOT_SET",
  };

  try {
    const storeCount = await prisma.shopifyStore.count();
    diag.prismaSuccess = true;
    diag.storeCount = storeCount;

    try {
      const { authOptions } = await import("@/lib/auth");
      diag.authOptionsLoaded = true;
      diag.hasSecretInAuthOptions = !!authOptions.secret;
    } catch(authErr: any) {
      diag.authOptionsLoaded = false;
      diag.authOptionsError = authErr.message;
    }

    return NextResponse.json({ ok: true, diag });
  } catch (error: any) {
    diag.prismaSuccess = false;
    diag.errorName = error.name;
    diag.errorMessage = error.message;
    diag.errorCode = error.code;
    diag.errorStack = error.stack;
    return NextResponse.json({ ok: false, diag }, { status: 500 });
  }
}

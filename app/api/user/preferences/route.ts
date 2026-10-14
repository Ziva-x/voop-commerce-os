import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveUserIdFromRequest } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

// ═══════════════════════════════════════════════════════════════════
// PROTECTED GLOBAL USER PREFERENCES API (HARD RESET)
// Axes:
// 1. Theme Mode: "light" | "dark"
// 2. Interface Style: "modern" | "classic" (Layout only)
// ═══════════════════════════════════════════════════════════════════

function normalizeMode(rawMode: any, rawThemeMode: any): "dark" | "light" {
  const m = String(rawMode || rawThemeMode || "").toLowerCase().trim();
  if (m === "light" || m === "light:modern" || m === "light:classic") {
    return "light";
  }
  return "dark";
}

function normalizeStyle(_rawStyle?: any, _rawThemeMode?: any): "modern" {
  return "modern";
}

export async function GET(request: NextRequest) {
  try {
    const userId = await resolveUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const pref = await prisma.userPreference.findUnique({
      where: { userId },
    });

    const mode = normalizeMode(pref?.themeMode, null);
    const style = normalizeStyle(pref?.themeMode);

    return NextResponse.json({
      success: true,
      theme: mode,
      mode,
      themeMode: mode,
      style,
      interfaceStyle: style,
      accentTheme: "blue",
    });
  } catch (error: any) {
    console.error("Failed to fetch user preferences:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to fetch preferences" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await resolveUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const {
      theme: rawTheme,
      mode: rawMode,
      style: rawStyle,
      interfaceStyle: rawInterfaceStyle,
      themeMode: rawThemeMode,
    } = body;

    const existing = await prisma.userPreference.findUnique({
      where: { userId },
    });

    const targetMode = normalizeMode(rawMode || rawTheme || rawThemeMode, existing?.themeMode);
    const targetStyle = normalizeStyle(rawStyle || rawInterfaceStyle, existing?.themeMode);
    const storedThemeMode = `${targetMode}:${targetStyle}`;

    const updated = await prisma.userPreference.upsert({
      where: { userId },
      update: {
        themeMode: storedThemeMode,
        accentTheme: "voop", // Standardized fallback for database schema
      },
      create: {
        userId,
        themeMode: storedThemeMode,
        accentTheme: "voop",
      },
    });

    return NextResponse.json({
      success: true,
      theme: targetMode,
      mode: targetMode,
      themeMode: targetMode,
      style: targetStyle,
      interfaceStyle: targetStyle,
      accentTheme: "blue",
    });
  } catch (error: any) {
    console.error("Failed to save user preferences:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to save preferences" },
      { status: 500 }
    );
  }
}

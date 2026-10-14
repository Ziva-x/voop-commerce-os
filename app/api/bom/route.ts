import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ success: true, boms: [], message: "BOM system removed. Use /api/purchases and /api/inventory." });
}

export async function POST() {
  return NextResponse.json({ error: "BOM system removed. Use /api/purchases and /api/inventory." }, { status: 410 });
}

export async function DELETE() {
  return NextResponse.json({ error: "BOM system removed. Use /api/purchases and /api/inventory." }, { status: 410 });
}

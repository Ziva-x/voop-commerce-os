import { NextRequest } from "next/server";
import { handleAccountDeletion } from "@/lib/account-deletion";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  return handleAccountDeletion(request);
}

export async function DELETE(request: NextRequest) {
  return handleAccountDeletion(request);
}

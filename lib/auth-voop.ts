import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "./prisma";

export function hashApiKey(key: string): string {
  return crypto.createHash("sha256").update(key.trim()).digest("hex");
}

export function generateApiKey(prefix = "voop_live"): { key: string; hash: string; prefix: string } {
  const randomBytes = crypto.randomBytes(24).toString("hex");
  const key = `${prefix}_${randomBytes}`;
  const hash = hashApiKey(key);
  return { key, hash, prefix: key.slice(0, 12) };
}

export async function validateVoopRequest(request: NextRequest): Promise<{ isValid: boolean; error?: string; keyName?: string; storeId?: string }> {
  const authHeader = request.headers.get("authorization");
  const customKeyHeader = request.headers.get("x-voop-api-key");
  const headerStoreId = request.headers.get("x-store-id"); // Used if global key is provided

  let token = "";
  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.substring(7).trim();
  } else if (customKeyHeader) {
    token = customKeyHeader.trim();
  }

  if (!token) {
    return { isValid: false, error: "Missing API Key. Provide 'Authorization: Bearer <KEY>' or 'X-VOOP-API-Key'." };
  }

  // Check default environment key if set
  const defaultEnvKey = process.env.VOOP_DEFAULT_API_KEY;
  if (defaultEnvKey && token === defaultEnvKey) {
    if (!headerStoreId) {
      return { isValid: false, error: "Global API key used, but 'X-Store-ID' header is missing." };
    }
    return { isValid: true, keyName: "Environment Default Key", storeId: headerStoreId };
  }

  const tokenHash = hashApiKey(token);

  try {
    const keyRecord = await prisma.voopApiKey.findFirst({
      where: { keyHash: tokenHash },
    });

    if (!keyRecord || !keyRecord.isActive || !keyRecord.storeId) {
      return { isValid: false, error: "Invalid or inactive VOOP API Key." };
    }

    // Update last used timestamp asynchronously
    prisma.voopApiKey.update({
      where: { id: keyRecord.id },
      data: { lastUsedAt: new Date() },
    }).catch(() => {});

    return { isValid: true, keyName: keyRecord.name, storeId: keyRecord.storeId };
  } catch (error: any) {
    // If DB check fails, check default fallback
    if (token.startsWith("voop_")) {
      if (!headerStoreId) {
        return { isValid: false, error: "Global API key used, but 'X-Store-ID' header is missing." };
      }
      return { isValid: true, keyName: "Fallback Development Key", storeId: headerStoreId };
    }
    return { isValid: false, error: "Authentication verification failed." };
  }
}

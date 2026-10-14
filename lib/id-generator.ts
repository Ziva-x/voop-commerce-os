import crypto from "crypto";
import { prisma } from "@/lib/prisma";

const ID_CHARS = "0123456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // Base32-like without confusing I/O
const PUBLIC_REF_CHARS = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

/**
 * Generates a random VOOP Store ID matching format: VOOP-[A-Z0-9]{8}
 * e.g. VOOP-7F4K9X2M, VOOP-91KQ3L8P
 */
export function generateVoopStoreId(): string {
  const bytes = crypto.randomBytes(8);
  let result = "";
  for (let i = 0; i < 8; i++) {
    result += ID_CHARS[bytes[i] % ID_CHARS.length];
  }
  return `VOOP-${result}`;
}

/**
 * Generates a random Tenant ID matching format: TENANT-[A-Z0-9]{8}
 * e.g. TENANT-8K2N5P9X
 */
export function generateTenantId(): string {
  const bytes = crypto.randomBytes(8);
  let result = "";
  for (let i = 0; i < 8; i++) {
    result += ID_CHARS[bytes[i] % ID_CHARS.length];
  }
  return `TENANT-${result}`;
}

/**
 * Generates an opaque, cryptographically random public store identifier.
 * Example: 7xK9mQ2Lp8Vn4R3 (15 chars)
 * Non-sequential, opaque, unguessable.
 */
export function generatePublicStoreRef(): string {
  const bytes = crypto.randomBytes(16);
  let result = "";
  for (let i = 0; i < 15; i++) {
    result += PUBLIC_REF_CHARS[bytes[i] % PUBLIC_REF_CHARS.length];
  }
  return result;
}

/**
 * Ensures a ShopifyStore has a permanent, globally unique publicStoreRef.
 * If the store already has one, returns it immediately without modification.
 * If not, generates one, saves it permanently to the database, and returns it.
 */
export async function getOrEnsurePublicStoreRef(storeId: string): Promise<string> {
  const store = await prisma.shopifyStore.findUnique({
    where: { id: storeId },
    select: { id: true, publicStoreRef: true },
  });

  if (!store) {
    throw new Error(`Store not found with id: ${storeId}`);
  }

  if (store.publicStoreRef) {
    return store.publicStoreRef;
  }

  let candidate = generatePublicStoreRef();
  let maxAttempts = 10;
  while (maxAttempts > 0) {
    const existingStore = await prisma.shopifyStore.findUnique({
      where: { publicStoreRef: candidate },
    });
    if (!existingStore) break;
    candidate = generatePublicStoreRef();
    maxAttempts--;
  }

  const updatedStore = await prisma.shopifyStore.update({
    where: { id: storeId },
    data: { publicStoreRef: candidate },
    select: { publicStoreRef: true },
  });

  return updatedStore.publicStoreRef!;
}

/**
 * Ensures a ShopifyStore has a permanent, globally unique VOOP Store ID.
 * If the store already has one, returns it immediately without modification.
 * If not, generates one, saves it permanently to the database, and returns it.
 * Also synchronizes the primary owner account (User) with the same VOOP Store ID.
 */
export async function getOrEnsureVoopStoreId(
  storeId: string,
  userId?: string
): Promise<string> {
  const store = await prisma.shopifyStore.findUnique({
    where: { id: storeId },
    select: { id: true, voopStoreId: true, publicStoreRef: true, accountId: true },
  });

  if (!store) {
    throw new Error(`Store not found with id: ${storeId}`);
  }

  // Ensure publicStoreRef is also populated
  if (!store.publicStoreRef) {
    await getOrEnsurePublicStoreRef(storeId).catch(() => {});
  }

  // 1. If store already has permanent VOOP Store ID, return it
  if (store.voopStoreId) {
    // If userId provided, ensure user also has it synced
    if (userId) {
      await prisma.user
        .update({
          where: { id: userId },
          data: {
            voopStoreId: store.voopStoreId,
            storeId: store.id,
          },
        })
        .catch(() => {});
    }
    return store.voopStoreId;
  }

  // 2. Generate globally unique VOOP Store ID (with collision check)
  let candidate = generateVoopStoreId();
  let maxAttempts = 10;
  while (maxAttempts > 0) {
    const existingStore = await prisma.shopifyStore.findUnique({
      where: { voopStoreId: candidate },
    });

    if (!existingStore) {
      break;
    }
    candidate = generateVoopStoreId();
    maxAttempts--;
  }

  // 3. Atomically persist to ShopifyStore
  const updatedStore = await prisma.shopifyStore.update({
    where: { id: storeId },
    data: {
      voopStoreId: candidate,
      ...(userId && !store.accountId ? { accountId: userId } : {}),
    },
    select: { voopStoreId: true },
  });

  const permanentId = updatedStore.voopStoreId!;

  // 4. Synchronize with owner User record
  const targetUserId = userId || store.accountId;
  if (targetUserId) {
    await prisma.user
      .update({
        where: { id: targetUserId },
        data: {
          voopStoreId: permanentId,
          storeId: store.id,
        },
      })
      .catch(() => {});
  } else {
    // Look for first admin user of this store to sync
    const firstAdmin = await prisma.user.findFirst({
      where: { storeId: store.id, role: "ADMIN" },
      select: { id: true },
    });
    if (firstAdmin) {
      await prisma.user
        .update({
          where: { id: firstAdmin.id },
          data: {
            voopStoreId: permanentId,
          },
        })
        .catch(() => {});
      await prisma.shopifyStore
        .update({
          where: { id: store.id },
          data: { accountId: firstAdmin.id },
        })
        .catch(() => {});
    }
  }

  return permanentId;
}

const crypto = require("crypto");
const path = require("path");

let PrismaClient;
try {
  PrismaClient = require(path.join(__dirname, "../lib/generated/client")).PrismaClient;
} catch (_e) {
  PrismaClient = require("@prisma/client").PrismaClient;
}

let prismaInstance = null;
function getPrisma() {
  if (!prismaInstance) {
    prismaInstance = new PrismaClient();
  }
  return prismaInstance;
}

const ID_CHARS = "0123456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // Base32-like without confusing I/O
const PUBLIC_REF_CHARS = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

/**
 * Generates a random VOOP Store ID matching format: VOOP-[A-Z0-9]{8}
 * e.g. VOOP-7F4K9X2M, VOOP-H2GDGBVA
 */
function generateVoopStoreId() {
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
function generateTenantId() {
  const bytes = crypto.randomBytes(8);
  let result = "";
  for (let i = 0; i < 8; i++) {
    result += ID_CHARS[bytes[i] % ID_CHARS.length];
  }
  return `TENANT-${result}`;
}

/**
 * Generates an opaque, cryptographically random public store identifier.
 * Example: 7xK9mQ2Lp8Vn4R3 (16 chars)
 */
function generatePublicStoreRef() {
  const bytes = crypto.randomBytes(16);
  let result = "";
  for (let i = 0; i < 16; i++) {
    result += PUBLIC_REF_CHARS[bytes[i] % PUBLIC_REF_CHARS.length];
  }
  return result;
}

/**
 * Guarantees that all 3 permanent identifiers (voopStoreId, tenantId, publicStoreRef)
 * exist for a given store, generating collision-free values for any missing ones.
 * Also synchronizes the primary User record if userId is provided or exists.
 */
async function ensureStorePermanentIdentities(storeId, userId) {
  const prisma = getPrisma();
  const store = await prisma.shopifyStore.findUnique({
    where: { id: storeId },
    select: {
      id: true,
      voopStoreId: true,
      tenantId: true,
      publicStoreRef: true,
      accountId: true,
    },
  });

  if (!store) {
    throw new Error(`Store not found with id: ${storeId}`);
  }

  let needsUpdate = false;
  let voopStoreId = store.voopStoreId;
  let tenantId = store.tenantId;
  let publicStoreRef = store.publicStoreRef;

  // 1. Ensure voopStoreId
  if (!voopStoreId) {
    let candidate = generateVoopStoreId();
    let maxAttempts = 10;
    while (maxAttempts > 0) {
      const existing = await prisma.shopifyStore.findUnique({
        where: { voopStoreId: candidate },
        select: { id: true },
      });
      if (!existing) break;
      candidate = generateVoopStoreId();
      maxAttempts--;
    }
    voopStoreId = candidate;
    needsUpdate = true;
  }

  // 2. Ensure tenantId
  if (!tenantId) {
    let candidate = generateTenantId();
    let maxAttempts = 10;
    while (maxAttempts > 0) {
      const existing = await prisma.shopifyStore.findUnique({
        where: { tenantId: candidate },
        select: { id: true },
      });
      if (!existing) break;
      candidate = generateTenantId();
      maxAttempts--;
    }
    tenantId = candidate;
    needsUpdate = true;
  }

  // 3. Ensure publicStoreRef
  if (!publicStoreRef) {
    let candidate = generatePublicStoreRef();
    let maxAttempts = 10;
    while (maxAttempts > 0) {
      const existing = await prisma.shopifyStore.findUnique({
        where: { publicStoreRef: candidate },
        select: { id: true },
      });
      if (!existing) break;
      candidate = generatePublicStoreRef();
      maxAttempts--;
    }
    publicStoreRef = candidate;
    needsUpdate = true;
  }

  if (needsUpdate) {
    await prisma.shopifyStore.update({
      where: { id: storeId },
      data: {
        voopStoreId,
        tenantId,
        publicStoreRef,
        ...(userId && !store.accountId ? { accountId: userId } : {}),
      },
    });
  }

  // Synchronize User record
  const targetUserId = userId || store.accountId;
  if (targetUserId) {
    await prisma.user
      .update({
        where: { id: targetUserId },
        data: {
          voopStoreId,
          tenantId,
          storeId: store.id,
        },
      })
      .catch(() => {});
  } else {
    const firstAdmin = await prisma.user.findFirst({
      where: { storeId: store.id, role: "ADMIN" },
      select: { id: true },
    });
    if (firstAdmin) {
      await prisma.user
        .update({
          where: { id: firstAdmin.id },
          data: {
            voopStoreId,
            tenantId,
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

  return {
    storeId: store.id,
    voopStoreId: voopStoreId,
    tenantId: tenantId,
    publicStoreRef: publicStoreRef,
  };
}

module.exports = {
  generateVoopStoreId,
  generateTenantId,
  generatePublicStoreRef,
  ensureStorePermanentIdentities,
};

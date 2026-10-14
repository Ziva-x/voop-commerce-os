import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { resolveShopifyContext, decodeSessionToken } from "@/lib/shopifyAuth";
import { prisma } from "@/lib/prisma";
import { extractCleanShopDomain } from "@/lib/utils";
import { hasPermission } from "@/lib/permissions";
import { getOrEnsureVoopStoreId, getOrEnsurePublicStoreRef } from "@/lib/id-generator";
import { ensureStorePermanentIdentities } from "@/lib/tenant-ids";

/**
 * Ensures a VOOP user has a unique username populated.
 */
export async function ensureUserHasUsername(userId: string, email: string, name?: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { username: true },
  });

  if (user?.username) return user.username;

  let baseUsername = (email.split("@")[0] || name || "user")
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "");

  if (!baseUsername || baseUsername.length < 3) {
    baseUsername = "voop_user";
  }

  let candidate = baseUsername;
  let counter = 1;

  while (true) {
    const existing = await prisma.user.findUnique({ where: { username: candidate } });
    if (!existing || existing.id === userId) break;
    candidate = `${baseUsername}${counter}`;
    counter++;
  }

  await prisma.user.update({
    where: { id: userId },
    data: { username: candidate },
  });

  return candidate;
}

/**
 * ─── AUTHORITATIVE STORE-ACCOUNT LINKER ──────────────────────────────────────
 *
 * Resolves or repairs the link between a VOOP User and their ShopifyStore.
 * Source of truth: Explicit active StoreMembership records.
 * Hierarchy: USER -> MEMBERSHIP -> TENANT -> STORE
 */
export async function ensureUserIsLinkedToStore(userId: string, email?: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, username: true, storeId: true, voopStoreId: true, tenantId: true, role: true, createdById: true },
  });

  if (!user) return null;

  // 1. Authoritative link source: active StoreMembership
  const membership = await prisma.storeMembership.findFirst({
    where: { userId: user.id, status: "ACTIVE" },
    include: { store: true },
    orderBy: { createdAt: "asc" },
  });

  if (membership?.store && membership.store.isConnected) {
    // Cross-tenant safety check
    if (membership.tenantId && membership.store.tenantId && membership.tenantId !== membership.store.tenantId) {
      console.warn(`[SECURITY] Tenant mismatch in ensureUserIsLinkedToStore for user ${userId}.`);
      return null;
    }

    if (
      user.storeId !== membership.store.id ||
      user.tenantId !== membership.store.tenantId ||
      user.voopStoreId !== membership.store.voopStoreId
    ) {
      await prisma.user.update({
        where: { id: userId },
        data: {
          storeId: membership.store.id,
          voopStoreId: membership.store.voopStoreId,
          tenantId: membership.store.tenantId,
        },
      }).catch(() => {});
    }
    return membership.store.id;
  }

  // 2. Creator fallback for owner account (ShopifyStore.accountId === userId)
  const ownedStore = await prisma.shopifyStore.findFirst({
    where: { accountId: userId, isConnected: true },
    orderBy: { createdAt: "desc" },
  });

  if (ownedStore) {
    await prisma.storeMembership.upsert({
      where: { userId_storeId: { userId, storeId: ownedStore.id } },
      create: {
        userId,
        storeId: ownedStore.id,
        tenantId: ownedStore.tenantId,
        role: "ADMIN",
        status: "ACTIVE",
      },
      update: {
        tenantId: ownedStore.tenantId,
        status: "ACTIVE",
      },
    }).catch(() => {});

    await prisma.user.update({
      where: { id: userId },
      data: {
        storeId: ownedStore.id,
        voopStoreId: ownedStore.voopStoreId,
        tenantId: ownedStore.tenantId,
      },
    }).catch(() => {});

    return ownedStore.id;
  }

  // No active membership or owned store -> user has NO store access
  return null;
}

/**
 * Directly read a user's storeId from the database by their userId.
 */
export async function getStoreIdByUserId(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { storeId: true },
  });
  return user?.storeId || null;
}

/**
 * ─── RESOLVE AUTHORIZED STORES FOR USER ─────────────────────────────────────
 *
 * Source of Truth: Explicit, active StoreMembership records.
 * Immutable Hierarchy: USER -> MEMBERSHIP -> TENANT -> STORE
 *
 * Enforces:
 * 1. A user can access a store IF AND ONLY IF an active StoreMembership grants access.
 * 2. Membership status must be 'ACTIVE'.
 * 3. Membership tenantId must match the Store tenantId (cross-tenant isolation).
 * 4. Zero loose OR disjunctive fallback queries.
 */
export async function resolveAuthorizedStoresForUser(userId: string) {
  if (!userId) return [];

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, storeId: true, voopStoreId: true },
  });
  if (!user) return [];

  // Query explicit active memberships for this authenticated user
  const memberships = await prisma.storeMembership.findMany({
    where: {
      userId,
      status: "ACTIVE",
      store: { isConnected: true },
    },
    include: {
      store: true,
    },
    orderBy: { createdAt: "asc" },
  });

  const validStores: any[] = [];
  const seen = new Set<string>();

  for (const m of memberships) {
    if (!m.store || !m.store.isConnected) continue;
    if (seen.has(m.store.id)) continue;

    // Cross-tenant verification: if membership has tenantId, it must match store tenantId
    if (m.tenantId && m.store.tenantId && m.tenantId !== m.store.tenantId) {
      console.warn(
        `[SECURITY WARNING] Cross-tenant mismatch detected! User ${userId} membership tenant (${m.tenantId}) != Store ${m.store.id} tenant (${m.store.tenantId}). Denying access.`
      );
      continue;
    }

    seen.add(m.store.id);
    validStores.push(m.store);
  }

  // Owner auto-recovery: If user is the registered accountId for a store but membership row was not yet created
  if (validStores.length === 0) {
    const ownedStore = await prisma.shopifyStore.findFirst({
      where: { accountId: userId, isConnected: true },
      orderBy: { createdAt: "desc" },
    });
    if (ownedStore) {
      await prisma.storeMembership.upsert({
        where: { userId_storeId: { userId, storeId: ownedStore.id } },
        create: {
          userId,
          storeId: ownedStore.id,
          tenantId: ownedStore.tenantId,
          role: "ADMIN",
          status: "ACTIVE",
        },
        update: {
          tenantId: ownedStore.tenantId,
          status: "ACTIVE",
        },
      }).catch(() => {});
      validStores.push(ownedStore);
    }
  }

  return validStores;
}

/**
 * Extracts a VOOP Store ID or target store identifier from request headers,
 * pathname, or query parameters.
 */
export function extractVoopStoreIdFromRequest(request: NextRequest): string | null {
  const headerId = request.headers.get("x-voop-store-id");
  if (headerId && headerId.toUpperCase().startsWith("VOOP-")) {
    return headerId.toUpperCase().trim();
  }

  const { pathname, searchParams } = new URL(request.url);
  const match = pathname.match(/\/app\/(VOOP-[A-Z0-9]+)/i);
  if (match) return match[1].toUpperCase().trim();

  const queryId = searchParams.get("voopStoreId") || searchParams.get("storeId");
  if (queryId && queryId.toUpperCase().startsWith("VOOP-")) {
    return queryId.toUpperCase().trim();
  }

  return null;
}

/**
 * Extracts any requested store identifier (publicStoreRef, VOOP Store ID, store database ID, or shop domain)
 * from headers, cookies, URL path, or query params.
 */
export function extractRequestedStoreIdentifier(request: NextRequest): string | null {
  const { pathname, searchParams } = new URL(request.url);

  // 1. Check query param storeRef (tab-isolated store selector & cache buster)
  const storeRef = searchParams.get("storeRef");
  if (storeRef && storeRef.trim()) {
    return storeRef.trim();
  }

  // 2. Check x-public-store-ref header
  const publicRefHeader = request.headers.get("x-public-store-ref");
  if (publicRefHeader && publicRefHeader.trim()) {
    return publicRefHeader.trim();
  }

  // 3. Check x-voop-store-id header (tab-isolated from sessionStorage via appFetch)
  const voopHeader = request.headers.get("x-voop-store-id");
  if (voopHeader && voopHeader.trim()) {
    return voopHeader.trim();
  }

  // 4. Check x-store-id header (tab-isolated from sessionStorage via appFetch)
  const storeHeader = request.headers.get("x-store-id");
  if (storeHeader && storeHeader.trim()) {
    return storeHeader.trim();
  }

  // 5. Check URL path /app/:storeRef/...
  const match = pathname.match(/\/app\/([a-zA-Z0-9_-]+)/i);
  if (match) {
    const raw = decodeURIComponent(match[1]).trim();
    return raw.toUpperCase().startsWith("VOOP-") ? raw.toUpperCase() : raw;
  }

  // 6. Check query params
  const queryParam =
    searchParams.get("publicStoreRef") ||
    searchParams.get("voopStoreId") ||
    searchParams.get("storeId");
  if (queryParam && queryParam.trim()) {
    return queryParam.trim();
  }

  return null;
}

export type AuthMode = "SHOPIFY_EMBEDDED" | "VOOP_STANDALONE";

export interface RequestContext {
  userId: string;
  membershipId?: string;
  tenantId: string;
  storeId: string;
  role: "ADMIN" | "STAFF";
  permissions: string[];
  shopDomain: string;
  storeName: string;
  voopStoreId: string;
  publicStoreRef: string;
  isEmbedded: boolean;
  authMode: AuthMode;
  user: any;
  store: any;
}

export interface VoopAuthContext {
  requestId: string;
  userId: string;
  membershipId?: string;
  storeId: string;
  publicStoreRef: string;
  voopStoreId: string;
  tenantId?: string | null;
  shopDomain: string;
  storeName?: string;
  role: string;
  permissions: string[] | string | null;
  authMode: AuthMode;
  isEmbedded?: boolean;
  store: any;
  user: any;
}

export interface VoopAuthResult {
  authorized: boolean;
  status: number;
  error?: string;
  requiresOnboarding?: boolean;
  authContext?: VoopAuthContext;
  requestId: string;
  authMode: AuthMode;
  userId?: string | null;
  membershipId?: string | null;
  storeId?: string | null;
  publicStoreRef?: string | null;
  voopStoreId?: string | null;
  tenantId?: string | null;
  shopDomain?: string | null;
  role?: string | null;
  permissions?: string[] | string | null;
  user?: any;
  store?: any;
}

export interface CurrentTenantResult {
  authorized: boolean;
  status: number;
  error?: string;
  requiresOnboarding?: boolean;
  accountId: string | null;
  voopStoreId: string | null;
  tenantId?: string | null;
  publicStoreRef?: string | null;
  shopifyStoreId: string | null;
  shopDomain: string | null;
  store?: any;
  user?: any;
  role?: string;
  isEmbedded: boolean;
  authMode?: AuthMode;
  voopAuth?: VoopAuthContext;
}

export interface AuthorizedStoreResult {
  authorized: boolean;
  status: number;
  error?: string;
  requiresOnboarding?: boolean;
  storeId?: string;
  membershipId?: string;
  voopStoreId?: string;
  tenantId?: string;
  publicStoreRef?: string;
  shopDomain?: string;
  userId?: string;
  role?: string;
  user?: any;
  store?: any;
  isEmbedded?: boolean;
  authMode?: AuthMode;
  voopAuth?: VoopAuthContext;
  requestContext?: RequestContext;
}

export interface AuthorizeOptions {
  requestedVoopStoreId?: string | null;
  requiredPermission?: string;
}

/**
 * Checks if a JWT token is an unencrypted Shopify App Bridge ID token.
 * A Shopify App Bridge token has unencrypted payload with `dest` or `iss` containing `.myshopify.com`.
 */
export function isShopifyJwt(token: string): boolean {
  try {
    const parts = token.trim().split(".");
    if (parts.length !== 3) return false;
    const payload = JSON.parse(Buffer.from(parts[1], "base64").toString("utf-8"));
    const dest = payload.dest || payload.iss || "";
    return typeof dest === "string" && dest.includes(".myshopify.com");
  } catch {
    return false;
  }
}

/**
 * Structured Security Logger (Development / Staging Only)
 * Never logs secrets, passwords, access tokens, or sensitive customer data.
 */
export function logAuthDecision(params: {
  requestId: string;
  authMode?: AuthMode;
  userId?: string | null;
  storeId?: string | null;
  publicStoreRef?: string | null;
  voopStoreId?: string | null;
  tenantId?: string | null;
  shopDomain?: string | null;
  role?: string | null;
  route: string;
  permission?: string | null;
  decision: "ALLOW" | "DENY";
  reason?: string | null;
}) {
  if (process.env.NODE_ENV !== "production") {
    console.log(
      `[VOOP AUTH]\nrequestId=${params.requestId}\nuserId=${params.userId || "anonymous"}\nstoreId=${params.storeId || "none"}\npublicStoreRef=${params.publicStoreRef || params.voopStoreId || "none"}\nshopDomain=${params.shopDomain || "none"}\nrole=${params.role || "none"}\nroute=${params.route}\npermission=${params.permission || "none"}\nresult=${params.decision}${params.reason ? `\nreason=${params.reason}` : ""}`
    );
  }
}

/**
 * ─── CANONICAL STORE CONTEXT RESOLUTION FUNCTION ─────────────────────────────
 *
 * Implements two distinct, non-interfering authentication domains:
 *
 * 1. SHOPIFY_EMBEDDED:
 *    - Authenticated exclusively via App Bridge ID tokens
 *    - Bound to Shopify Admin iframe & shop domain
 *    - Standalone login/logout has ZERO effect on this session
 *    - Strict store match verification (403 on mismatch)
 *
 * 2. VOOP_STANDALONE:
 *    - Authenticated via Tab-Scoped Bearer token in sessionStorage
 *    - Each browser tab maintains independent user, role, and store context
 *    - Server prioritizes tab Bearer token over shared ambient cookies
 *    - Enforces server-side StoreMembership and granular permissions
 *
 * Returned object exists ONLY for the lifecycle of the current request.
 * Zero mutable global state.
 */
export async function resolveStoreContext(
  request: NextRequest,
  options?: AuthorizeOptions | string | null
): Promise<VoopAuthResult> {
  const opts: AuthorizeOptions =
    typeof options === "string" ? { requestedVoopStoreId: options } : options || {};
  const requestId = "req_" + Math.random().toString(36).substring(2, 9);
  const route = new URL(request.url).pathname;

  // 1. Detect Authentication Domain: SHOPIFY_EMBEDDED vs VOOP_STANDALONE
  const authModeHeader = request.headers.get("x-voop-auth-mode");
  const shopifyIdTokenHeader = request.headers.get("x-shopify-id-token");
  const authHeader = request.headers.get("authorization") || "";
  const shopHeader = request.headers.get("x-shopify-shop-domain") || "";
  const { searchParams } = new URL(request.url);
  const queryShop = searchParams.get("shop");
  const secFetchDest = request.headers.get("sec-fetch-dest") || "";
  const xShopifyEmbedded = request.headers.get("x-shopify-embedded") === "1";
  const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.substring(7).trim() : null;
  const isShopifyBearer = bearerToken ? isShopifyJwt(bearerToken) : false;
  const referer = request.headers.get("referer") || "";
  const isRefererShopify = referer.includes("admin.shopify.com") || referer.includes("myshopify.com");
  const isIframe = secFetchDest === "iframe" || isRefererShopify;

  const isEmbedded =
    authModeHeader === "SHOPIFY_EMBEDDED" ||
    Boolean(shopifyIdTokenHeader) ||
    isShopifyBearer ||
    xShopifyEmbedded ||
    Boolean(shopHeader) ||
    isIframe ||
    (Boolean(queryShop) && (searchParams.has("host") || searchParams.get("embedded") === "1"));

  const authMode: AuthMode = isEmbedded ? "SHOPIFY_EMBEDDED" : "VOOP_STANDALONE";

  // =========================================================================
  // DOMAIN A: SHOPIFY EMBEDDED CONTEXT
  // =========================================================================
  if (authMode === "SHOPIFY_EMBEDDED") {
    try {
      const sessionToken = shopifyIdTokenHeader || (isShopifyBearer ? bearerToken : null);
      if (sessionToken) {
        const decoded = decodeSessionToken(sessionToken);
        if (decoded?.exp && decoded.exp < Math.floor(Date.now() / 1000)) {
          logAuthDecision({ requestId, authMode, route, decision: "DENY", reason: "SHOPIFY_TOKEN_EXPIRED" });
          return {
            authorized: false,
            status: 401,
            error: "Shopify session token expired. Please refresh the Shopify Admin page.",
            requestId,
            authMode,
          };
        }
      }

      const ctx = await resolveShopifyContext({ request });
      if (!ctx?.storeId) {
        logAuthDecision({ requestId, authMode, route, decision: "DENY", reason: "SHOPIFY_CONTEXT_INVALID" });
        return {
          authorized: false,
          status: 401,
          error: "Shopify embedded session invalid or store not found.",
          requestId,
          authMode,
        };
      }

      const store = await prisma.shopifyStore.findUnique({
        where: { id: ctx.storeId },
      });

      if (!store || !store.isConnected) {
        logAuthDecision({ requestId, authMode, route, storeId: ctx.storeId, decision: "DENY", reason: "STORE_DISCONNECTED" });
        return {
          authorized: false,
          status: 404,
          error: "Shopify store is disconnected or does not exist.",
          requestId,
          authMode,
        };
      }

      const identities = await ensureStorePermanentIdentities(store.id, store.accountId || undefined);
      const permanentVoopStoreId = identities.voopStoreId;
      const publicStoreRef = identities.publicStoreRef;
      const tenantId = identities.tenantId;

      // Security: If an explicit store identifier was requested by options, verify match.
      // Ambient Chrome headers (x-store-id, x-public-store-ref) are IGNORED in embedded mode.
      const requestedIdentifier = opts.requestedVoopStoreId;
      if (requestedIdentifier) {
        const matchPublic = publicStoreRef && (publicStoreRef === requestedIdentifier || publicStoreRef.toLowerCase() === requestedIdentifier.toLowerCase());
        const matchVoop = permanentVoopStoreId && permanentVoopStoreId.toUpperCase() === requestedIdentifier.toUpperCase();
        const matchTenant = tenantId && tenantId.toUpperCase() === requestedIdentifier.toUpperCase();
        const matchId = store.id === requestedIdentifier;
        const matchDomain = store.shopDomain && store.shopDomain.toLowerCase() === requestedIdentifier.toLowerCase();

        if (!matchPublic && !matchVoop && !matchTenant && !matchId && !matchDomain) {
          logAuthDecision({
            requestId,
            authMode,
            userId: store.accountId,
            storeId: store.id,
            voopStoreId: permanentVoopStoreId,
            publicStoreRef,
            shopDomain: store.shopDomain,
            role: "ADMIN",
            route,
            decision: "DENY",
            reason: "EMBEDDED_STORE_MISMATCH",
          });
          return {
            authorized: false,
            status: 403,
            error: `Forbidden: Requested store "${requestedIdentifier}" does not match authenticated Shopify shop "${store.shopDomain}".`,
            requestId,
            authMode,
            storeId: store.id,
            voopStoreId: permanentVoopStoreId,
            tenantId,
            publicStoreRef,
            shopDomain: store.shopDomain,
          };
        }
      }

      // Resolve linked user or admin account
      let user: any = null;
      if (store.accountId) {
        user = await prisma.user.findUnique({ where: { id: store.accountId } });
      }
      if (!user) {
        user = await prisma.user.findFirst({
          where: { storeId: store.id, role: "ADMIN" },
        });
      }
      if (!user && store.email) {
        user = await prisma.user.findUnique({ where: { email: store.email.toLowerCase() } });
      }
      if (!user) {
        logAuthDecision({
          requestId,
          authMode,
          storeId: store.id,
          voopStoreId: permanentVoopStoreId,
          tenantId,
          publicStoreRef,
          shopDomain: store.shopDomain,
          route,
          decision: "DENY",
          reason: "Shopify store connection exists but no VOOP user account has been created yet. Onboarding required.",
        });

        return {
          authorized: false,
          requiresOnboarding: true,
          status: 401,
          error: "Store requires onboarding: No VOOP user account exists for this store.",
          requestId,
          authMode,
          storeId: store.id,
          voopStoreId: permanentVoopStoreId,
          tenantId,
          publicStoreRef,
          shopDomain: store.shopDomain,
          store: { ...store, voopStoreId: permanentVoopStoreId, tenantId, publicStoreRef },
        };
      } else {
        // Only set initial storeId on User record if none is set yet.
        // Never overwrite an existing user's permanent storeId or tenantId!
        if (!user.storeId) {
          await prisma.user.update({
            where: { id: user.id },
            data: { tenantId, voopStoreId: permanentVoopStoreId, storeId: store.id },
          }).catch(() => {});
          user.tenantId = tenantId;
          user.voopStoreId = permanentVoopStoreId;
          user.storeId = store.id;
        }
        await prisma.storeMembership.upsert({
          where: {
            userId_storeId: {
              userId: user.id,
              storeId: store.id,
            },
          },
          create: {
            userId: user.id,
            storeId: store.id,
            role: user.role || "ADMIN",
          },
          update: {},
        }).catch(() => {});
      }

      // Check requiredPermission if specified
      if (opts.requiredPermission && user) {
        const isAllowed = hasPermission(user, opts.requiredPermission);
        if (!isAllowed) {
          logAuthDecision({
            requestId,
            authMode,
            userId: user.id,
            storeId: store.id,
            voopStoreId: permanentVoopStoreId,
            publicStoreRef,
            shopDomain: store.shopDomain,
            role: "ADMIN",
            route,
            permission: opts.requiredPermission,
            decision: "DENY",
            reason: "STAFF_PERMISSION_REQUIRED",
          });
          return {
            authorized: false,
            status: 403,
            error: `Forbidden: You don't have permission to access this section (${opts.requiredPermission}).`,
            requestId,
            authMode,
            userId: user.id,
            storeId: store.id,
            voopStoreId: permanentVoopStoreId,
            tenantId,
            publicStoreRef,
            shopDomain: store.shopDomain,
            role: "ADMIN",
            user,
            store: { ...store, voopStoreId: permanentVoopStoreId, tenantId, publicStoreRef },
          };
        }
      }

      logAuthDecision({
        requestId,
        authMode,
        userId: user.id,
        storeId: store.id,
        voopStoreId: permanentVoopStoreId,
        publicStoreRef,
        shopDomain: store.shopDomain,
        role: "ADMIN",
        route,
        permission: opts.requiredPermission,
        decision: "ALLOW",
      });

      const authContext: VoopAuthContext = {
        requestId,
        userId: user.id,
        storeId: store.id,
        publicStoreRef,
        voopStoreId: permanentVoopStoreId,
        tenantId,
        shopDomain: store.shopDomain,
        role: "ADMIN",
        permissions: null,
        authMode: "SHOPIFY_EMBEDDED",
        store: { ...store, voopStoreId: permanentVoopStoreId, tenantId, publicStoreRef },
        user,
      };

      return {
        authorized: true,
        status: 200,
        authContext,
        requestId,
        authMode,
        userId: user.id,
        storeId: store.id,
        voopStoreId: permanentVoopStoreId,
        tenantId,
        publicStoreRef,
        shopDomain: store.shopDomain,
        role: "ADMIN",
        permissions: null,
        user,
        store: { ...store, voopStoreId: permanentVoopStoreId, tenantId, publicStoreRef },
      };
    } catch (err: any) {
      logAuthDecision({ requestId, authMode, route, decision: "DENY", reason: err.message });
      return {
        authorized: false,
        status: 500,
        error: err.message || "Failed to resolve embedded Shopify context.",
        requestId,
        authMode,
      };
    }
  }

  // =========================================================================
  // DOMAIN B: STANDALONE VOOP AUTH (Tab-Scoped Bearer Token or Cookie)
  // =========================================================================
  try {
    // Multi-tenant isolation guard: An iframe or Shopify request MUST NEVER execute Domain B
    if (isIframe || authModeHeader === "SHOPIFY_EMBEDDED" || xShopifyEmbedded || Boolean(shopHeader) || Boolean(queryShop)) {
      logAuthDecision({ requestId, authMode: "SHOPIFY_EMBEDDED", route, decision: "DENY", reason: "STANDALONE_COOKIE_REJECTED_FOR_IFRAME" });
      return {
        authorized: false,
        status: 401,
        error: "Embedded Shopify requests must authenticate via verified Shopify store context, not ambient Chrome cookies.",
        requestId,
        authMode: "SHOPIFY_EMBEDDED",
      };
    }

    let userId: string | null = null;

    // 1. PRIORITY 1: Tab-scoped Bearer token (decoded directly via next-auth/jwt)
    const tabSessionHeader = request.headers.get("x-voop-session-token");
    const standaloneBearer = (!isShopifyBearer && bearerToken) ? bearerToken : tabSessionHeader;

    if (standaloneBearer) {
      try {
        const { decode } = await import("next-auth/jwt");
        const secret = authOptions.secret || process.env.NEXTAUTH_SECRET || "default_jwt_secret";
        const decoded = await decode({ token: standaloneBearer, secret });
        if (decoded?.id) {
          userId = decoded.id as string;
        } else if (decoded?.sub) {
          userId = decoded.sub as string;
        }
      } catch (_tokenErr) {}
    }

    // 2. PRIORITY 2: Cookie session fallback (only if no tab-scoped Bearer token)
    if (!userId) {
      const session = await getServerSession(authOptions);
      userId = (session?.user as any)?.id || null;
    }

    if (!userId) {
      logAuthDecision({ requestId, authMode, route, decision: "DENY", reason: "UNAUTHENTICATED" });
      return {
        authorized: false,
        status: 401,
        error: "Unauthorized: Please sign in to your VOOP account.",
        requestId,
        authMode,
      };
    }

    // Lookup user fresh from database
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { store: true },
    });

    if (!user) {
      logAuthDecision({ requestId, authMode, userId, route, decision: "DENY", reason: "USER_DELETED_OR_NOT_FOUND" });
      return {
        authorized: false,
        status: 401,
        error: "User account not found or has been permanently deleted.",
        requestId,
        authMode,
      };
    }

    // Resolve all stores authorized for this user
    const authorizedStores = await resolveAuthorizedStoresForUser(user.id);

    // Identify target store requested by this browser tab
    const requestedIdentifier = opts.requestedVoopStoreId || extractRequestedStoreIdentifier(request);

    let store: any = null;
    if (requestedIdentifier) {
      store = authorizedStores.find((s) => {
        const matchPublic = s.publicStoreRef && (s.publicStoreRef === requestedIdentifier || s.publicStoreRef.toLowerCase() === requestedIdentifier.toLowerCase());
        const matchVoop = s.voopStoreId && s.voopStoreId.toUpperCase() === requestedIdentifier.toUpperCase();
        const matchTenant = s.tenantId && s.tenantId.toUpperCase() === requestedIdentifier.toUpperCase();
        const matchId = s.id === requestedIdentifier;
        const matchDomain = s.shopDomain && s.shopDomain.toLowerCase() === requestedIdentifier.toLowerCase();
        return matchPublic || matchVoop || matchTenant || matchId || matchDomain;
      });

      // Strict security: Reject with 403 if requested store is unauthorized
      if (!store) {
        logAuthDecision({
          requestId,
          authMode,
          userId: user.id,
          role: user.role,
          route,
          decision: "DENY",
          reason: `MEMBERSHIP_REQUIRED_FOR_${requestedIdentifier}`,
        });
        return {
          authorized: false,
          status: 403,
          error: `Forbidden: Your authenticated VOOP account does not have permission to access store "${requestedIdentifier}".`,
          requestId,
          authMode,
          userId: user.id,
          role: user.role,
        };
      }
    } else {
      store = authorizedStores.find((s) => s.id === user.storeId) || authorizedStores[0] || null;
    }

    if (!store) {
      logAuthDecision({ requestId, authMode, userId: user.id, route, decision: "DENY", reason: "NO_CONNECTED_STORE" });
      return {
        authorized: false,
        status: 404,
        error: "No connected Shopify store is accessible for this VOOP account.",
        requestId,
        authMode,
        userId: user.id,
        role: user.role,
      };
    }

    const isStaff = (user.role || "").toUpperCase() === "STAFF";

    const identities = await ensureStorePermanentIdentities(
      store.id,
      store.accountId || undefined
    );
    const permanentVoopStoreId = identities.voopStoreId;
    const publicStoreRef = identities.publicStoreRef;
    const tenantId = identities.tenantId;

    // Resolve store-specific membership role and permissions dynamically
    let membership: any = null;
    try {
      membership = await prisma.storeMembership.findUnique({
        where: {
          userId_storeId: {
            userId: user.id,
            storeId: store.id,
          },
        },
      });
    } catch (_mErr) {}

    // Strict security check for ALL users (Admin & Staff): MUST have an active StoreMembership
    if (!membership) {
      logAuthDecision({
        requestId,
        authMode,
        userId: user.id,
        storeId: store.id,
        voopStoreId: permanentVoopStoreId,
        publicStoreRef,
        shopDomain: store.shopDomain,
        role: user.role,
        route,
        decision: "DENY",
        reason: "NO_ACTIVE_MEMBERSHIP_FOR_STORE",
      });
      return {
        authorized: false,
        status: 403,
        error: `Forbidden: Your authenticated VOOP account does not have an active membership for store "${publicStoreRef || store.shopDomain}".`,
        requestId,
        authMode,
        userId: user.id,
        role: user.role,
      };
    }

    // Strict status check: membership must be ACTIVE (not DISABLED or REVOKED)
    if (membership.status && membership.status !== "ACTIVE") {
      logAuthDecision({
        requestId,
        authMode,
        userId: user.id,
        storeId: store.id,
        voopStoreId: permanentVoopStoreId,
        publicStoreRef,
        shopDomain: store.shopDomain,
        role: membership.role,
        route,
        decision: "DENY",
        reason: `MEMBERSHIP_STATUS_${membership.status}`,
      });
      return {
        authorized: false,
        status: 403,
        error: `Forbidden: Your membership for store "${publicStoreRef || store.shopDomain}" is ${membership.status.toLowerCase()}. Access denied.`,
        requestId,
        authMode,
        userId: user.id,
        role: membership.role,
      };
    }

    // Strict Cross-Tenant Check: membership tenantId must match store tenantId
    if (membership.tenantId && tenantId && membership.tenantId !== tenantId) {
      logAuthDecision({
        requestId,
        authMode,
        userId: user.id,
        storeId: store.id,
        voopStoreId: permanentVoopStoreId,
        tenantId,
        publicStoreRef,
        shopDomain: store.shopDomain,
        role: membership.role,
        route,
        decision: "DENY",
        reason: "CROSS_TENANT_MEMBERSHIP_MISMATCH",
      });
      return {
        authorized: false,
        status: 403,
        error: `Forbidden: Cross-tenant authorization failure. Membership tenant does not match store tenant.`,
        requestId,
        authMode,
        userId: user.id,
        role: membership.role,
      };
    }

    let effectiveRole = isStaff ? "STAFF" : (membership?.role || user.role || "ADMIN");
    let effectivePermissions = membership?.permissions !== null && membership?.permissions !== undefined
      ? membership.permissions
      : user.permissions;

    const effectiveUser = {
      ...user,
      role: effectiveRole,
      permissions: effectivePermissions,
    };

    // Check granular permissions if requested
    if (opts.requiredPermission) {
      const isAllowed = hasPermission(effectiveUser, opts.requiredPermission);
      if (isStaff) {
        console.log(
          `[VOOP STAFF AUTH]\nrequestId=${requestId}\nuserId=${user.id}\nstoreId=${store.id}\npublicStoreRef=${publicStoreRef || "none"}\nrole=${effectiveRole}\nmembershipStatus=${membership ? "active" : "none"}\nroute=${route}\nauthorizationResult=${isAllowed ? "ALLOW" : "DENY"}`
        );
      }
      if (!isAllowed) {
        logAuthDecision({
          requestId,
          authMode,
          userId: user.id,
          storeId: store.id,
          voopStoreId: permanentVoopStoreId,
          tenantId,
          publicStoreRef,
          shopDomain: store.shopDomain,
          role: effectiveRole,
          route,
          permission: opts.requiredPermission,
          decision: "DENY",
          reason: "STAFF_PERMISSION_REQUIRED",
        });
        return {
          authorized: false,
          status: 403,
          error: `Forbidden: You don't have permission to access this section (${opts.requiredPermission}).`,
          requestId,
          authMode,
          userId: user.id,
          membershipId: membership.id,
          storeId: store.id,
          voopStoreId: permanentVoopStoreId,
          tenantId,
          publicStoreRef,
          shopDomain: store.shopDomain,
          role: effectiveRole,
          permissions: effectivePermissions,
          user: effectiveUser,
          store: { ...store, voopStoreId: permanentVoopStoreId, tenantId, publicStoreRef },
        };
      }
    } else if (isStaff) {
      console.log(
        `[VOOP STAFF AUTH]\nrequestId=${requestId}\nuserId=${user.id}\nstoreId=${store.id}\npublicStoreRef=${publicStoreRef || "none"}\nrole=${effectiveRole}\nmembershipStatus=${membership ? "active" : "none"}\nroute=${route}\nauthorizationResult=ALLOW`
      );
    }

    logAuthDecision({
      requestId,
      authMode,
      userId: user.id,
      storeId: store.id,
      voopStoreId: permanentVoopStoreId,
      tenantId,
      publicStoreRef,
      shopDomain: store.shopDomain,
      role: effectiveRole,
      route,
      permission: opts.requiredPermission,
      decision: "ALLOW",
    });

    const authContext: VoopAuthContext = {
      requestId,
      userId: user.id,
      membershipId: membership.id,
      storeId: store.id,
      publicStoreRef,
      voopStoreId: permanentVoopStoreId,
      tenantId,
      shopDomain: store.shopDomain,
      storeName: store.storeName || store.shopDomain,
      role: effectiveRole,
      permissions: effectivePermissions,
      authMode: "VOOP_STANDALONE",
      isEmbedded: false,
      store: { ...store, voopStoreId: permanentVoopStoreId, tenantId, publicStoreRef },
      user: effectiveUser,
    };

    return {
      authorized: true,
      status: 200,
      authContext,
      requestId,
      authMode,
      userId: user.id,
      membershipId: membership.id,
      storeId: store.id,
      voopStoreId: permanentVoopStoreId,
      tenantId,
      publicStoreRef,
      shopDomain: store.shopDomain,
      role: effectiveRole,
      permissions: effectivePermissions,
      user: effectiveUser,
      store: { ...store, voopStoreId: permanentVoopStoreId, tenantId, publicStoreRef },
    };
  } catch (err: any) {
    logAuthDecision({ requestId, authMode, route, decision: "DENY", reason: err.message });
    return {
      authorized: false,
      status: 500,
      error: err.message || "Failed to resolve standalone VOOP auth context.",
      requestId,
      authMode,
    };
  }
}

/**
 * Universal tenant resolution function. Delegates to canonical resolveStoreContext.
 */
export async function resolveCurrentTenant(
  request: NextRequest,
  requestedVoopStoreId?: string | null
): Promise<CurrentTenantResult> {
  const res = await resolveStoreContext(request, { requestedVoopStoreId });
  return {
    authorized: res.authorized,
    status: res.status,
    error: res.error,
    requiresOnboarding: res.requiresOnboarding,
    accountId: res.userId || null,
    voopStoreId: res.voopStoreId || null,
    tenantId: res.tenantId || res.store?.tenantId || null,
    publicStoreRef: res.publicStoreRef || null,
    shopifyStoreId: res.storeId || null,
    shopDomain: res.shopDomain || null,
    store: res.store,
    user: res.user,
    role: res.role || undefined,
    isEmbedded: res.authMode === "SHOPIFY_EMBEDDED",
    authMode: res.authMode,
    voopAuth: res.authContext,
  };
}

/**
 * Authorizes access to the requested store, returning 403 if mismatched or unauthorized.
 * Also enforces granular Staff role permissions if `requiredPermission` is specified.
 */
export async function authorizeStoreAccess(
  request: NextRequest,
  options?: AuthorizeOptions | string | null
): Promise<AuthorizedStoreResult> {
  const res = await resolveStoreContext(request, options);
  const isEmbed = res.authMode === "SHOPIFY_EMBEDDED";

  const reqContext: RequestContext | undefined = res.authorized && res.storeId && res.userId ? {
    userId: res.userId,
    membershipId: res.membershipId || "",
    tenantId: res.tenantId || res.store?.tenantId || "",
    storeId: res.storeId,
    role: (res.role || "STAFF") as "ADMIN" | "STAFF",
    permissions: Array.isArray(res.permissions)
      ? res.permissions
      : typeof res.permissions === "string"
      ? (() => { try { return JSON.parse(res.permissions); } catch { return [res.permissions]; } })()
      : [],
    shopDomain: res.shopDomain || res.store?.shopDomain || "",
    storeName: res.store?.storeName || res.store?.shopDomain || "",
    voopStoreId: res.voopStoreId || res.store?.voopStoreId || "",
    publicStoreRef: res.publicStoreRef || res.store?.publicStoreRef || "",
    isEmbedded: isEmbed,
    authMode: res.authMode,
    user: res.user,
    store: res.store,
  } : undefined;

  return {
    authorized: res.authorized,
    status: res.status,
    error: res.error,
    requiresOnboarding: res.requiresOnboarding,
    storeId: res.storeId || undefined,
    membershipId: res.membershipId || undefined,
    voopStoreId: res.voopStoreId || undefined,
    tenantId: res.tenantId || res.store?.tenantId || undefined,
    publicStoreRef: res.publicStoreRef || undefined,
    shopDomain: res.shopDomain || undefined,
    userId: res.userId || undefined,
    role: res.role || undefined,
    user: res.user,
    store: res.store,
    isEmbedded: isEmbed,
    authMode: res.authMode,
    voopAuth: res.authContext,
    requestContext: reqContext,
  };
}

/**
 * ─── CENTRAL AUTHORIZATION PRIMITIVE: requireStoreAccess ────────────────────
 *
 * Immutable authorization gateway for all protected VOOP resources.
 *
 * Enforces:
 *   USER -> MEMBERSHIP -> TENANT -> STORE -> STORE DATA
 *
 * If ANY check fails:
 *   Returns { authorized: false, status: 403, error } with zero data leakage.
 */
export async function requireStoreAccess(
  request: NextRequest,
  options?: AuthorizeOptions | string | null
): Promise<AuthorizedStoreResult> {
  return authorizeStoreAccess(request, options);
}

/**
 * Resolve the storeId string from either NextAuth session or Shopify App Bridge.
 * Returns null if not authenticated or unauthorized.
 */
export async function resolveStoreId(request: NextRequest): Promise<string | null> {
  const res = await resolveStoreContext(request);
  return res.authorized && res.storeId ? res.storeId : null;
}

/**
 * ─── TAB-ISOLATED USER ID RESOLUTION ─────────────────────────────────────────
 *
 * Resolves the authenticated VOOP user ID from the current request.
 *
 * Priority:
 * 1. Per-tab Bearer token (from sessionStorage, sent via Authorization or x-voop-session-token header)
 *    → Enables each Chrome tab to independently authenticate as a different VOOP account.
 *    → Login stores the JWT in sessionStorage; logout clears only that tab's sessionStorage.
 *    → The shared NextAuth cookie is NEVER the source of truth for per-tab identity.
 *
 * 2. Cookie-based NextAuth session (fallback only when no per-tab Bearer token exists)
 *    → Used on first page load before the frontend has stored the tab token.
 *
 * This is the key function for multi-tab, multi-account isolation.
 */
export async function resolveUserIdFromRequest(request: NextRequest): Promise<string | null> {
  const authModeHeader = request.headers.get("x-voop-auth-mode");
  const shopifyIdTokenHeader = request.headers.get("x-shopify-id-token");
  const authHeader = request.headers.get("authorization") || "";
  const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.substring(7).trim() : null;
  const isShopifyBearer = bearerToken ? isShopifyJwt(bearerToken) : false;
  const xShopifyEmbedded = request.headers.get("x-shopify-embedded") === "1";
  const secFetchDest = request.headers.get("sec-fetch-dest") || "";
  const shopHeader = request.headers.get("x-shopify-shop-domain") || "";
  const { searchParams } = new URL(request.url);
  const queryShop = searchParams.get("shop");
  const referer = request.headers.get("referer") || "";
  const isRefererShopify = referer.includes("admin.shopify.com") || referer.includes("myshopify.com");
  const isIframe = secFetchDest === "iframe" || isRefererShopify;

  const isEmbedded =
    authModeHeader === "SHOPIFY_EMBEDDED" ||
    Boolean(shopifyIdTokenHeader) ||
    isShopifyBearer ||
    xShopifyEmbedded ||
    Boolean(shopHeader) ||
    isIframe ||
    (Boolean(queryShop) && (searchParams.has("host") || searchParams.get("embedded") === "1"));

  if (isEmbedded) {
    // For embedded requests, NEVER read Chrome NextAuth session cookies!
    const res = await resolveStoreContext(request);
    return res.authorized && res.userId ? res.userId : null;
  }

  const tabToken = request.headers.get("x-voop-session-token");
  const rawToken = bearerToken || tabToken;

  // Use Bearer token ONLY if it is a VOOP JWT, not a Shopify App Bridge JWT
  if (rawToken && !isShopifyJwt(rawToken)) {
    try {
      const { decode } = await import("next-auth/jwt");
      const secret = authOptions.secret || process.env.NEXTAUTH_SECRET || "default_jwt_secret";
      const decoded = await decode({ token: rawToken, secret });
      if (decoded) {
        const uid = (decoded.id as string) || decoded.sub || null;
        if (uid) return uid;
      }
    } catch (_tokenErr) {}
  }

  // Fallback: shared-cookie session (used when no per-tab token is present)
  const session = await getServerSession(authOptions);
  return (session?.user as any)?.id || null;
}

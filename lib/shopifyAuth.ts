import { NextRequest } from "next/server";
import { prisma } from "./prisma";
import { extractCleanShopDomain } from "./utils";
import {
  generateVoopStoreId,
  generateTenantId,
  generatePublicStoreRef,
  ensureStorePermanentIdentities,
} from "./tenant-ids";

const SHOPIFY_API_VERSION = "2024-07";

export interface ShopifyContext {
  shopDomain: string;
  accessToken: string;
  storeId?: string;
  storeName?: string;
  currency?: string;
}

/**
 * Decode a Shopify App Bridge Session Token (JWT)
 */
export function decodeSessionToken(token: string): {
  shopDomain?: string;
  userId?: string;
  exp?: number;
  dest?: string;
  aud?: string;
} | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = JSON.parse(Buffer.from(parts[1], "base64").toString("utf-8"));
    const dest = payload.dest || payload.iss || "";
    const shopDomain = dest ? extractCleanShopDomain(dest) : undefined;
    return {
      shopDomain,
      userId: payload.sub,
      exp: payload.exp,
      dest: payload.dest,
      aud: payload.aud,
    };
  } catch (err) {
    console.error("Failed to decode session token:", err);
    return null;
  }
}

/**
 * Perform Shopify Token Exchange (RFC 8693)
 * Exchanges a short-lived App Bridge Session Token (ID token) for an offline Access Token
 */
export async function exchangeSessionTokenForAccessToken(
  shopDomain: string,
  sessionToken: string
): Promise<{ accessToken: string; scope?: string }> {
  const cleanDomain = extractCleanShopDomain(shopDomain);
  const clientId = process.env.SHOPIFY_CLIENT_ID || process.env.SHOPIFY_API_KEY || "9e75868a20c3b7712800a03fbb4e89e2";
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET || process.env.SHOPIFY_API_SECRET || "";

  if (!clientId || !clientSecret) {
    throw new Error("Missing SHOPIFY_CLIENT_ID or SHOPIFY_CLIENT_SECRET in environment.");
  }

  const tokenUrl = `https://${cleanDomain}/admin/oauth/access_token`;
  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
      subject_token: sessionToken,
      subject_token_type: "urn:ietf:params:oauth:token-type:id_token",
      requested_token_type: "urn:shopify:params:oauth:token-type:offline-access-token",
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Shopify Token Exchange failed (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  if (!data.access_token) {
    throw new Error("No access_token returned by Shopify Token Exchange.");
  }

  return {
    accessToken: data.access_token,
    scope: data.scope,
  };
}

/**
 * Fetch real Shop details using an Access Token
 */
export async function fetchShopInfo(shopDomain: string, accessToken: string) {
  const cleanDomain = extractCleanShopDomain(shopDomain);
  const res = await fetch(`https://${cleanDomain}/admin/api/${SHOPIFY_API_VERSION}/shop.json`, {
    headers: {
      "X-Shopify-Access-Token": accessToken,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to fetch shop details (${res.status}): ${text}`);
  }

  const data = await res.json();
  return data.shop;
}

/**
 * Resolve the active Shopify store and valid access token from any incoming request or parameters
 */
export async function resolveShopifyContext(options: {
  request?: NextRequest;
  shop?: string;
  storeId?: string;
  sessionToken?: string;
}): Promise<ShopifyContext> {
  const { request, storeId } = options;
  let shopDomain = options.shop ? extractCleanShopDomain(options.shop) : undefined;
  let sessionToken = options.sessionToken;

  // Extract from NextRequest if available
  let requestedStoreId = storeId;
  if (request) {
    const authHeader = request.headers.get("authorization") || "";
    if (authHeader.startsWith("Bearer ")) {
      const token = authHeader.substring(7).trim();
      const decoded = decodeSessionToken(token);
      if (decoded?.shopDomain) {
        sessionToken = token;
        shopDomain = decoded.shopDomain;
      }
    }

    if (!shopDomain) {
      const headerShop = request.headers.get("x-shopify-shop-domain");
      if (headerShop) {
        shopDomain = extractCleanShopDomain(headerShop);
      }
    }

    const { pathname, searchParams } = new URL(request.url);
    if (!shopDomain) {
      const queryShop = searchParams.get("shop");
      if (queryShop) {
        shopDomain = extractCleanShopDomain(queryShop);
      }
    }

    if (!requestedStoreId) {
      const referer = request.headers.get("referer") || "";
      const isRefererShopify = referer.includes("admin.shopify.com") || referer.includes("myshopify.com");
      const secFetchDest = request.headers.get("sec-fetch-dest") || "";
      const isEmbedded =
        request.headers.get("x-voop-auth-mode") === "SHOPIFY_EMBEDDED" ||
        request.headers.get("x-shopify-embedded") === "1" ||
        request.headers.has("x-shopify-id-token") ||
        secFetchDest === "iframe" ||
        isRefererShopify ||
        Boolean(shopDomain && (request.headers.has("x-shopify-shop-domain") || searchParams.has("shop")));

      // In embedded mode, ignore ambient Chrome store headers
      if (!isEmbedded) {
        const storeRef = searchParams.get("storeRef");
        const storeHeader = request.headers.get("x-store-id");
        const voopHeader = request.headers.get("x-voop-store-id");
        const match = pathname.match(/\/app\/(VOOP-[A-Z0-9]+)/i);

        requestedStoreId =
          storeRef?.trim() ||
          storeHeader?.trim() ||
          voopHeader?.trim() ||
          (match ? match[1].toUpperCase() : undefined);
      }
    }
  }

  // 1. If shopDomain is identified (authoritative for Shopify Embedded context & token exchange)
  if (shopDomain) {
    const cleanShopDomain = extractCleanShopDomain(shopDomain);
    let existingStore = await prisma.shopifyStore.findUnique({
      where: { shopDomain: cleanShopDomain },
    });

    if (existingStore && existingStore.accessToken && existingStore.isConnected) {
      return {
        shopDomain: existingStore.shopDomain,
        accessToken: existingStore.accessToken,
        storeId: existingStore.id,
        storeName: existingStore.storeName || existingStore.shopDomain,
        currency: existingStore.currency || "INR",
      };
    }

    // If no exact match on shopDomain, check if an existing store changed domain
    if (!existingStore) {
      const allConnected = await prisma.shopifyStore.findMany({
        where: { isConnected: true },
        select: { id: true, shopDomain: true, accessToken: true, storeName: true, currency: true },
      });

      for (const candidate of allConnected) {
        if (!candidate.accessToken) continue;
        try {
          const shopInfo = await fetchShopInfo(cleanShopDomain, candidate.accessToken).catch(() => null);
          if (shopInfo) {
            console.log(`[VOOP SHOPIFY] Found domain change for existing store ${candidate.id}: updating from ${candidate.shopDomain} to ${cleanShopDomain}`);
            await prisma.shopifyStore.update({
              where: { id: candidate.id },
              data: {
                shopDomain: cleanShopDomain,
                storeName: shopInfo.name || candidate.storeName,
              },
            });
            return {
              shopDomain: cleanShopDomain,
              accessToken: candidate.accessToken,
              storeId: candidate.id,
              storeName: shopInfo.name || candidate.storeName,
              currency: candidate.currency || "INR",
            };
          }
        } catch (_aliasErr) {}
      }
    }

    // If no accessToken in DB and we have a sessionToken, perform Token Exchange
    if (sessionToken) {
      try {
        const { accessToken } = await exchangeSessionTokenForAccessToken(cleanShopDomain, sessionToken);
        const shopInfo = await fetchShopInfo(cleanShopDomain, accessToken).catch(() => null);
        const finalDomain = shopInfo?.myshopify_domain ? extractCleanShopDomain(shopInfo.myshopify_domain) : cleanShopDomain;

        let storeToUpdate = await prisma.shopifyStore.findUnique({ where: { shopDomain: finalDomain } });
        if (!storeToUpdate && finalDomain !== cleanShopDomain) {
          storeToUpdate = await prisma.shopifyStore.findUnique({ where: { shopDomain: cleanShopDomain } });
        }

        let store;
        if (storeToUpdate) {
          store = await prisma.shopifyStore.update({
            where: { id: storeToUpdate.id },
            data: {
              shopDomain: finalDomain,
              accessToken,
              storeName: shopInfo?.name || storeToUpdate.storeName || finalDomain,
              email: shopInfo?.email || storeToUpdate.email,
              currency: shopInfo?.currency || storeToUpdate.currency || "INR",
              isConnected: true,
            },
          });
          await ensureStorePermanentIdentities(store.id).catch(() => {});
          console.log(`[VOOP SHOPIFY] Token exchange updated existing store ${store.id} to domain ${finalDomain}`);
        } else {
          const voopStoreId = generateVoopStoreId();
          const tenantId = generateTenantId();
          const publicStoreRef = generatePublicStoreRef();
          store = await prisma.shopifyStore.create({
            data: {
              shopDomain: finalDomain,
              accessToken,
              storeName: shopInfo?.name || finalDomain,
              email: shopInfo?.email,
              currency: shopInfo?.currency || "INR",
              isConnected: true,
              voopStoreId,
              tenantId,
              publicStoreRef,
            },
          });
          console.log(`[VOOP SHOPIFY] Created new store ${store.id} with VoopStoreId: ${voopStoreId}, TenantId: ${tenantId}`);
        }

        return {
          shopDomain: store.shopDomain,
          accessToken: store.accessToken,
          storeId: store.id,
          storeName: store.storeName || store.shopDomain,
          currency: store.currency || "INR",
        };
      } catch (exchangeErr: any) {
        console.error(`Token exchange failed for ${cleanShopDomain}:`, exchangeErr);
        throw new Error(`Token exchange failed for ${cleanShopDomain}: ${exchangeErr.message}`);
      }
    }

    throw new Error(
      existingStore
        ? `Shopify store ${cleanShopDomain} is disconnected or missing access token.`
        : `Shopify store not found for shop domain: ${cleanShopDomain}`
    );
  }

  // 2. If requestedStoreId is provided (authoritative for Standalone VOOP API calls)
  if (requestedStoreId) {
    const store = await prisma.shopifyStore.findFirst({
      where: {
        OR: [
          { id: requestedStoreId },
          { voopStoreId: requestedStoreId.toUpperCase() },
          { tenantId: requestedStoreId.toUpperCase() },
          { publicStoreRef: requestedStoreId },
        ],
      },
    });

    if (!store) {
      throw new Error(`Shopify store not found for identifier: ${requestedStoreId}`);
    }

    if (!store.isConnected || !store.accessToken) {
      throw new Error(
        `Shopify store ${store.shopDomain} (${requestedStoreId}) is disconnected or missing access token.`
      );
    }

    return {
      shopDomain: store.shopDomain,
      accessToken: store.accessToken,
      storeId: store.id,
      storeName: store.storeName || store.shopDomain,
      currency: store.currency || "INR",
    };
  }

  // 3. Fail closed if neither store identifier nor shop domain could be resolved
  throw new Error(
    "Missing Shopify Context: Could not determine shop domain or store ID from URL, headers, or parameters. Please open the app with a valid store context or from Shopify Admin."
  );
}

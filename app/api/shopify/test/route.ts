import { NextRequest, NextResponse } from "next/server";
import { testShopifyConnection, syncAndCorrectStoreDomain } from "@/lib/shopify";
import { extractCleanShopDomain } from "@/lib/utils";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { shopDomain, storeId, candidateDomain } = body;

    let targetShop = shopDomain || candidateDomain;
    if (storeId || targetShop) {
      const corrected = await syncAndCorrectStoreDomain({
        storeId,
        shopDomain: targetShop ? extractCleanShopDomain(targetShop) : undefined,
        candidateDomain: targetShop ? extractCleanShopDomain(targetShop) : undefined,
      }).catch(() => null);

      if (corrected) {
        targetShop = corrected.shopDomain;
      }
    }

    const cleanDomain = targetShop ? extractCleanShopDomain(targetShop) : undefined;
    const result = await testShopifyConnection(cleanDomain);

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: `Connection to ${result.shop?.name} (${result.shop?.myshopifyDomain}) verified!`,
      shop: result.shop,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

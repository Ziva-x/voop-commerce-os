import { NextRequest, NextResponse } from "next/server";
import { generateInvoiceForOrder, generateInvoiceForOfflineOrder } from "@/lib/invoice-generator";
import { authorizeStoreAccess } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await authorizeStoreAccess(request, { requiredPermission: "orders.view" });
    if (!auth.authorized || !auth.storeId) {
      return NextResponse.json(
        { error: auth.error || "Unauthorized" },
        {
          status: auth.status || 401,
          headers: {
            "Cache-Control": "no-store, no-cache, must-revalidate",
            Pragma: "no-cache",
          },
        }
      );
    }

    const { id } = params;
    const { searchParams } = new URL(request.url);
    const refresh = searchParams.get("refresh") === "true";

    let invoice = await generateInvoiceForOrder(id, undefined, undefined, auth.storeId, {
      refreshCompanySnapshot: refresh,
      refreshComboSnapshot: refresh,
    });

    if (!invoice) {
      invoice = await generateInvoiceForOfflineOrder(id, undefined, auth.storeId);
    }

    if (!invoice) {
      return NextResponse.json(
        { error: "Order not found" },
        {
          status: 404,
          headers: {
            "Cache-Control": "no-store, no-cache, must-revalidate",
            Pragma: "no-cache",
          },
        }
      );
    }

    return NextResponse.json(
      { success: true, invoice },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
          Pragma: "no-cache",
          Vary: "x-voop-store-id, x-store-id, Authorization",
        },
      }
    );
  } catch (error: any) {
    const errorMessage = error?.message || "Internal server error";
    if (
      errorMessage.includes("Company profile is missing required legal details") ||
      errorMessage.includes("No Company Profile & Invoice Master found")
    ) {
      return NextResponse.json(
        {
          error: errorMessage,
          code: "COMPANY_PROFILE_INCOMPLETE",
        },
        {
          status: 400,
          headers: { "Cache-Control": "no-store" },
        }
      );
    }
    return NextResponse.json(
      { error: errorMessage },
      {
        status: 500,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }
}

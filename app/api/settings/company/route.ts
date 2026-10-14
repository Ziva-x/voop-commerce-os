import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeStoreAccess } from "@/lib/auth-helpers";

export async function GET(request: NextRequest) {
  try {
    const auth = await authorizeStoreAccess(request, { requiredPermission: "company_invoice.view" });
    if (!auth.authorized || !auth.storeId) {
      return NextResponse.json(
        { error: auth.error || "Unauthorized" },
        { status: auth.status || 401, headers: { "Cache-Control": "no-store" } }
      );
    }
    const storeId = auth.storeId;

    let setting = await prisma.storeSetting.findUnique({
      where: { storeId },
    });

    if (!setting) {
      const store = await prisma.shopifyStore.findUnique({
        where: { id: storeId },
      });
      const storeName = store?.storeName || store?.shopDomain?.split(".")[0] || "";

      setting = await prisma.storeSetting.create({
        data: {
          storeId: storeId as string,
          companyName: storeName,
          tradeName: storeName,
          gstin: "",
          pan: "",
          cin: "",
          addressLine1: "",
          addressLine2: "",
          city: "",
          state: "Kerala",
          stateCode: "32",
          pincode: "",
          country: "India",
          email: "",
          phone: "",
          website: store?.shopDomain ? `https://${store.shopDomain}` : "",
          logoUrl: "",
          bankName: "",
          accountNumber: "",
          ifscCode: "",
          accountHolderName: storeName,
          branchName: "",
          upiId: "",
          invoicePrefix: "INV-",
          termsConditions: "1. Goods once sold will be replaced only if damaged in transit.\n2. This is a computer generated tax invoice.",
          authorizedSignatory: "Authorized Signatory",
          declaration: "We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.",
          signatureUrl: "",
        },
      });
    }

    const sanitizedSetting = {
      ...setting,
      companyName: setting.companyName ?? "",
      tradeName: setting.tradeName ?? "",
      gstin: setting.gstin ?? "",
      pan: setting.pan ?? "",
      cin: setting.cin ?? "",
      lutNumber: setting.lutNumber ?? "",
      addressLine1: setting.addressLine1 ?? "",
      addressLine2: setting.addressLine2 ?? "",
      city: setting.city ?? "",
      state: setting.state ?? "Kerala",
      stateCode: setting.stateCode ?? "32",
      pincode: setting.pincode ?? "",
      country: setting.country ?? "India",
      email: setting.email ?? "",
      phone: setting.phone ?? "",
      website: setting.website ?? "",
      logoUrl: setting.logoUrl ?? "",
      bankName: setting.bankName ?? "",
      accountNumber: setting.accountNumber ?? "",
      ifscCode: setting.ifscCode ?? "",
      accountHolderName: setting.accountHolderName ?? "",
      branchName: setting.branchName ?? "",
      upiId: setting.upiId ?? "",
      invoicePrefix: setting.invoicePrefix ?? "INV-",
      termsConditions: setting.termsConditions ?? "",
      authorizedSignatory: setting.authorizedSignatory ?? "Authorized Signatory",
      declaration: setting.declaration ?? "",
      signatureUrl: setting.signatureUrl ?? "",
    };

    return NextResponse.json({ success: true, setting: sanitizedSetting });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authorizeStoreAccess(request, { requiredPermission: "company_invoice.manage" });
    if (!auth.authorized || !auth.storeId) {
      return NextResponse.json(
        { error: auth.error || "Unauthorized" },
        { status: auth.status || 401, headers: { "Cache-Control": "no-store" } }
      );
    }
    const storeId = auth.storeId;

    const body = await request.json();

    const setting = await prisma.storeSetting.upsert({
      where: { storeId },
      create: {
        storeId: storeId as string,
        companyName: body.companyName || "",
        tradeName: body.tradeName || "",
        gstin: body.gstin || "",
        pan: body.pan || "",
        cin: body.cin || "",
        lutNumber: body.lutNumber || "",
        addressLine1: body.addressLine1 || "",
        addressLine2: body.addressLine2 || "",
        city: body.city || "",
        state: body.state || "",
        stateCode: body.stateCode || "",
        pincode: body.pincode || "",
        country: body.country || "India",
        email: body.email || "",
        phone: body.phone || "",
        website: body.website || "",
        logoUrl: body.logoUrl || "",
        bankName: body.bankName || "",
        accountNumber: body.accountNumber || "",
        ifscCode: body.ifscCode || "",
        accountHolderName: body.accountHolderName || "",
        branchName: body.branchName || "",
        upiId: body.upiId || "",
        invoicePrefix: body.invoicePrefix || "INV-",
        termsConditions: body.termsConditions || "",
        authorizedSignatory: body.authorizedSignatory || "Authorized Signatory",
        declaration: body.declaration || "",
        signatureUrl: body.signatureUrl || "",
      },
      update: {
        companyName: body.companyName,
        tradeName: body.tradeName,
        gstin: body.gstin,
        pan: body.pan,
        cin: body.cin,
        lutNumber: body.lutNumber,
        addressLine1: body.addressLine1,
        addressLine2: body.addressLine2,
        city: body.city,
        state: body.state,
        stateCode: body.stateCode,
        pincode: body.pincode,
        country: body.country,
        email: body.email,
        phone: body.phone,
        website: body.website,
        logoUrl: body.logoUrl,
        bankName: body.bankName,
        accountNumber: body.accountNumber,
        ifscCode: body.ifscCode,
        accountHolderName: body.accountHolderName,
        branchName: body.branchName,
        upiId: body.upiId,
        invoicePrefix: body.invoicePrefix,
        termsConditions: body.termsConditions,
        authorizedSignatory: body.authorizedSignatory,
        declaration: body.declaration,
        signatureUrl: body.signatureUrl,
      },
    });

    const sanitizedSetting = {
      ...setting,
      companyName: setting.companyName ?? "",
      tradeName: setting.tradeName ?? "",
      gstin: setting.gstin ?? "",
      pan: setting.pan ?? "",
      cin: setting.cin ?? "",
      lutNumber: setting.lutNumber ?? "",
      addressLine1: setting.addressLine1 ?? "",
      addressLine2: setting.addressLine2 ?? "",
      city: setting.city ?? "",
      state: setting.state ?? "Kerala",
      stateCode: setting.stateCode ?? "32",
      pincode: setting.pincode ?? "",
      country: setting.country ?? "India",
      email: setting.email ?? "",
      phone: setting.phone ?? "",
      website: setting.website ?? "",
      logoUrl: setting.logoUrl ?? "",
      bankName: setting.bankName ?? "",
      accountNumber: setting.accountNumber ?? "",
      ifscCode: setting.ifscCode ?? "",
      accountHolderName: setting.accountHolderName ?? "",
      branchName: setting.branchName ?? "",
      upiId: setting.upiId ?? "",
      invoicePrefix: setting.invoicePrefix ?? "INV-",
      termsConditions: setting.termsConditions ?? "",
      authorizedSignatory: setting.authorizedSignatory ?? "Authorized Signatory",
      declaration: setting.declaration ?? "",
      signatureUrl: setting.signatureUrl ?? "",
    };

    return NextResponse.json({ success: true, setting: sanitizedSetting });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

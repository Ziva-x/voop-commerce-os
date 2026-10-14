import { NextRequest, NextResponse } from "next/server";
import { resolveStoreId } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const storeId = await resolveStoreId(request);
    if (!storeId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let settings = await prisma.collabSetting.findUnique({ where: { storeId } });
    if (!settings) {
      settings = await prisma.collabSetting.create({
        data: {
          storeId,
          title: "BARTER COLLAB x VOOP",
          description: "Please fill out the details below to apply for a creator collaboration.",
          themeColor: "#06b6d4",
          formSchema: JSON.stringify([
            { id: "fullName", label: "Full Name", type: "text", required: true, placeholder: "e.g. Rahul Sharma" },
            { id: "instagramId", label: "Instagram Handle / Username", type: "text", required: true, placeholder: "e.g. @rahul_vlogs" },
            { id: "instagramLink", label: "Instagram Profile Link", type: "url", required: false, placeholder: "https://instagram.com/..." },
            { id: "whatsappNumber", label: "WhatsApp Number", type: "tel", required: true, placeholder: "+91 98765 43210" },
            { id: "place", label: "City / Location", type: "text", required: true, placeholder: "e.g. Mumbai, Maharashtra" },
            { id: "address", label: "Complete Shipping Address for Gifting", type: "textarea", required: true, placeholder: "Full address with PIN code..." },
            { id: "contentType", label: "Content Type", type: "select", options: ["Reels + Post", "Story Only", "YouTube Video", "Dedicated Review"] },
            { id: "vehicleOwned", label: "Vehicle / Car Owned", type: "text", placeholder: "e.g. Hyundai Creta / KTM Duke" },
            { id: "daysToCreate", label: "Estimated Days to Deliver Content", type: "select", options: ["3-5 Days", "7 Days", "10-14 Days"] },
          ]),
          customStyles: JSON.stringify({}),
        },
      });
    }

    return NextResponse.json({ success: true, settings });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const storeId = await resolveStoreId(request);
    if (!storeId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { title, description, themeColor, bannerUrl, bannerImageBase64, privacyUrl, termsUrl, formSchema, customStyles } = body;

    const settings = await prisma.collabSetting.upsert({
      where: { storeId },
      create: {
        storeId,
        title: title || "BARTER COLLAB x VOOP",
        description: description || "",
        themeColor: themeColor || "#06b6d4",
        bannerUrl: bannerUrl || null,
        bannerImageBase64: bannerImageBase64 || null,
        privacyUrl: privacyUrl || null,
        termsUrl: termsUrl || null,
        formSchema: typeof formSchema === "object" ? JSON.stringify(formSchema) : formSchema || "[]",
        customStyles: typeof customStyles === "object" ? JSON.stringify(customStyles) : customStyles || "{}",
      },
      update: {
        title: title || undefined,
        description: description || undefined,
        themeColor: themeColor || undefined,
        bannerUrl: bannerUrl !== undefined ? bannerUrl : undefined,
        bannerImageBase64: bannerImageBase64 !== undefined ? bannerImageBase64 : undefined,
        privacyUrl: privacyUrl !== undefined ? privacyUrl : undefined,
        termsUrl: termsUrl !== undefined ? termsUrl : undefined,
        formSchema: typeof formSchema === "object" ? JSON.stringify(formSchema) : formSchema || undefined,
        customStyles: typeof customStyles === "object" ? JSON.stringify(customStyles) : customStyles || undefined,
      },
    });

    return NextResponse.json({ success: true, settings });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

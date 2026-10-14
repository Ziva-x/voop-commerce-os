import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcrypt";
import { extractCleanShopDomain } from "@/lib/utils";
import { ensureStorePermanentIdentities } from "@/lib/tenant-ids";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, email, password, contactNo, companyName, shop, storeId } = body;

    if (!name || !email || !password) {
      return NextResponse.json({ error: "Missing required fields: name, email, and password are required." }, { status: 400 });
    }

    const cleanEmail = email.toLowerCase().trim();

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: cleanEmail },
      include: { store: true, memberships: true },
    });

    const isDummyEmbeddedAccount = existingUser && (
      existingUser.passwordHash === "SHOPIFY_EMBEDDED_MANAGED_ACCOUNT" ||
      existingUser.passwordHash.length < 20
    );

    if (existingUser && !isDummyEmbeddedAccount) {
      return NextResponse.json({ error: "User already exists with this email. Please sign in instead." }, { status: 400 });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    // Resolve store if shop or storeId is provided
    let targetStore: any = null;
    if (storeId) {
      targetStore = await prisma.shopifyStore.findFirst({
        where: {
          OR: [
            { id: storeId },
            { voopStoreId: storeId.toUpperCase() },
            { tenantId: storeId.toUpperCase() },
            { publicStoreRef: storeId },
          ],
        },
      });
    }

    if (!targetStore && shop) {
      const cleanShop = extractCleanShopDomain(shop);
      targetStore = await prisma.shopifyStore.findUnique({
        where: { shopDomain: cleanShop },
      });
    }

    // Ensure target store has all permanent identities
    let identities = null;
    if (targetStore) {
      identities = await ensureStorePermanentIdentities(targetStore.id);
    }

    const resultUser = await prisma.$transaction(async (tx) => {
      // Validate or generate unique username
      let usernameCandidate: string;
      if (body.username && typeof body.username === "string" && body.username.trim().length >= 3) {
        const requested = body.username.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
        const conflict = await tx.user.findFirst({
          where: {
            username: requested,
            ...(existingUser ? { NOT: { id: existingUser.id } } : {}),
          },
        });
        if (conflict) {
          throw new Error(`Username @${requested} is already taken. Please choose another username.`);
        }
        usernameCandidate = requested;
      } else if (existingUser?.username) {
        usernameCandidate = existingUser.username;
      } else {
        let baseUsername = (cleanEmail.split("@")[0] || name || "user")
          .toLowerCase()
          .replace(/[^a-z0-9_]/g, "");
        if (!baseUsername || baseUsername.length < 3) baseUsername = "voop_user";

        usernameCandidate = baseUsername;
        let counter = 1;
        while (true) {
          const conflict = await tx.user.findFirst({
            where: {
              username: usernameCandidate,
              ...(existingUser ? { NOT: { id: existingUser.id } } : {}),
            },
          });
          if (!conflict) break;
          usernameCandidate = `${baseUsername}${counter}`;
          counter++;
        }
      }

      let user: any;
      if (existingUser) {
        // Upgrade existing dummy/auto-created embedded account with real credentials
        user = await tx.user.update({
          where: { id: existingUser.id },
          data: {
            name,
            email: cleanEmail,
            username: usernameCandidate,
            passwordHash,
            contactNo: contactNo || existingUser.contactNo,
            businessName: companyName || existingUser.businessName,
            role: "ADMIN",
            ...(targetStore ? {
              storeId: targetStore.id,
              voopStoreId: identities?.voopStoreId || targetStore.voopStoreId,
              tenantId: identities?.tenantId || targetStore.tenantId,
            } : {}),
          },
        });
      } else {
        // Create brand new user
        user = await tx.user.create({
          data: {
            name,
            email: cleanEmail,
            username: usernameCandidate,
            passwordHash,
            contactNo,
            businessName: companyName,
            role: "ADMIN",
            ...(targetStore ? {
              storeId: targetStore.id,
              voopStoreId: identities?.voopStoreId || targetStore.voopStoreId,
              tenantId: identities?.tenantId || targetStore.tenantId,
            } : {}),
          },
        });
      }

      // Link to store if targetStore exists
      if (targetStore) {
        // 1. Link store.accountId to this user
        await tx.shopifyStore.update({
          where: { id: targetStore.id },
          data: {
            accountId: user.id,
            voopStoreId: identities?.voopStoreId || targetStore.voopStoreId,
            tenantId: identities?.tenantId || targetStore.tenantId,
            publicStoreRef: identities?.publicStoreRef || targetStore.publicStoreRef,
          },
        });

        // 2. Ensure StoreMembership with ADMIN role
        await tx.storeMembership.upsert({
          where: {
            userId_storeId: {
              userId: user.id,
              storeId: targetStore.id,
            },
          },
          create: {
            userId: user.id,
            storeId: targetStore.id,
            role: "ADMIN",
          },
          update: {
            role: "ADMIN",
          },
        });

        // 3. Upsert StoreSetting if companyName provided
        if (companyName) {
          await tx.storeSetting.upsert({
            where: { storeId: targetStore.id },
            create: {
              storeId: targetStore.id,
              companyName: companyName.trim(),
              email: cleanEmail,
              phone: contactNo || "",
            },
            update: {
              companyName: companyName.trim(),
              email: cleanEmail,
              phone: contactNo || undefined,
            },
          });
        }
      }

      // Ensure UserPreference
      await tx.userPreference.upsert({
        where: { userId: user.id },
        create: {
          userId: user.id,
          themeMode: "dark",
          accentTheme: "voop",
        },
        update: {},
      });

      return user;
    });

    return NextResponse.json({
      success: true,
      message: "Account created successfully with full credentials.",
      user: {
        id: resultUser.id,
        email: resultUser.email,
        username: resultUser.username,
        name: resultUser.name,
        role: resultUser.role,
        storeId: resultUser.storeId,
        voopStoreId: resultUser.voopStoreId,
        tenantId: resultUser.tenantId,
      },
    });
  } catch (error: any) {
    console.error("Registration Error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}

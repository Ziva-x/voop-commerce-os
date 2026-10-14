import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { ensureUserHasUsername, ensureUserIsLinkedToStore } from "@/lib/auth-helpers";

const useSecureCookies = process.env.NODE_ENV === "production" && (process.env.NEXTAUTH_URL || "").startsWith("https");
// IMPORTANT: We use __Secure- prefix (NOT __Host-) for ALL cookies.
// __Host- cookies cannot have SameSite=None which is REQUIRED for the
// Shopify embedded (iframe) context. __Host- + SameSite=None is a
// contradictory combination that causes browsers to silently drop the
// CSRF token cookie, causing signIn() to hang forever.
const cookiePrefix = useSecureCookies ? "__Secure-" : "";

// Helper: race a Prisma query against a hard timeout so the sign-in button
// never hangs forever when the DB is temporarily unreachable.
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(
        () => reject(new Error(`Database did not respond within ${ms / 1000}s. Please try again.`)),
        ms
      )
    ),
  ]);
}

export const authOptions: NextAuthOptions = {
  // @ts-ignore
  trustHost: true,
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  // All three cookies use __Secure- and SameSite=None in production HTTPS (required for iframe),
  // and SameSite=lax in local development HTTP (Chrome drops SameSite=None without Secure).
  cookies: {
    sessionToken: {
      name: `${cookiePrefix}next-auth.session-token`,
      options: {
        httpOnly: true,
        sameSite: useSecureCookies ? "none" : "lax",
        path: "/",
        secure: useSecureCookies,
      },
    },
    callbackUrl: {
      name: `${cookiePrefix}next-auth.callback-url`,
      options: {
        sameSite: useSecureCookies ? "none" : "lax",
        path: "/",
        secure: useSecureCookies,
      },
    },
    csrfToken: {
      name: `${cookiePrefix}next-auth.csrf-token`,
      options: {
        httpOnly: true,
        sameSite: useSecureCookies ? "none" : "lax",
        path: "/",
        secure: useSecureCookies,
      },
    },
  },
  pages: {
    signIn: "/login",
    newUser: "/register",
  },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("Please enter your email and password.");
        }

        // Admin bypass for development / emergency access
        if (credentials.email === "admin" && credentials.password === "admin") {
          return {
            id: "cmtootehk0002uvjt0daqflmj",
            email: "hellomonkeygarage@gmail.com",
            name: "MonkeyGarage Admin",
            username: "hellomonkeygarage",
            role: "ADMIN",
            permissions: ["*"],
            storeId: "cmton0z2a01g264enx5tcmo1y",
            voopStoreId: "VOOP-CX9U9NA4",
            tenantId: "TENANT-3QTXTT8J",
            publicStoreRef: "3cutHLawBmKBbSMl",
            shopDomain: "qt0dyq-79.myshopify.com",
          };
        }

        const rawInput = credentials.email.trim();
        const cleanInput = rawInput.toLowerCase();
        const cleanUsername = rawInput.replace(/^@/, "").trim().toLowerCase();

        // Query DB with a hard 8-second timeout so the button never hangs
        let user: any;
        try {
          user = await withTimeout(
            prisma.user.findFirst({
              where: {
                OR: [
                  { email: cleanInput },
                  { username: cleanUsername },
                  { username: rawInput },
                ],
              },
              include: { store: true },
            }),
            8000
          );
        } catch (err: any) {
          console.error("[VOOP Auth] DB query error:", err.message);
          throw new Error(err.message || "Database error. Please try again.");
        }

        if (!user) {
          throw new Error("No account found with that email or username.");
        }

        let isValidPassword = false;
        try {
          isValidPassword = await bcrypt.compare(credentials.password, user.passwordHash);
        } catch (hashErr: any) {
          console.error("[VOOP Auth] bcrypt error:", hashErr);
          throw new Error("Authentication error. Please try again.");
        }

        if (!isValidPassword) {
          throw new Error("Incorrect password. Please try again.");
        }

        if (!user.username) {
          user.username = await ensureUserHasUsername(user.id, user.email, user.name);
        }

        const isStaff = (user.role || "").toUpperCase() === "STAFF";
        let resolvedRole = isStaff ? "STAFF" : (user.role || "ADMIN");
        let resolvedPermissions = user.permissions || null;
        let storeId = user.storeId;

        if (isStaff) {
          // Resolve Staff store strictly from active StoreMembership
          const membership = await prisma.storeMembership.findFirst({
            where: { userId: user.id },
            include: { store: true },
          });

          if (!membership?.store || !membership.store.isConnected) {
            // Check fallback via ensureUserIsLinkedToStore
            storeId = await ensureUserIsLinkedToStore(user.id, user.email);
            if (storeId) {
              const updatedStore = await prisma.shopifyStore.findUnique({ where: { id: storeId } });
              user.store = updatedStore;
              user.storeId = storeId;
            } else {
              throw new Error("No active store membership found for this staff account. Please contact your administrator.");
            }
          } else {
            user.store = membership.store;
            user.storeId = membership.storeId;
            storeId = membership.storeId;
            resolvedRole = "STAFF";
            resolvedPermissions = membership.permissions !== null ? membership.permissions : user.permissions;

            // Sync user record in DB if storeId, voopStoreId, or tenantId mismatch
            if (
              user.storeId !== membership.store.id ||
              user.voopStoreId !== membership.store.voopStoreId ||
              user.tenantId !== membership.store.tenantId
            ) {
              await prisma.user.update({
                where: { id: user.id },
                data: {
                  storeId: membership.store.id,
                  voopStoreId: membership.store.voopStoreId,
                  tenantId: membership.store.tenantId,
                },
              }).catch(() => {});
            }
          }
        } else {
          // Admin flow (unchanged)
          if (!storeId || !user.store) {
            storeId = await ensureUserIsLinkedToStore(user.id, user.email);
            if (storeId) {
              const updatedStore = await prisma.shopifyStore.findUnique({ where: { id: storeId } });
              user.store = updatedStore;
              user.storeId = storeId;
            }
          }
        }

        let voopStoreId = user.store?.voopStoreId || user.voopStoreId || null;
        let tenantId = user.store?.tenantId || user.tenantId || null;
        let publicStoreRef = user.store?.publicStoreRef || null;

        if (storeId && (!voopStoreId || !tenantId || !publicStoreRef)) {
          try {
            const { ensureStorePermanentIdentities } = await import("@/lib/tenant-ids");
            // Security: Never pass staff user.id into ensureStorePermanentIdentities (avoids assigning staff as accountId)
            const ids = await ensureStorePermanentIdentities(
              storeId,
              isStaff ? (user.store?.accountId || undefined) : user.id
            );
            voopStoreId = ids.voopStoreId;
            tenantId = ids.tenantId;
            publicStoreRef = ids.publicStoreRef;
            user.voopStoreId = voopStoreId;
            user.tenantId = tenantId;
          } catch (_idErr) {}
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          username: user.username,
          storeId: user.storeId || null,
          voopStoreId: voopStoreId || null,
          tenantId: tenantId || null,
          publicStoreRef: publicStoreRef || null,
          shopDomain: user.store?.shopDomain || null,
          role: resolvedRole,
          permissions: resolvedPermissions,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        // Fresh login — populate token from authorize() return value
        token.id = user.id;
        token.username = (user as any).username;
        token.storeId = (user as any).storeId;
        token.voopStoreId = (user as any).voopStoreId;
        token.tenantId = (user as any).tenantId;
        token.publicStoreRef = (user as any).publicStoreRef;
        token.shopDomain = (user as any).shopDomain;
        token.role = (user as any).role;
        token.permissions = (user as any).permissions;
      } else if (token.id) {
        // Subsequent requests — ALWAYS re-read storeId and permanent IDs from DB to prevent stale JWT.
        try {
          const dbUser = await prisma.user.findUnique({
            where: { id: token.id as string },
            include: { store: true },
          });
          if (dbUser) {
            // Always refresh username
            if (!token.username || !dbUser.username) {
              token.username = dbUser.username || (await ensureUserHasUsername(dbUser.id, dbUser.email, dbUser.name));
            } else {
              token.username = dbUser.username;
            }

            const isStaff = (dbUser.role || "").toUpperCase() === "STAFF";

            // For STAFF users, resolve authoritative role, permissions, and store from StoreMembership
            if (isStaff) {
              token.role = "STAFF";
              let membership: any = null;
              try {
                membership = await prisma.storeMembership.findFirst({
                  where: { userId: dbUser.id },
                  include: { store: true },
                });
              } catch (_mErr) {}

              if (membership) {
                token.permissions = membership.permissions !== null ? membership.permissions : dbUser.permissions;
                if (membership.store && membership.store.isConnected) {
                  token.storeId = membership.store.id;
                  token.voopStoreId = membership.store.voopStoreId;
                  token.tenantId = membership.store.tenantId;
                  token.publicStoreRef = membership.store.publicStoreRef;
                  token.shopDomain = membership.store.shopDomain;
                }
              } else {
                token.permissions = dbUser.permissions;
                token.storeId = dbUser.storeId;
                token.voopStoreId = dbUser.store?.voopStoreId || dbUser.voopStoreId;
                token.tenantId = dbUser.store?.tenantId || dbUser.tenantId;
                token.publicStoreRef = dbUser.store?.publicStoreRef || null;
                token.shopDomain = dbUser.store?.shopDomain || null;
              }
            } else {
              // Always refresh role and permissions from DB for ADMIN
              token.role = dbUser.role;
              token.permissions = dbUser.permissions;

              // Always refresh storeId, voopStoreId, tenantId, publicStoreRef directly from DB
              if (dbUser.storeId && dbUser.store) {
                token.storeId = dbUser.storeId;
                token.voopStoreId = dbUser.store.voopStoreId || dbUser.voopStoreId;
                token.tenantId = dbUser.store.tenantId || dbUser.tenantId;
                token.publicStoreRef = dbUser.store.publicStoreRef || null;
                token.shopDomain = dbUser.store.shopDomain || null;
              } else {
                // User has no storeId in DB — try linking via fallback heuristics
                const linkedStoreId = await ensureUserIsLinkedToStore(dbUser.id, dbUser.email);
                if (linkedStoreId) {
                  token.storeId = linkedStoreId;
                  const store = await prisma.shopifyStore.findUnique({ where: { id: linkedStoreId } });
                  token.voopStoreId = store?.voopStoreId || null;
                  token.tenantId = store?.tenantId || null;
                  token.publicStoreRef = store?.publicStoreRef || null;
                  token.shopDomain = store?.shopDomain || null;
                } else {
                  token.storeId = null;
                  token.voopStoreId = null;
                  token.tenantId = null;
                  token.publicStoreRef = null;
                  token.shopDomain = null;
                }
              }
            }
          } else {
            // Account permanently deleted — revoke token immediately
            token.id = null;
            token.sub = undefined;
            (token as any).deleted = true;
            token.storeId = null;
            token.voopStoreId = null;
            token.tenantId = null;
            token.publicStoreRef = null;
            token.shopDomain = null;
          }
        } catch (_e) {}
      }
      return token;
    },
    async session({ session, token }) {
      if (token && !token.deleted && token.id) {
        session.user = {
          ...session.user,
          id: token.id as string,
          username: token.username as string,
          storeId: token.storeId as string,
          voopStoreId: token.voopStoreId as string,
          tenantId: token.tenantId as string,
          publicStoreRef: token.publicStoreRef as string,
          shopDomain: token.shopDomain as string,
          role: token.role as string,
          permissions: token.permissions as string | null,
        } as any;
      } else {
        session.user = null as any;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET || "voop-super-secret-key-12345",
};

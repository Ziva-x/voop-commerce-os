import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export function getCleanDatabaseUrl(rawUrl?: string): string | undefined {
  let url = rawUrl || process.env.DATABASE_URL;
  if (!url) return undefined;

  // Supabase connection pooler:
  // Port 5432 is SESSION mode, strictly limited to pool_size: 15 on Supabase free tier.
  // Port 6543 is TRANSACTION mode (PgBouncer), which supports high concurrency in serverless environments.
  if (url.includes("pooler.supabase.com:5432")) {
    url = url.replace("pooler.supabase.com:5432", "pooler.supabase.com:6543");
  }

  // When connecting via port 6543, ensure pgbouncer=true, connection_limit=5, and pool_timeout=30
  if (url.includes(":6543")) {
    try {
      const parsed = new URL(url);
      if (!parsed.searchParams.has("pgbouncer")) {
        parsed.searchParams.set("pgbouncer", "true");
      }
      if (!parsed.searchParams.has("connection_limit")) {
        parsed.searchParams.set("connection_limit", "5");
      }
      if (!parsed.searchParams.has("pool_timeout")) {
        parsed.searchParams.set("pool_timeout", "30");
      }
      url = parsed.toString();
    } catch {
      if (!url.includes("pgbouncer=true")) {
        url += (url.includes("?") ? "&" : "?") + "pgbouncer=true&connection_limit=5&pool_timeout=30";
      }
    }
  }

  return url;
}

const dbUrl = getCleanDatabaseUrl();
if (dbUrl) {
  process.env.DATABASE_URL = dbUrl;
}

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    datasources: dbUrl ? { db: { url: dbUrl } } : undefined,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

// Always retain singleton instance on globalThis across all environments (including serverless warm lambdas)
globalForPrisma.prisma = prisma;

export default prisma;


import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is required");
  }

  const adapter = new PrismaPg({
    connectionString,
    max: 5,
    connectionTimeoutMillis: 10_000,
  });

  return new PrismaClient({ adapter });
}

// Interactive-transaction connection-acquisition budget. Prisma's default
// `maxWait` (2s) can be shorter than a cold Neon connection takes to establish
// under a concurrent burst, producing spurious "Unable to start a transaction
// in the given time" errors. Align it with the pg pool's connectionTimeoutMillis
// (10s) so transaction start waits exactly as long as the pool is willing to
// acquire a connection. This changes neither isolation nor the in-transaction
// execution timeout.
export const TRANSACTION_ACQUIRE_TIMEOUT_MS = 10_000;

// Shared interactive-transaction options for the app's owner-scoped mutations.
// Only `maxWait` is raised; the in-transaction execution `timeout` keeps Prisma's
// default so a genuinely stuck transaction still fails fast.
export const TRANSACTION_OPTIONS = { maxWait: TRANSACTION_ACQUIRE_TIMEOUT_MS } as const;

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

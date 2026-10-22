// Shared safety gate for database integration tests. Opt-in only, and once
// opted in an unsafe target fails loudly rather than silently skipping, so a
// production database can never be written to.
export const optedIn = process.env.RUN_DB_INTEGRATION_TESTS === "1";

const REQUIRED_DATABASE_NAME = "foliovanta_dev";

// Throws on any unsafe configuration. Call before importing Prisma or issuing
// a single query, so validation always precedes database writes.
export function assertSafeIntegrationDatabase(): void {
  if (process.env.NODE_ENV === "production" || process.env.APP_ENV === "production") {
    throw new Error("Refusing to run DB integration tests: NODE_ENV/APP_ENV is production.");
  }

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("Refusing to run DB integration tests: DATABASE_URL is not set.");
  }

  let databaseName: string;
  try {
    databaseName = new URL(url).pathname.replace(/^\/+/, "");
  } catch {
    throw new Error("Refusing to run DB integration tests: DATABASE_URL is unparseable.");
  }

  if (databaseName !== REQUIRED_DATABASE_NAME) {
    throw new Error(
      `Refusing to run DB integration tests: database must be "${REQUIRED_DATABASE_NAME}", got "${databaseName}".`,
    );
  }
}

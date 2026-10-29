/**
 * Controlled, auditable Super Admin / Admin bootstrap. Operator-run only.
 *
 * There is intentionally NO in-app way to self-promote: this CLI is the sole
 * path to the first administrator, and it:
 *   - names the exact target account explicitly (by Clerk user id or email),
 *   - requires an explicit confirmation token equal to the resolved Clerk user
 *     id (so you cannot promote the wrong account by mistake),
 *   - refuses to run against production unless ALLOW_PROD_ROLE_BOOTSTRAP=1,
 *   - writes an immutable audit record for every change,
 *   - hardcodes no identities or emails and auto-promotes no one.
 *
 * Usage:
 *   pnpm tsx scripts/admin/grant-role.ts \
 *     (--clerk-user-id <id> | --email <email>) \
 *     --role (ADMIN|SUPER_ADMIN) \
 *     --confirm <clerk-user-id>
 */
import { config } from "dotenv";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";

config({ path: ".env.local" });

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function fail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}

const clerkUserId = arg("clerk-user-id");
const email = arg("email");
const role = arg("role");
const confirm = arg("confirm");

if (process.env.APP_ENV === "production" || process.env.NODE_ENV === "production") {
  if (process.env.ALLOW_PROD_ROLE_BOOTSTRAP !== "1") {
    fail("Refusing to change roles in production without ALLOW_PROD_ROLE_BOOTSTRAP=1.");
  }
}

if (role !== "ADMIN" && role !== "SUPER_ADMIN") {
  fail("--role must be ADMIN or SUPER_ADMIN. This tool only grants administrative roles.");
}
if (!clerkUserId && !email) {
  fail("Provide --clerk-user-id or --email to name the exact target account.");
}

// Narrow once at module scope (control-flow narrowing does not reach into main()).
const targetRole: "ADMIN" | "SUPER_ADMIN" = role;
const userWhere = clerkUserId ? { clerkUserId } : { email: email as string };

const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!connectionString) {
  fail("DIRECT_URL or DATABASE_URL is required.");
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function main() {
  const user = await prisma.user.findFirst({
    where: userWhere,
    select: { id: true, clerkUserId: true, email: true, role: true, status: true },
  });

  if (!user) {
    fail("No user matches that identifier. The account must exist (via Clerk sync) first.");
  }

  // Explicit operator confirmation: the confirm token must equal the resolved
  // account's Clerk id. This makes the operator look at exactly which account
  // they are promoting — an email lookup alone is never enough.
  if (confirm !== user.clerkUserId) {
    fail(
      `Confirmation required. Re-run with --confirm ${user.clerkUserId} ` +
        `to grant ${targetRole} to ${user.email ?? user.clerkUserId} (current role: ${user.role}, status: ${user.status}).`,
    );
  }

  if (user.status !== "ACTIVE") {
    fail(`Refusing to promote a ${user.status} account. Only ACTIVE accounts may be granted roles.`);
  }

  if (user.role === targetRole) {
    console.log(`• ${user.clerkUserId} already has role ${targetRole}. No change.`);
    return;
  }

  const previousRole = user.role;
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { role: targetRole } });
    await tx.auditLog.create({
      data: {
        action: "admin.role.granted",
        actorUserId: null, // operator/CLI action — no in-app actor
        targetType: "user",
        targetId: user.id,
        outcome: "SUCCESS",
        metadata: { via: "cli-bootstrap", previousRole, newRole: targetRole },
      },
    });
  });

  console.log(`✓ Granted ${targetRole} to ${user.email ?? user.clerkUserId} (was ${previousRole}).`);
  console.log("  An immutable audit record was written (action: admin.role.granted).");
}

main()
  .catch((error) => {
    console.error("✗ Unexpected error:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });

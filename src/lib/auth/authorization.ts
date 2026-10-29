import "server-only";

import { auth } from "@clerk/nextjs/server";

import type { UserRole } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db/prisma";
import { type Permission, can, isAdminRole } from "@/lib/auth/permissions";

// The authenticated, ACTIVE administrator resolved from the DATABASE. Role is
// always read live from the DB on every request — never from the client, a JWT
// claim, or middleware — so a revoked or suspended admin loses access on their
// next request without signing out.
export type AdminActor = {
  userId: string;
  clerkUserId: string;
  role: UserRole;
  email: string | null;
  name: string | null;
};

export type AuthzReason = "UNAUTHENTICATED" | "NOT_SYNCED" | "ACCOUNT_INACTIVE" | "FORBIDDEN";

export type AuthzFailure = {
  ok: false;
  reason: AuthzReason;
  status: 401 | 403;
  // Present once a DB user has resolved, so denied attempts can be audited to a
  // real account. Never exposed to clients.
  actorUserId?: string;
  clerkUserId?: string;
};

export type AuthzResult = { ok: true; actor: AdminActor } | AuthzFailure;

/**
 * Resolve the current request's administrator, enforced entirely server-side:
 *
 * 1. Clerk must have authenticated the request (else UNAUTHENTICATED/401).
 * 2. The internal user row must exist (else NOT_SYNCED).
 * 3. The account must be ACTIVE (a SUSPENDED or DELETION_PENDING account can
 *    never retain admin access).
 * 4. The DB role must be an administrative role (deny by default otherwise).
 *
 * Every authenticated-but-denied case returns status 403 with the same client
 * shape, so the admin surface never leaks "you're almost an admin" information.
 */
export async function resolveAdminActor(): Promise<AuthzResult> {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) {
    return { ok: false, reason: "UNAUTHENTICATED", status: 401 };
  }

  const user = await prisma.user.findUnique({
    where: { clerkUserId },
    select: { id: true, clerkUserId: true, role: true, status: true, email: true, name: true },
  });

  if (!user) {
    return { ok: false, reason: "NOT_SYNCED", status: 403, clerkUserId };
  }
  if (user.status !== "ACTIVE") {
    return {
      ok: false,
      reason: "ACCOUNT_INACTIVE",
      status: 403,
      actorUserId: user.id,
      clerkUserId,
    };
  }
  if (!isAdminRole(user.role)) {
    return { ok: false, reason: "FORBIDDEN", status: 403, actorUserId: user.id, clerkUserId };
  }

  return {
    ok: true,
    actor: {
      userId: user.id,
      clerkUserId: user.clerkUserId,
      role: user.role,
      email: user.email,
      name: user.name,
    },
  };
}

/**
 * Resolve the administrator AND require a specific permission. This is the
 * single gate every admin route handler and service should call. A resolved
 * admin who lacks the permission (e.g. an ADMIN reaching a SUPER_ADMIN-only
 * capability) is denied with FORBIDDEN, with `actorUserId` set for auditing.
 */
export async function requirePermission(permission: Permission): Promise<AuthzResult> {
  const resolved = await resolveAdminActor();
  if (!resolved.ok) {
    return resolved;
  }
  if (!can(resolved.actor.role, permission)) {
    return {
      ok: false,
      reason: "FORBIDDEN",
      status: 403,
      actorUserId: resolved.actor.userId,
      clerkUserId: resolved.actor.clerkUserId,
    };
  }
  return resolved;
}

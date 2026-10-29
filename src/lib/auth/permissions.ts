// Pure, dependency-free permission matrix. No "server-only" here so both the
// server authorization layer and client navigation can import `can`/`Permission`
// from one source of truth. This module never reads auth, roles, or the DB — it
// only answers "does this role carry this permission?".

import type { UserRole } from "@/generated/prisma/enums";

export type { UserRole };

// An administrative role is anything above USER.
export type AdminRole = Exclude<UserRole, "USER">;

// Fine-grained capabilities. A route/service asks for the specific permission it
// needs, never for a role — so privilege is described in one place and ADMIN vs
// SUPER_ADMIN differences are explicit rather than scattered `role === "..."`
// checks.
export type Permission =
  | "admin.access" // may enter the admin area at all
  | "admin.overview.read"
  | "admin.users.read"
  | "admin.portfolios.read"
  | "admin.moderation.read"
  | "admin.feedback.read"
  | "admin.feedback.triage"
  | "admin.reports.read"
  | "admin.reports.triage"
  | "admin.portfolios.moderate" // suspend/review/clear a portfolio (ADMIN+)
  | "admin.users.suspend" // suspend/reinstate an ACCOUNT (SUPER_ADMIN only)
  | "admin.audit.read" // sensitive: SUPER_ADMIN only
  | "admin.roles.manage"; // privileged role changes: SUPER_ADMIN only

// Operational admin: product oversight + PORTFOLIO moderation (suspend/review/
// clear). Deliberately NOT granted account suspension, audit-log access, or role
// management — those stay SUPER_ADMIN-only, so an ADMIN role is never
// "unrestricted access" just by virtue of being admin. Account suspension is
// more consequential than portfolio moderation and must not inherit it.
const ADMIN_PERMISSIONS: readonly Permission[] = [
  "admin.access",
  "admin.overview.read",
  "admin.users.read",
  "admin.portfolios.read",
  "admin.moderation.read",
  "admin.feedback.read",
  "admin.feedback.triage",
  "admin.reports.read",
  "admin.reports.triage",
  "admin.portfolios.moderate",
];

// Deny by default: USER carries no admin permissions at all.
export const ROLE_PERMISSIONS: Record<UserRole, ReadonlySet<Permission>> = {
  USER: new Set<Permission>(),
  ADMIN: new Set<Permission>(ADMIN_PERMISSIONS),
  SUPER_ADMIN: new Set<Permission>([
    ...ADMIN_PERMISSIONS,
    "admin.users.suspend",
    "admin.audit.read",
    "admin.roles.manage",
  ]),
};

/** Deny-by-default permission check. Unknown roles/permissions return false. */
export function can(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.has(permission) ?? false;
}

export function isAdminRole(role: UserRole): role is AdminRole {
  return role === "ADMIN" || role === "SUPER_ADMIN";
}

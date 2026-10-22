import "server-only";

export type AppRole = "USER" | "SUPER_ADMIN";

export function hasAdminRole(role: AppRole): boolean {
  return role === "SUPER_ADMIN";
}

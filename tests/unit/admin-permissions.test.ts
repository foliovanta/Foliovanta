import { describe, expect, it } from "vitest";

import { type Permission, can, isAdminRole } from "@/lib/auth/permissions";

const ADMIN_ONLY_FALSE_FOR_USER: Permission[] = [
  "admin.access",
  "admin.overview.read",
  "admin.users.read",
  "admin.portfolios.read",
  "admin.moderation.read",
  "admin.reports.read",
  "admin.audit.read",
  "admin.roles.manage",
];

describe("permission matrix", () => {
  it("denies every admin permission to USER (deny by default)", () => {
    for (const permission of ADMIN_ONLY_FALSE_FOR_USER) {
      expect(can("USER", permission)).toBe(false);
    }
  });

  it("grants ADMIN operational read permissions", () => {
    expect(can("ADMIN", "admin.access")).toBe(true);
    expect(can("ADMIN", "admin.overview.read")).toBe(true);
    expect(can("ADMIN", "admin.users.read")).toBe(true);
    expect(can("ADMIN", "admin.portfolios.read")).toBe(true);
    expect(can("ADMIN", "admin.moderation.read")).toBe(true);
    expect(can("ADMIN", "admin.reports.read")).toBe(true);
  });

  it("withholds audit access and role management from ADMIN", () => {
    expect(can("ADMIN", "admin.audit.read")).toBe(false);
    expect(can("ADMIN", "admin.roles.manage")).toBe(false);
  });

  it("grants SUPER_ADMIN everything ADMIN has plus audit and role management", () => {
    for (const permission of ADMIN_ONLY_FALSE_FOR_USER) {
      expect(can("SUPER_ADMIN", permission)).toBe(true);
    }
  });

  it("classifies admin roles", () => {
    expect(isAdminRole("USER")).toBe(false);
    expect(isAdminRole("ADMIN")).toBe(true);
    expect(isAdminRole("SUPER_ADMIN")).toBe(true);
  });
});

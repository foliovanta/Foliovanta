// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

// The schema module transitively imports the Prisma client (which needs a live
// DATABASE_URL at construction); stub it since the schema itself needs no DB.
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));

import { SECTION_KEYS, reorderSectionsSchema } from "@/lib/portfolios/sections";

const ALL = [...SECTION_KEYS];

describe("reorderSectionsSchema", () => {
  it("accepts a complete, unique permutation", () => {
    const result = reorderSectionsSchema.safeParse({
      expectedRevision: "3",
      sectionKeys: [...ALL].reverse(),
    });
    expect(result.success).toBe(true);
  });

  it("rejects a missing key (incomplete set)", () => {
    const result = reorderSectionsSchema.safeParse({
      expectedRevision: "3",
      sectionKeys: ALL.slice(0, ALL.length - 1),
    });
    expect(result.success).toBe(false);
  });

  it("rejects a duplicate key", () => {
    const withDup = [...ALL.slice(0, ALL.length - 1), ALL[0]];
    const result = reorderSectionsSchema.safeParse({
      expectedRevision: "3",
      sectionKeys: withDup,
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown key", () => {
    const withUnknown = [...ALL.slice(0, ALL.length - 1), "NOT_A_SECTION"];
    const result = reorderSectionsSchema.safeParse({
      expectedRevision: "3",
      sectionKeys: withUnknown,
    });
    expect(result.success).toBe(false);
  });

  it("rejects too many keys", () => {
    const result = reorderSectionsSchema.safeParse({
      expectedRevision: "3",
      sectionKeys: [...ALL, ALL[0]],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a missing expectedRevision", () => {
    const result = reorderSectionsSchema.safeParse({ sectionKeys: ALL });
    expect(result.success).toBe(false);
  });
});

import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  type Cursor,
  buildCursorPage,
  decodeCursor,
  encodeCursor,
  keysetWhere,
  parsePageParams,
} from "@/lib/admin/pagination";

const id = randomUUID();
const validCursor: Cursor = { v: "2026-01-02T03:04:05.000Z", id };

describe("cursor codec", () => {
  it("round-trips a valid cursor", () => {
    expect(decodeCursor(encodeCursor(validCursor))).toEqual(validCursor);
  });

  it("rejects a tampered/garbage cursor", () => {
    expect(decodeCursor("not-base64!!")).toBeNull();
    expect(decodeCursor(Buffer.from("{}", "utf8").toString("base64url"))).toBeNull();
    expect(decodeCursor(Buffer.from('{"v":"x","id":"' + id + '"}', "utf8").toString("base64url"))).toBeNull(); // bad date
    expect(
      decodeCursor(Buffer.from('{"v":"2026-01-02T00:00:00.000Z","id":"not-a-uuid"}', "utf8").toString("base64url")),
    ).toBeNull(); // bad id
  });

  it("rejects a cursor with an injected extra predicate shape", () => {
    // Even if JSON parses, only {v,id} survive and both are type-validated.
    const malicious = Buffer.from(JSON.stringify({ v: validCursor.v, id, OR: [{ role: "SUPER_ADMIN" }] }), "utf8").toString("base64url");
    const decoded = decodeCursor(malicious);
    expect(decoded).toEqual(validCursor); // extra keys dropped
  });
});

describe("keysetWhere", () => {
  it("builds a strict-after predicate with an id tie-breaker (desc)", () => {
    const where = keysetWhere("createdAt", validCursor, "desc");
    expect(where).toEqual({
      OR: [
        { createdAt: { lt: new Date(validCursor.v) } },
        { AND: [{ createdAt: new Date(validCursor.v) }, { id: { lt: id } }] },
      ],
    });
  });

  it("uses gt for ascending", () => {
    const where = keysetWhere("updatedAt", validCursor, "asc") as { OR: Array<Record<string, unknown>> };
    expect(where.OR[0]).toEqual({ updatedAt: { gt: new Date(validCursor.v) } });
  });
});

describe("buildCursorPage", () => {
  const idA = randomUUID();
  const idB = randomUUID();
  const idC = randomUUID();
  const rows = [
    { id: idA, createdAt: "2026-01-03T00:00:00.000Z" },
    { id: idB, createdAt: "2026-01-02T00:00:00.000Z" },
    { id: idC, createdAt: "2026-01-01T00:00:00.000Z" },
  ];

  it("trims to limit and derives the next cursor from the last kept row", () => {
    const page = buildCursorPage(rows, 2, (r) => ({ v: r.createdAt, id: r.id }));
    expect(page.items).toHaveLength(2);
    expect(page.nextCursor).not.toBeNull();
    expect(decodeCursor(page.nextCursor!)).toEqual({ v: "2026-01-02T00:00:00.000Z", id: idB });
  });

  it("returns null nextCursor when there are no more rows", () => {
    const page = buildCursorPage(rows.slice(0, 2), 5, (r) => ({ v: r.createdAt, id: r.id }));
    expect(page.items).toHaveLength(2);
    expect(page.nextCursor).toBeNull();
  });

  it("handles an empty result", () => {
    const page = buildCursorPage([], 10, (r: { id: string; createdAt: string }) => ({ v: r.createdAt, id: r.id }));
    expect(page).toEqual({ items: [], nextCursor: null });
  });
});

describe("parsePageParams", () => {
  it("clamps and defaults", () => {
    expect(parsePageParams(new URLSearchParams("limit=5")).limit).toBe(5);
    expect(parsePageParams(new URLSearchParams("")).limit).toBe(25);
    expect(parsePageParams(new URLSearchParams("limit=9999")).limit).toBe(25); // invalid → default
  });
});

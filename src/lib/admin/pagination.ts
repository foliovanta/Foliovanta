// Shared pagination contract for future admin list endpoints (users, portfolios,
// audit logs). Opaque forward cursor + bounded page size, so every list speaks
// the same wire shape before any of them ship.

import { z } from "zod";

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

export type CursorPage<T> = {
  items: T[];
  // Opaque cursor for the next page, or null at the end.
  nextCursor: string | null;
};

const pageParamsSchema = z.object({
  cursor: z.string().min(1).max(512).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).optional(),
});

export type PageParams = { cursor?: string; limit: number };

/** Parse `?cursor=&limit=` from a URL, clamped to the shared bounds. */
export function parsePageParams(searchParams: URLSearchParams): PageParams {
  const parsed = pageParamsSchema.safeParse({
    cursor: searchParams.get("cursor") ?? undefined,
    limit: searchParams.get("limit") ?? undefined,
  });
  const data = parsed.success ? parsed.data : {};
  return {
    ...(data.cursor !== undefined ? { cursor: data.cursor } : {}),
    limit: data.limit ?? DEFAULT_PAGE_SIZE,
  };
}

// ---------------------------------------------------------------------------
// Keyset cursors
//
// A cursor is the opaque, base64url-encoded `{ v, id }` of the last row on the
// previous page, where `v` is the ISO timestamp of the sort field and `id` is
// the unique tie-breaker. Keyset (not OFFSET) pagination, so pages are stable
// and never skip/duplicate rows as earlier rows change. Ordering is always
// `[sortField dir, id dir]`, giving a total order even when timestamps collide.
// ---------------------------------------------------------------------------

export type Cursor = { v: string; id: string };

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

/** Decode and validate an opaque cursor. Returns null for any tampered/invalid value. */
export function decodeCursor(raw: string): Cursor | null {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof (parsed as Cursor).v !== "string" ||
      typeof (parsed as Cursor).id !== "string"
    ) {
      return null;
    }
    const { v, id } = parsed as Cursor;
    // `v` must be a real timestamp and `id` a UUID — reject anything else so a
    // tampered cursor can never smuggle an arbitrary predicate into the query.
    if (Number.isNaN(Date.parse(v))) return null;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null;
    return { v, id };
  } catch {
    return null;
  }
}

export type SortDirection = "asc" | "desc";

/**
 * Prisma `where` fragment that selects rows strictly after `cursor` under the
 * `[field dir, id dir]` ordering (keyset). `field` holds a DateTime.
 */
export function keysetWhere(field: string, cursor: Cursor, direction: SortDirection) {
  const op = direction === "desc" ? "lt" : "gt";
  const value = new Date(cursor.v);
  return {
    OR: [{ [field]: { [op]: value } }, { AND: [{ [field]: value }, { id: { [op]: cursor.id } }] }],
  };
}

/**
 * Turn `limit + 1` fetched rows into a page: trims to `limit` and derives the
 * next cursor from the last returned row (null when there are no more rows).
 */
export function buildCursorPage<T>(
  rows: T[],
  limit: number,
  toCursor: (row: T) => Cursor,
): CursorPage<T> {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items[items.length - 1];
  return { items, nextCursor: hasMore && last ? encodeCursor(toCursor(last)) : null };
}

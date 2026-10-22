import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { mutateDraft } from "@/lib/portfolios/draft-mutation";
import { type PortfolioAccessError, resolveActiveUser } from "@/lib/portfolios/get-portfolios";

type Tx = Prisma.TransactionClient;

export type WithRevision = { expectedRevision: bigint };

// Generic domain failures for position-ordered content. Resource-not-found is
// uniform (404) regardless of model.
export type ContentMutationError =
  | "NOT_FOUND"
  | "CONTENT_LIMIT_REACHED"
  | "DUPLICATE_IDS"
  | "UNKNOWN_IDS"
  | "INVALID_DATE_RANGE"
  | "CURRENT_WITH_END_DATE";

export type MutationFailure = PortfolioAccessError | ContentMutationError | "REVISION_CONFLICT";

export type ListResult<Row> =
  | { ok: true; items: Row[]; revision: bigint }
  | { ok: false; error: PortfolioAccessError | "NOT_FOUND" };

export type ItemResult<Row> =
  { ok: true; item: Row; revision: bigint } | { ok: false; error: MutationFailure };

export type DeleteResult =
  { ok: true; deletedId: string; revision: bigint } | { ok: false; error: MutationFailure };

export type ReorderResult<Row> =
  { ok: true; items: Row[]; revision: bigint } | { ok: false; error: MutationFailure };

// Per-model wiring. Only the typed Prisma delegate calls and optional
// cross-field validation differ between content types; the orchestration
// (ownership, concurrency, limits, positions, reorder validation) is shared.
export type RepeatableConfig<Row, C extends WithRevision, U extends WithRevision> = {
  maxItems: number;
  count: (tx: Tx, portfolioId: string) => Promise<number>;
  maxPosition: (tx: Tx, portfolioId: string) => Promise<number | null>;
  insert: (tx: Tx, portfolioId: string, position: number, input: C) => Promise<Row>;
  patch: (tx: Tx, portfolioId: string, id: string, input: U) => Promise<void>;
  fetch: (client: Tx, portfolioId: string, id: string) => Promise<Row | null>;
  remove: (tx: Tx, portfolioId: string, id: string) => Promise<number>;
  listIds: (tx: Tx, portfolioId: string) => Promise<string[]>;
  setPosition: (tx: Tx, id: string, position: number) => Promise<void>;
  listOrdered: (client: Tx, portfolioId: string) => Promise<Row[]>;
  validateCreate?: (input: C) => ContentMutationError | null;
  validateUpdate?: (existing: Row, input: U) => ContentMutationError | null;
};

export type RepeatableContentService<Row, C extends WithRevision, U extends WithRevision> = {
  list: (clerkUserId: string, portfolioId: string) => Promise<ListResult<Row>>;
  create: (clerkUserId: string, portfolioId: string, input: C) => Promise<ItemResult<Row>>;
  update: (
    clerkUserId: string,
    portfolioId: string,
    id: string,
    input: U,
  ) => Promise<ItemResult<Row>>;
  remove: (
    clerkUserId: string,
    portfolioId: string,
    id: string,
    expectedRevision: bigint,
  ) => Promise<DeleteResult>;
  reorder: (
    clerkUserId: string,
    portfolioId: string,
    expectedRevision: bigint,
    ids: string[],
  ) => Promise<ReorderResult<Row>>;
};

function classifyReorder(
  ids: string[],
  existing: Set<string>,
): "DUPLICATE_IDS" | "UNKNOWN_IDS" | null {
  if (new Set(ids).size !== ids.length) {
    return "DUPLICATE_IDS";
  }
  // A reorder must be a full permutation: reject unknown ids and partial lists.
  if (ids.length !== existing.size || ids.some((id) => !existing.has(id))) {
    return "UNKNOWN_IDS";
  }
  return null;
}

export function defineRepeatableContent<Row, C extends WithRevision, U extends WithRevision>(
  config: RepeatableConfig<Row, C, U>,
): RepeatableContentService<Row, C, U> {
  async function list(clerkUserId: string, portfolioId: string): Promise<ListResult<Row>> {
    const resolved = await resolveActiveUser(clerkUserId);
    if (!resolved.ok) {
      return resolved;
    }

    const portfolio = await prisma.portfolio.findFirst({
      where: { id: portfolioId, ownerId: resolved.userId, deletedAt: null },
      select: { draftRevision: true },
    });
    if (!portfolio) {
      return { ok: false, error: "NOT_FOUND" };
    }

    const items = await config.listOrdered(prisma, portfolioId);
    return { ok: true, items, revision: portfolio.draftRevision };
  }

  async function create(
    clerkUserId: string,
    portfolioId: string,
    input: C,
  ): Promise<ItemResult<Row>> {
    const result = await mutateDraft<Row, ContentMutationError>(
      clerkUserId,
      portfolioId,
      input.expectedRevision,
      async (tx) => {
        const invalid = config.validateCreate?.(input);
        if (invalid) {
          return { ok: false, error: invalid };
        }
        const count = await config.count(tx, portfolioId);
        if (count >= config.maxItems) {
          return { ok: false, error: "CONTENT_LIMIT_REACHED" };
        }
        const maxPosition = await config.maxPosition(tx, portfolioId);
        const item = await config.insert(tx, portfolioId, (maxPosition ?? -1) + 1, input);
        return { ok: true, value: item };
      },
    );

    if (!result.ok) {
      return result;
    }
    return { ok: true, item: result.value, revision: result.revision };
  }

  async function update(
    clerkUserId: string,
    portfolioId: string,
    id: string,
    input: U,
  ): Promise<ItemResult<Row>> {
    const result = await mutateDraft<Row, ContentMutationError>(
      clerkUserId,
      portfolioId,
      input.expectedRevision,
      async (tx) => {
        const existing = await config.fetch(tx, portfolioId, id);
        if (!existing) {
          return { ok: false, error: "NOT_FOUND" };
        }
        const invalid = config.validateUpdate?.(existing, input);
        if (invalid) {
          return { ok: false, error: invalid };
        }
        await config.patch(tx, portfolioId, id, input);
        const item = await config.fetch(tx, portfolioId, id);
        if (!item) {
          return { ok: false, error: "NOT_FOUND" };
        }
        return { ok: true, value: item };
      },
    );

    if (!result.ok) {
      return result;
    }
    return { ok: true, item: result.value, revision: result.revision };
  }

  async function remove(
    clerkUserId: string,
    portfolioId: string,
    id: string,
    expectedRevision: bigint,
  ): Promise<DeleteResult> {
    const result = await mutateDraft<string, ContentMutationError>(
      clerkUserId,
      portfolioId,
      expectedRevision,
      async (tx) => {
        const count = await config.remove(tx, portfolioId, id);
        if (count === 0) {
          return { ok: false, error: "NOT_FOUND" };
        }
        return { ok: true, value: id };
      },
    );

    if (!result.ok) {
      return result;
    }
    return { ok: true, deletedId: result.value, revision: result.revision };
  }

  async function reorder(
    clerkUserId: string,
    portfolioId: string,
    expectedRevision: bigint,
    ids: string[],
  ): Promise<ReorderResult<Row>> {
    const result = await mutateDraft<Row[], ContentMutationError>(
      clerkUserId,
      portfolioId,
      expectedRevision,
      async (tx) => {
        const existing = await config.listIds(tx, portfolioId);
        const invalid = classifyReorder(ids, new Set(existing));
        if (invalid) {
          return { ok: false, error: invalid };
        }
        for (const [index, id] of ids.entries()) {
          await config.setPosition(tx, id, index);
        }
        const items = await config.listOrdered(tx, portfolioId);
        return { ok: true, value: items };
      },
    );

    if (!result.ok) {
      return result;
    }
    return { ok: true, items: result.value, revision: result.revision };
  }

  return { list, create, update, remove, reorder };
}

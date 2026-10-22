import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { z } from "zod";

import { expectedRevisionSchema } from "@/lib/portfolios/draft-mutation";
import {
  internalErrorResponse,
  invalidIdResponse,
  jsonError,
  mutationErrorResponse,
  noStoreHeaders,
  unauthenticatedResponse,
  validationErrorResponse,
} from "@/lib/portfolios/http-responses";

// Shared request bodies for the content endpoints.
export const deleteContentSchema = z.strictObject({ expectedRevision: expectedRevisionSchema });
export const reorderContentSchema = z.strictObject({
  expectedRevision: expectedRevisionSchema,
  // Upper bound guards abuse; the full-permutation rule is enforced per model.
  ids: z.array(z.uuid()).min(1).max(500),
});

type SafeParse<Input> = {
  safeParse(data: unknown): { success: true; data: Input } | { success: false; error: z.ZodError };
};

type Fail = { ok: false; error: string };
type ListFn<Row> = (
  clerkUserId: string,
  portfolioId: string,
) => Promise<{ ok: true; items: Row[]; revision: bigint } | Fail>;
type CreateFn<Row, Input> = (
  clerkUserId: string,
  portfolioId: string,
  input: Input,
) => Promise<{ ok: true; item: Row; revision: bigint } | Fail>;
type UpdateFn<Row, Input> = (
  clerkUserId: string,
  portfolioId: string,
  id: string,
  input: Input,
) => Promise<{ ok: true; item: Row; revision: bigint } | Fail>;
type DeleteFn = (
  clerkUserId: string,
  portfolioId: string,
  id: string,
  expectedRevision: bigint,
) => Promise<{ ok: true; deletedId: string; revision: bigint } | Fail>;
type ReorderFn<Row> = (
  clerkUserId: string,
  portfolioId: string,
  expectedRevision: bigint,
  ids: string[],
) => Promise<{ ok: true; items: Row[]; revision: bigint } | Fail>;

type PortfolioCtx = { params: Promise<{ portfolioId: string }> };
type ItemCtx = { params: Promise<{ portfolioId: string; itemId: string }> };

const isUuid = (value: string) => z.uuid().safeParse(value).success;

async function readJson(request: Request) {
  try {
    return { ok: true as const, body: (await request.json()) as unknown };
  } catch {
    return { ok: false as const };
  }
}

export function listHandler<Row>(list: ListFn<Row>, key: string) {
  return async (_request: Request, context: PortfolioCtx) => {
    const { userId } = await auth();
    if (!userId) return unauthenticatedResponse();

    const { portfolioId } = await context.params;
    if (!isUuid(portfolioId)) return invalidIdResponse();

    try {
      const result = await list(userId, portfolioId);
      if (!result.ok) return mutationErrorResponse(result.error);
      return NextResponse.json(
        { data: { [key]: result.items, revision: result.revision.toString() } },
        { status: 200, headers: noStoreHeaders },
      );
    } catch (error) {
      console.error(`Failed to list ${key}`, error);
      return internalErrorResponse();
    }
  };
}

export function createHandler<Row, Input>(
  schema: SafeParse<Input>,
  create: CreateFn<Row, Input>,
  key: string,
) {
  return async (request: Request, context: PortfolioCtx) => {
    const { userId } = await auth();
    if (!userId) return unauthenticatedResponse();

    const { portfolioId } = await context.params;
    if (!isUuid(portfolioId)) return invalidIdResponse();

    const parsedBody = await readJson(request);
    if (!parsedBody.ok) return jsonError(400, "INVALID_BODY", "Request body must be valid JSON");

    const parsed = schema.safeParse(parsedBody.body);
    if (!parsed.success) return validationErrorResponse(z.flattenError(parsed.error).fieldErrors);

    try {
      const result = await create(userId, portfolioId, parsed.data);
      if (!result.ok) return mutationErrorResponse(result.error);
      return NextResponse.json(
        { data: { [key]: result.item, revision: result.revision.toString() } },
        { status: 201, headers: noStoreHeaders },
      );
    } catch (error) {
      console.error(`Failed to create ${key}`, error);
      return internalErrorResponse();
    }
  };
}

export function updateHandler<Row, Input>(
  schema: SafeParse<Input>,
  update: UpdateFn<Row, Input>,
  key: string,
) {
  return async (request: Request, context: ItemCtx) => {
    const { userId } = await auth();
    if (!userId) return unauthenticatedResponse();

    const { portfolioId, itemId } = await context.params;
    if (!isUuid(portfolioId) || !isUuid(itemId)) return invalidIdResponse();

    const parsedBody = await readJson(request);
    if (!parsedBody.ok) return jsonError(400, "INVALID_BODY", "Request body must be valid JSON");

    const parsed = schema.safeParse(parsedBody.body);
    if (!parsed.success) return validationErrorResponse(z.flattenError(parsed.error).fieldErrors);

    try {
      const result = await update(userId, portfolioId, itemId, parsed.data);
      if (!result.ok) return mutationErrorResponse(result.error);
      return NextResponse.json(
        { data: { [key]: result.item, revision: result.revision.toString() } },
        { status: 200, headers: noStoreHeaders },
      );
    } catch (error) {
      console.error(`Failed to update ${key}`, error);
      return internalErrorResponse();
    }
  };
}

export function deleteHandler(remove: DeleteFn, key: string) {
  return async (request: Request, context: ItemCtx) => {
    const { userId } = await auth();
    if (!userId) return unauthenticatedResponse();

    const { portfolioId, itemId } = await context.params;
    if (!isUuid(portfolioId) || !isUuid(itemId)) return invalidIdResponse();

    const parsedBody = await readJson(request);
    if (!parsedBody.ok) return jsonError(400, "INVALID_BODY", "Request body must be valid JSON");

    const parsed = deleteContentSchema.safeParse(parsedBody.body);
    if (!parsed.success) return validationErrorResponse(z.flattenError(parsed.error).fieldErrors);

    try {
      const result = await remove(userId, portfolioId, itemId, parsed.data.expectedRevision);
      if (!result.ok) return mutationErrorResponse(result.error);
      return NextResponse.json(
        { data: { deletedId: result.deletedId, revision: result.revision.toString() } },
        { status: 200, headers: noStoreHeaders },
      );
    } catch (error) {
      console.error(`Failed to delete ${key}`, error);
      return internalErrorResponse();
    }
  };
}

export function reorderHandler<Row>(reorder: ReorderFn<Row>, key: string) {
  return async (request: Request, context: PortfolioCtx) => {
    const { userId } = await auth();
    if (!userId) return unauthenticatedResponse();

    const { portfolioId } = await context.params;
    if (!isUuid(portfolioId)) return invalidIdResponse();

    const parsedBody = await readJson(request);
    if (!parsedBody.ok) return jsonError(400, "INVALID_BODY", "Request body must be valid JSON");

    const parsed = reorderContentSchema.safeParse(parsedBody.body);
    if (!parsed.success) return validationErrorResponse(z.flattenError(parsed.error).fieldErrors);

    try {
      const result = await reorder(
        userId,
        portfolioId,
        parsed.data.expectedRevision,
        parsed.data.ids,
      );
      if (!result.ok) return mutationErrorResponse(result.error);
      return NextResponse.json(
        { data: { [key]: result.items, revision: result.revision.toString() } },
        { status: 200, headers: noStoreHeaders },
      );
    } catch (error) {
      console.error(`Failed to reorder ${key}`, error);
      return internalErrorResponse();
    }
  };
}

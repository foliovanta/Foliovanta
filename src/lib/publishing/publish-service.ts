import "server-only";

import { createHash } from "node:crypto";

import { Prisma } from "@/generated/prisma/client";
import { prisma, TRANSACTION_OPTIONS } from "@/lib/db/prisma";
import { type PortfolioAccessError, resolveActiveUser } from "@/lib/portfolios/get-portfolios";
import { loadPortfolioDraftInput } from "@/lib/publishing/draft-loader";
import { type ReadinessIssue, evaluatePublishReadiness } from "@/lib/publishing/publish-readiness";
import {
  type PublishedSnapshot,
  SNAPSHOT_SCHEMA_VERSION,
  buildSnapshot,
  isTemplateVersionSupported,
  publishedSnapshotSchema,
} from "@/lib/publishing/snapshot";

type PublicationStatus = "DRAFT" | "PUBLISHED" | "UNPUBLISHED";

export type PublishSuccess = {
  ok: true;
  versionNumber: number;
  publicationStatus: "PUBLISHED";
  publishedAt: Date;
  revision: bigint;
  contentHash: string;
  created: boolean; // false => identical content, idempotent no-op
};

export type PublishFailure = {
  ok: false;
  error:
    | PortfolioAccessError
    | "NOT_FOUND"
    | "REVISION_CONFLICT"
    | "PUBLISH_CONFLICT"
    | "PORTFOLIO_SUSPENDED";
};

export type PublishNotReady = { ok: false; error: "NOT_READY"; issues: ReadinessIssue[] };

export type PublishResult = PublishSuccess | PublishFailure | PublishNotReady;

// Deterministic hash over the canonical snapshot serialization. The snapshot is
// built with a fixed key order, so JSON.stringify is stable.
export function computeSnapshotHash(snapshot: PublishedSnapshot): string {
  return createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
}

export async function publishPortfolio(
  clerkUserId: string,
  portfolioId: string,
  expectedRevision: bigint,
): Promise<PublishResult> {
  const resolved = await resolveActiveUser(clerkUserId);
  if (!resolved.ok) {
    return resolved;
  }
  const ownerId = resolved.userId;

  try {
    return await prisma.$transaction(async (tx) => {
      // Lock the portfolio row for this transaction. This serializes concurrent
      // publishes and coordinates with draft mutations (which UPDATE the same
      // row), so the loaded draft is one consistent state. Both publish and
      // draft mutations take this row lock first → consistent order, no deadlock.
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "portfolios"
        WHERE "id" = ${portfolioId}::uuid AND "ownerId" = ${ownerId}::uuid AND "deletedAt" IS NULL
        FOR UPDATE
      `;
      if (locked.length === 0) {
        return { ok: false, error: "NOT_FOUND" } as const;
      }

      const portfolio = await tx.portfolio.findUniqueOrThrow({
        where: { id: portfolioId },
        select: {
          draftRevision: true,
          publicationStatus: true,
          moderationStatus: true,
          nextVersionNumber: true,
          activeVersionId: true,
        },
      });

      if (portfolio.moderationStatus === "SUSPENDED") {
        return { ok: false, error: "PORTFOLIO_SUSPENDED" } as const;
      }
      if (portfolio.draftRevision !== expectedRevision) {
        return { ok: false, error: "REVISION_CONFLICT" } as const;
      }

      const input = await loadPortfolioDraftInput(tx, portfolioId);

      const readiness = evaluatePublishReadiness(input);
      if (!readiness.ok) {
        return { ok: false, error: "NOT_READY", issues: readiness.issues } as const;
      }

      const snapshot = buildSnapshot(input);
      const contentHash = computeSnapshotHash(snapshot);

      // Idempotent no-op: identical content to the current active version.
      if (portfolio.activeVersionId && portfolio.publicationStatus === "PUBLISHED") {
        const active = await tx.portfolioVersion.findFirst({
          where: { id: portfolio.activeVersionId, portfolioId },
          select: { versionNumber: true, contentHash: true, publishedAt: true },
        });
        if (active && active.contentHash === contentHash) {
          return {
            ok: true,
            versionNumber: active.versionNumber,
            publicationStatus: "PUBLISHED",
            publishedAt: active.publishedAt,
            revision: portfolio.draftRevision,
            contentHash,
            created: false,
          } as const;
        }
      }

      const now = new Date();
      const versionNumber = portfolio.nextVersionNumber;

      const version = await tx.portfolioVersion.create({
        data: {
          portfolioId,
          versionNumber,
          schemaVersion: snapshot.schemaVersion,
          sourceDraftRevision: portfolio.draftRevision,
          templateId: snapshot.portfolio.templateKey,
          templateVersion: snapshot.portfolio.templateVersion,
          snapshot: snapshot as unknown as Prisma.InputJsonValue,
          contentHash,
          publishedById: ownerId,
          publishedAt: now,
          createdAt: now,
        },
        select: { versionNumber: true, publishedAt: true, id: true },
      });

      await tx.portfolio.update({
        where: { id: portfolioId },
        data: {
          activeVersionId: version.id,
          publicationStatus: "PUBLISHED",
          publishedAt: now,
          nextVersionNumber: versionNumber + 1,
          // draftRevision intentionally unchanged.
        },
      });

      return {
        ok: true,
        versionNumber: version.versionNumber,
        publicationStatus: "PUBLISHED",
        publishedAt: version.publishedAt,
        revision: portfolio.draftRevision,
        contentHash,
        created: true,
      } as const;
    }, TRANSACTION_OPTIONS);
  } catch (error) {
    // Backstop for the unique (portfolioId, versionNumber) constraint if the row
    // lock were ever bypassed; surface as a conflict rather than a 500.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false, error: "PUBLISH_CONFLICT" };
    }
    throw error;
  }
}

export type UnpublishResult =
  | { ok: true; publicationStatus: PublicationStatus; revision: bigint }
  | { ok: false; error: PortfolioAccessError | "NOT_FOUND" };

export async function unpublishPortfolio(
  clerkUserId: string,
  portfolioId: string,
): Promise<UnpublishResult> {
  const resolved = await resolveActiveUser(clerkUserId);
  if (!resolved.ok) {
    return resolved;
  }
  const ownerId = resolved.userId;

  return prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "portfolios"
      WHERE "id" = ${portfolioId}::uuid AND "ownerId" = ${ownerId}::uuid AND "deletedAt" IS NULL
      FOR UPDATE
    `;
    if (locked.length === 0) {
      return { ok: false, error: "NOT_FOUND" };
    }

    const portfolio = await tx.portfolio.findUniqueOrThrow({
      where: { id: portfolioId },
      select: { publicationStatus: true, draftRevision: true },
    });

    // Only a PUBLISHED portfolio transitions; repeated/benign unpublish is an
    // idempotent no-op. Historical versions and draftRevision are untouched.
    if (portfolio.publicationStatus === "PUBLISHED") {
      await tx.portfolio.update({
        where: { id: portfolioId },
        data: { publicationStatus: "UNPUBLISHED", activeVersionId: null },
      });
      return { ok: true, publicationStatus: "UNPUBLISHED", revision: portfolio.draftRevision };
    }

    return {
      ok: true,
      publicationStatus: portfolio.publicationStatus,
      revision: portfolio.draftRevision,
    };
  }, TRANSACTION_OPTIONS);
}

export type RollbackResult =
  | {
      ok: true;
      activeVersionNumber: number;
      publicationStatus: "PUBLISHED";
      publishedAt: Date;
      changed: boolean; // false => target already active (idempotent no-op)
    }
  | {
      ok: false;
      error:
        | PortfolioAccessError
        | "NOT_FOUND"
        | "NOT_PUBLISHED"
        | "TARGET_NOT_FOUND"
        | "TARGET_UNRENDERABLE"
        | "ROLLBACK_CONFLICT"
        | "PORTFOLIO_SUSPENDED";
    };

/**
 * Re-points the live active version at an existing immutable history version.
 *
 * Rollback ONLY moves the `activeVersionId` pointer — it never rewrites, copies
 * or deletes a snapshot, and never touches the draft (draftRevision and
 * nextVersionNumber are untouched, so unsaved editor work is preserved).
 *
 * Guards, all enforced under the same row lock publish/unpublish take (so the
 * cases serialize cleanly): owner-scoped; must currently be PUBLISHED (a private
 * portfolio has no live version to re-point and must NOT be silently
 * republished — the owner publishes first); not moderated off; the target must
 * be an existing version OF THIS portfolio that is still renderable under the
 * current schema + template registry (never roll the public page onto a
 * blank-rendering version); optimistic concurrency via the expected active
 * version number; idempotent when the target is already active.
 */
export async function rollbackPortfolio(
  clerkUserId: string,
  portfolioId: string,
  targetVersionNumber: number,
  expectedActiveVersionNumber: number,
): Promise<RollbackResult> {
  const resolved = await resolveActiveUser(clerkUserId);
  if (!resolved.ok) {
    return resolved;
  }
  const ownerId = resolved.userId;

  return prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "portfolios"
      WHERE "id" = ${portfolioId}::uuid AND "ownerId" = ${ownerId}::uuid AND "deletedAt" IS NULL
      FOR UPDATE
    `;
    if (locked.length === 0) {
      return { ok: false, error: "NOT_FOUND" } as const;
    }

    const portfolio = await tx.portfolio.findUniqueOrThrow({
      where: { id: portfolioId },
      select: {
        publicationStatus: true,
        moderationStatus: true,
        publishedAt: true,
        activeVersion: { select: { versionNumber: true } },
      },
    });

    // Never bypass moderation.
    if (portfolio.moderationStatus === "SUSPENDED") {
      return { ok: false, error: "PORTFOLIO_SUSPENDED" } as const;
    }
    // Policy: rollback only re-points a LIVE portfolio. Rolling back while
    // unpublished/draft would mean silently republishing a private portfolio —
    // disallowed; the owner must publish first.
    if (portfolio.publicationStatus !== "PUBLISHED") {
      return { ok: false, error: "NOT_PUBLISHED" } as const;
    }

    const currentActive = portfolio.activeVersion?.versionNumber ?? null;
    // Optimistic concurrency: a concurrent publish/rollback moved the pointer
    // since the client loaded → conflict, let it reload and retry.
    if (currentActive !== expectedActiveVersionNumber) {
      return { ok: false, error: "ROLLBACK_CONFLICT" } as const;
    }
    // Idempotent: rolling back to the already-active version is a success no-op.
    if (currentActive === targetVersionNumber) {
      return {
        ok: true,
        activeVersionNumber: currentActive,
        publicationStatus: "PUBLISHED",
        publishedAt: portfolio.publishedAt ?? new Date(),
        changed: false,
      } as const;
    }

    const target = await tx.portfolioVersion.findFirst({
      where: { portfolioId, versionNumber: targetVersionNumber },
      select: { id: true, schemaVersion: true, snapshot: true },
    });
    if (!target) {
      return { ok: false, error: "TARGET_NOT_FOUND" } as const;
    }
    // Exactly the renderability guard the public read applies, enforced against
    // the stored snapshot BEFORE the pointer moves — so a rollback can never put
    // a version live that the public page would then 404 as unrenderable.
    const parsedTarget = publishedSnapshotSchema.safeParse(target.snapshot);
    if (
      target.schemaVersion !== SNAPSHOT_SCHEMA_VERSION ||
      !parsedTarget.success ||
      !isTemplateVersionSupported(
        parsedTarget.data.portfolio.templateKey,
        parsedTarget.data.portfolio.templateVersion,
      )
    ) {
      return { ok: false, error: "TARGET_UNRENDERABLE" } as const;
    }

    const now = new Date();
    await tx.portfolio.update({
      where: { id: portfolioId },
      data: {
        activeVersionId: target.id,
        publishedAt: now,
        // publicationStatus stays PUBLISHED; draftRevision & nextVersionNumber
        // intentionally unchanged (the draft is preserved).
      },
    });

    return {
      ok: true,
      activeVersionNumber: targetVersionNumber,
      publicationStatus: "PUBLISHED",
      publishedAt: now,
      changed: true,
    } as const;
  }, TRANSACTION_OPTIONS);
}

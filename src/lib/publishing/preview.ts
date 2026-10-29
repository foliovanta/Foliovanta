import "server-only";

import { z } from "zod";

import { isSafeHttpUrl } from "@/components/public/format";
import { prisma } from "@/lib/db/prisma";
import { type PortfolioAccessError, resolveActiveUser } from "@/lib/portfolios/get-portfolios";
import { loadPortfolioDraftInput } from "@/lib/publishing/draft-loader";
import {
  type PortfolioDraftInput,
  type PublishedSnapshot,
  SNAPSHOT_SCHEMA_VERSION,
  buildSnapshot,
  isTemplateVersionSupported,
  publishedSnapshotSchema,
} from "@/lib/publishing/snapshot";

/**
 * Builds a renderable snapshot of the current SAVED draft for an owner-only
 * preview. Reuses the exact draft loader + snapshot builder the publish path
 * uses — so preview is visually representative of what publishing would produce
 * — but requires no publish readiness, writes no PortfolioVersion, and never
 * changes draftRevision. Deterministic for a given saved draft.
 */

const isEmail = (value: string | null): boolean =>
  value != null && z.email().safeParse(value).success;

// Publish readiness rejects an incomplete draft; preview must still render it.
// The strict snapshot schema only throws on a malformed public email or a
// non-http(s) URL, so those are the sole fields we relax to null here. Required
// relational fields (titles, org/role, institution, skill name) always exist.
function sanitizeForPreview(draft: PortfolioDraftInput): PortfolioDraftInput {
  return {
    ...draft,
    profile: draft.profile
      ? {
          ...draft.profile,
          emailPublic: isEmail(draft.profile.emailPublic) ? draft.profile.emailPublic : null,
        }
      : null,
    projects: draft.projects.map((project) => ({
      ...project,
      projectUrl: isSafeHttpUrl(project.projectUrl) ? project.projectUrl : null,
      repositoryUrl: isSafeHttpUrl(project.repositoryUrl) ? project.repositoryUrl : null,
    })),
  };
}

export type PreviewResult =
  | { ok: true; snapshot: PublishedSnapshot }
  | { ok: false; error: PortfolioAccessError | "NOT_FOUND" | "UNRENDERABLE" };

export async function buildDraftPreview(
  clerkUserId: string,
  portfolioId: string,
): Promise<PreviewResult> {
  const resolved = await resolveActiveUser(clerkUserId);
  if (!resolved.ok) {
    return resolved;
  }

  // Ownership + soft-delete in the predicate: another user's (or a deleted)
  // portfolio is indistinguishable from a nonexistent one.
  const portfolio = await prisma.portfolio.findFirst({
    where: { id: portfolioId, ownerId: resolved.userId, deletedAt: null },
    select: { id: true },
  });
  if (!portfolio) {
    return { ok: false, error: "NOT_FOUND" };
  }

  const draft = await loadPortfolioDraftInput(prisma, portfolioId);
  try {
    return { ok: true, snapshot: buildSnapshot(sanitizeForPreview(draft)) };
  } catch (error) {
    // A draft that still can't be snapshotted (e.g. an over-length field) is
    // shown as an explicit "can't preview" state rather than a blank page.
    console.error("Draft preview could not be built", error);
    return { ok: false, error: "UNRENDERABLE" };
  }
}

/**
 * Owner-only preview of an EXISTING immutable history version by its number.
 * Reads the stored snapshot read-only (no mutation, no republish) and renders
 * it through the same renderer as the live page. A version built under an
 * unsupported schema or template version is reported as UNRENDERABLE — shown as
 * an explicit "can't preview" state, never silently substituted with the draft
 * or active version. Applies the exact same validation as the public read.
 */
export async function buildVersionPreview(
  clerkUserId: string,
  portfolioId: string,
  versionNumber: number,
): Promise<PreviewResult> {
  const resolved = await resolveActiveUser(clerkUserId);
  if (!resolved.ok) {
    return resolved;
  }

  const portfolio = await prisma.portfolio.findFirst({
    where: { id: portfolioId, ownerId: resolved.userId, deletedAt: null },
    select: { id: true },
  });
  if (!portfolio) {
    return { ok: false, error: "NOT_FOUND" };
  }

  const version = await prisma.portfolioVersion.findFirst({
    where: { portfolioId, versionNumber },
    select: { schemaVersion: true, snapshot: true },
  });
  if (!version) {
    return { ok: false, error: "NOT_FOUND" };
  }

  if (version.schemaVersion !== SNAPSHOT_SCHEMA_VERSION) {
    return { ok: false, error: "UNRENDERABLE" };
  }
  const parsed = publishedSnapshotSchema.safeParse(version.snapshot);
  if (
    !parsed.success ||
    !isTemplateVersionSupported(parsed.data.portfolio.templateKey, parsed.data.portfolio.templateVersion)
  ) {
    return { ok: false, error: "UNRENDERABLE" };
  }
  return { ok: true, snapshot: parsed.data };
}

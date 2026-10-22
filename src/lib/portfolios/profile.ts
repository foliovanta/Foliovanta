import "server-only";

import { z } from "zod";

import { prisma } from "@/lib/db/prisma";
import { expectedRevisionSchema, mutateDraft } from "@/lib/portfolios/draft-mutation";
import { type PortfolioAccessError, resolveActiveUser } from "@/lib/portfolios/get-portfolios";

export const updatePortfolioProfileSchema = z.strictObject({
  expectedRevision: expectedRevisionSchema,
  displayName: z.string().trim().max(120).optional(),
  headline: z.string().trim().max(200).nullish(),
  bio: z.string().trim().max(5000).nullish(),
  location: z.string().trim().max(120).nullish(),
  avatarAssetId: z.uuid().nullish(),
  emailPublic: z.email().max(254).nullish(),
});

export type UpdatePortfolioProfileInput = z.infer<typeof updatePortfolioProfileSchema>;

export type ProfileDraft = {
  displayName: string;
  headline: string | null;
  bio: string | null;
  location: string | null;
  avatarAssetId: string | null;
  emailPublic: string | null;
  updatedAt: Date | null;
};

const profileSelect = {
  displayName: true,
  headline: true,
  bio: true,
  location: true,
  avatarAssetId: true,
  emailPublic: true,
  updatedAt: true,
} as const;

const emptyProfile: ProfileDraft = {
  displayName: "",
  headline: null,
  bio: null,
  location: null,
  avatarAssetId: null,
  emailPublic: null,
  updatedAt: null,
};

export async function getPortfolioProfile(
  clerkUserId: string,
  portfolioId: string,
): Promise<
  | { ok: true; profile: ProfileDraft; revision: bigint }
  | { ok: false; error: PortfolioAccessError | "NOT_FOUND" }
> {
  const resolved = await resolveActiveUser(clerkUserId);
  if (!resolved.ok) {
    return resolved;
  }

  // Ownership and soft-delete are part of the predicate, so another user's
  // (or a deleted) portfolio is indistinguishable from a nonexistent one.
  const portfolio = await prisma.portfolio.findFirst({
    where: { id: portfolioId, ownerId: resolved.userId, deletedAt: null },
    select: { draftRevision: true, profile: { select: profileSelect } },
  });

  if (!portfolio) {
    return { ok: false, error: "NOT_FOUND" };
  }

  return {
    ok: true,
    profile: portfolio.profile ?? emptyProfile,
    revision: portfolio.draftRevision,
  };
}

export async function updatePortfolioProfile(
  clerkUserId: string,
  portfolioId: string,
  input: UpdatePortfolioProfileInput,
): Promise<
  | { ok: true; profile: ProfileDraft; revision: bigint }
  | { ok: false; error: PortfolioAccessError | "NOT_FOUND" | "REVISION_CONFLICT" }
> {
  const { expectedRevision, ...fields } = input;

  // Only include keys the client actually sent. A present null clears a
  // nullable field; an absent key leaves it untouched. Conditional spreads
  // drop `undefined` so the data satisfies Prisma's exact-optional inputs.
  const data = {
    ...(fields.displayName !== undefined ? { displayName: fields.displayName } : {}),
    ...(fields.headline !== undefined ? { headline: fields.headline } : {}),
    ...(fields.bio !== undefined ? { bio: fields.bio } : {}),
    ...(fields.location !== undefined ? { location: fields.location } : {}),
    ...(fields.avatarAssetId !== undefined ? { avatarAssetId: fields.avatarAssetId } : {}),
    ...(fields.emailPublic !== undefined ? { emailPublic: fields.emailPublic } : {}),
  };

  const result = await mutateDraft(clerkUserId, portfolioId, expectedRevision, async (tx) => {
    const profile = await tx.portfolioProfile.upsert({
      where: { portfolioId },
      create: { portfolioId, ...data },
      update: data,
      select: profileSelect,
    });
    return { ok: true as const, value: profile };
  });

  if (!result.ok) {
    return result;
  }

  return { ok: true, profile: result.value, revision: result.revision };
}

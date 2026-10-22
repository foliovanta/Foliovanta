import "server-only";

import { z } from "zod";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { expectedRevisionSchema, mutateDraft } from "@/lib/portfolios/draft-mutation";
import { type PortfolioAccessError, resolveActiveUser } from "@/lib/portfolios/get-portfolios";

// Documented singleton section categories (BACKEND_SCHEMA.md §3.4). Keys are a
// fixed registry, never arbitrary user component names.
export const SECTION_KEYS = [
  "PROFILE",
  "ABOUT",
  "PROJECTS",
  "EXPERIENCE",
  "EDUCATION",
  "SKILLS",
  "CERTIFICATIONS",
  "CONTACT",
] as const;

export const sectionKeySchema = z.enum(SECTION_KEYS);
export type SectionKey = (typeof SECTION_KEYS)[number];

// shortcut: config has no approved schema yet (BACKEND_SCHEMA.md §3.4, "Open").
// Until the versioned config registry exists, accept only a bounded JSON object
// rather than unrestricted/unbounded JSON. Replace with the registry schema.
const sectionConfigSchema = z
  .record(z.string(), z.unknown())
  .refine((value) => JSON.stringify(value).length <= 4096, { message: "config exceeds 4KB" });

export const updateSectionSchema = z
  .strictObject({
    expectedRevision: expectedRevisionSchema,
    isVisible: z.boolean().optional(),
    position: z.number().int().min(0).optional(),
    layoutVariant: z.string().trim().max(64).nullish(),
    config: sectionConfigSchema.optional(),
  })
  .refine(
    (v) =>
      [v.isVisible, v.position, v.layoutVariant, v.config].some((value) => value !== undefined),
    { message: "At least one field to update is required" },
  );

export type UpdateSectionInput = z.infer<typeof updateSectionSchema>;

const sectionSelect = {
  id: true,
  sectionKey: true,
  isVisible: true,
  position: true,
  layoutVariant: true,
  config: true,
  createdAt: true,
  updatedAt: true,
} as const;

export type SectionRow = Prisma.PortfolioSectionGetPayload<{ select: typeof sectionSelect }>;

const order: Prisma.PortfolioSectionOrderByWithRelationInput[] = [
  { position: "asc" },
  { id: "asc" },
];

export async function listSections(
  clerkUserId: string,
  portfolioId: string,
): Promise<
  | { ok: true; sections: SectionRow[]; revision: bigint }
  | { ok: false; error: PortfolioAccessError | "NOT_FOUND" }
> {
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

  const sections = await prisma.portfolioSection.findMany({
    where: { portfolioId },
    orderBy: order,
    select: sectionSelect,
  });
  return { ok: true, sections, revision: portfolio.draftRevision };
}

export async function updateSection(
  clerkUserId: string,
  portfolioId: string,
  sectionKey: SectionKey,
  input: UpdateSectionInput,
) {
  const data = {
    ...(input.isVisible !== undefined ? { isVisible: input.isVisible } : {}),
    ...(input.position !== undefined ? { position: input.position } : {}),
    ...(input.layoutVariant !== undefined ? { layoutVariant: input.layoutVariant } : {}),
    ...(input.config !== undefined ? { config: input.config as Prisma.InputJsonValue } : {}),
  };

  const result = await mutateDraft(clerkUserId, portfolioId, input.expectedRevision, async (tx) => {
    const section = await tx.portfolioSection.upsert({
      where: { portfolioId_sectionKey: { portfolioId, sectionKey } },
      create: { portfolioId, sectionKey, ...data },
      update: data,
      select: sectionSelect,
    });
    return { ok: true as const, value: section };
  });

  if (!result.ok) {
    return result;
  }
  return { ok: true as const, section: result.value, revision: result.revision };
}

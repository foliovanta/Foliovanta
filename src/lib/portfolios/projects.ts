import "server-only";

import { z } from "zod";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { expectedRevisionSchema, mutateDraft } from "@/lib/portfolios/draft-mutation";
import { type PortfolioAccessError, resolveActiveUser } from "@/lib/portfolios/get-portfolios";

// shortcut: provisional per-portfolio project cap. UserEntitlement.maxProjects
// is not modeled yet (BACKEND_SCHEMA.md §3.9, deferred in M1 Step 4), so this
// uses the document's provisional value. Replace with the entitlement lookup
// once that model exists.
export const MAX_PROJECTS_PER_PORTFOLIO = 50;

const httpUrl = z
  .url()
  .max(2048)
  .refine((value) => /^https?:\/\//i.test(value), { message: "URL must use http(s)" });

export const createProjectSchema = z.strictObject({
  expectedRevision: expectedRevisionSchema,
  title: z.string().trim().min(1).max(200),
  summary: z.string().trim().max(500).nullish(),
  description: z.string().trim().max(5000).nullish(),
  projectUrl: httpUrl.nullish(),
  repositoryUrl: httpUrl.nullish(),
  coverAssetId: z.uuid().nullish(),
  isFeatured: z.boolean().optional(),
});

const UPDATABLE_KEYS = [
  "title",
  "summary",
  "description",
  "projectUrl",
  "repositoryUrl",
  "coverAssetId",
  "isFeatured",
] as const;

export const updateProjectSchema = z
  .strictObject({
    expectedRevision: expectedRevisionSchema,
    title: z.string().trim().min(1).max(200).optional(),
    summary: z.string().trim().max(500).nullish(),
    description: z.string().trim().max(5000).nullish(),
    projectUrl: httpUrl.nullish(),
    repositoryUrl: httpUrl.nullish(),
    coverAssetId: z.uuid().nullish(),
    isFeatured: z.boolean().optional(),
  })
  .refine((value) => UPDATABLE_KEYS.some((key) => value[key] !== undefined), {
    message: "At least one field to update is required",
  });

export const deleteProjectSchema = z.strictObject({
  expectedRevision: expectedRevisionSchema,
});

export const reorderProjectsSchema = z.strictObject({
  expectedRevision: expectedRevisionSchema,
  projectIds: z.array(z.uuid()).min(1).max(MAX_PROJECTS_PER_PORTFOLIO),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
export type ReorderProjectsInput = z.infer<typeof reorderProjectsSchema>;

const projectSelect = {
  id: true,
  title: true,
  summary: true,
  description: true,
  projectUrl: true,
  repositoryUrl: true,
  coverAssetId: true,
  isFeatured: true,
  position: true,
  createdAt: true,
  updatedAt: true,
} as const;

const projectOrder: Prisma.ProjectOrderByWithRelationInput[] = [{ position: "asc" }, { id: "asc" }];

export async function listProjects(
  clerkUserId: string,
  portfolioId: string,
): Promise<
  | { ok: true; projects: ProjectDraft[]; revision: bigint }
  | { ok: false; error: PortfolioAccessError | "NOT_FOUND" }
> {
  const resolved = await resolveActiveUser(clerkUserId);
  if (!resolved.ok) {
    return resolved;
  }

  const portfolio = await prisma.portfolio.findFirst({
    where: { id: portfolioId, ownerId: resolved.userId, deletedAt: null },
    select: {
      draftRevision: true,
      projects: { orderBy: projectOrder, select: projectSelect },
    },
  });

  if (!portfolio) {
    return { ok: false, error: "NOT_FOUND" };
  }

  return { ok: true, projects: portfolio.projects, revision: portfolio.draftRevision };
}

export type ProjectDraft = {
  id: string;
  title: string;
  summary: string | null;
  description: string | null;
  projectUrl: string | null;
  repositoryUrl: string | null;
  coverAssetId: string | null;
  isFeatured: boolean;
  position: number;
  createdAt: Date;
  updatedAt: Date;
};

export async function createProject(
  clerkUserId: string,
  portfolioId: string,
  input: CreateProjectInput,
) {
  const { expectedRevision, title, ...optional } = input;

  const data = {
    title,
    ...(optional.summary !== undefined ? { summary: optional.summary } : {}),
    ...(optional.description !== undefined ? { description: optional.description } : {}),
    ...(optional.projectUrl !== undefined ? { projectUrl: optional.projectUrl } : {}),
    ...(optional.repositoryUrl !== undefined ? { repositoryUrl: optional.repositoryUrl } : {}),
    ...(optional.coverAssetId !== undefined ? { coverAssetId: optional.coverAssetId } : {}),
    ...(optional.isFeatured !== undefined ? { isFeatured: optional.isFeatured } : {}),
  };

  const result = await mutateDraft(clerkUserId, portfolioId, expectedRevision, async (tx) => {
    const count = await tx.project.count({ where: { portfolioId } });
    if (count >= MAX_PROJECTS_PER_PORTFOLIO) {
      return { ok: false as const, error: "PROJECT_LIMIT_REACHED" as const };
    }

    const max = await tx.project.aggregate({
      where: { portfolioId },
      _max: { position: true },
    });
    const position = (max._max.position ?? -1) + 1;

    const project = await tx.project.create({
      data: { portfolioId, position, ...data },
      select: projectSelect,
    });
    return { ok: true as const, value: project };
  });

  if (!result.ok) {
    return result;
  }
  return { ok: true as const, project: result.value, revision: result.revision };
}

export async function updateProject(
  clerkUserId: string,
  portfolioId: string,
  projectId: string,
  input: UpdateProjectInput,
) {
  const { expectedRevision, ...fields } = input;

  const data = {
    ...(fields.title !== undefined ? { title: fields.title } : {}),
    ...(fields.summary !== undefined ? { summary: fields.summary } : {}),
    ...(fields.description !== undefined ? { description: fields.description } : {}),
    ...(fields.projectUrl !== undefined ? { projectUrl: fields.projectUrl } : {}),
    ...(fields.repositoryUrl !== undefined ? { repositoryUrl: fields.repositoryUrl } : {}),
    ...(fields.coverAssetId !== undefined ? { coverAssetId: fields.coverAssetId } : {}),
    ...(fields.isFeatured !== undefined ? { isFeatured: fields.isFeatured } : {}),
  };

  const result = await mutateDraft(clerkUserId, portfolioId, expectedRevision, async (tx) => {
    // Portfolio-scoped: another owner's project id cannot match this portfolio.
    const updated = await tx.project.updateMany({ where: { id: projectId, portfolioId }, data });
    if (updated.count === 0) {
      return { ok: false as const, error: "PROJECT_NOT_FOUND" as const };
    }

    const project = await tx.project.findFirstOrThrow({
      where: { id: projectId, portfolioId },
      select: projectSelect,
    });
    return { ok: true as const, value: project };
  });

  if (!result.ok) {
    return result;
  }
  return { ok: true as const, project: result.value, revision: result.revision };
}

export async function deleteProject(
  clerkUserId: string,
  portfolioId: string,
  projectId: string,
  expectedRevision: bigint,
) {
  const result = await mutateDraft(clerkUserId, portfolioId, expectedRevision, async (tx) => {
    const deleted = await tx.project.deleteMany({ where: { id: projectId, portfolioId } });
    if (deleted.count === 0) {
      return { ok: false as const, error: "PROJECT_NOT_FOUND" as const };
    }
    return { ok: true as const, value: { id: projectId } };
  });

  if (!result.ok) {
    return result;
  }
  return { ok: true as const, deletedId: result.value.id, revision: result.revision };
}

export async function reorderProjects(
  clerkUserId: string,
  portfolioId: string,
  input: ReorderProjectsInput,
) {
  const { expectedRevision, projectIds } = input;

  const result = await mutateDraft(clerkUserId, portfolioId, expectedRevision, async (tx) => {
    if (new Set(projectIds).size !== projectIds.length) {
      return { ok: false as const, error: "DUPLICATE_PROJECT_IDS" as const };
    }

    const existing = await tx.project.findMany({
      where: { portfolioId },
      select: { id: true },
    });
    const existingIds = new Set(existing.map((project) => project.id));

    // A reorder must be a full permutation of the portfolio's projects: reject
    // unknown ids and partial lists to avoid ambiguous ordering.
    const isFullPermutation =
      projectIds.length === existingIds.size && projectIds.every((id) => existingIds.has(id));
    if (!isFullPermutation) {
      return { ok: false as const, error: "UNKNOWN_PROJECT_IDS" as const };
    }

    for (const [index, id] of projectIds.entries()) {
      await tx.project.update({ where: { id }, data: { position: index } });
    }

    const projects = await tx.project.findMany({
      where: { portfolioId },
      orderBy: projectOrder,
      select: projectSelect,
    });
    return { ok: true as const, value: projects };
  });

  if (!result.ok) {
    return result;
  }
  return { ok: true as const, projects: result.value, revision: result.revision };
}

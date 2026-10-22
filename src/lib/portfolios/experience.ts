import "server-only";

import { z } from "zod";

import type { Prisma } from "@/generated/prisma/client";
import { expectedRevisionSchema } from "@/lib/portfolios/draft-mutation";
import {
  type ContentMutationError,
  defineRepeatableContent,
} from "@/lib/portfolios/repeatable-content";

// shortcut: provisional cap; UserEntitlement.maxExperiences is not modeled yet
// (BACKEND_SCHEMA.md §3.9, deferred in M1 Step 4). Uses the document's
// provisional value until the entitlement model exists.
const MAX_EXPERIENCES = 30;

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

export const createExperienceSchema = z.strictObject({
  expectedRevision: expectedRevisionSchema,
  organization: z.string().trim().min(1).max(200),
  roleTitle: z.string().trim().min(1).max(200),
  location: z.string().trim().max(200).nullish(),
  startDate: dateString.nullish(),
  endDate: dateString.nullish(),
  isCurrent: z.boolean().optional(),
  description: z.string().trim().max(5000).nullish(),
});

export const updateExperienceSchema = z
  .strictObject({
    expectedRevision: expectedRevisionSchema,
    organization: z.string().trim().min(1).max(200).optional(),
    roleTitle: z.string().trim().min(1).max(200).optional(),
    location: z.string().trim().max(200).nullish(),
    startDate: dateString.nullish(),
    endDate: dateString.nullish(),
    isCurrent: z.boolean().optional(),
    description: z.string().trim().max(5000).nullish(),
  })
  .refine(
    (v) =>
      [
        v.organization,
        v.roleTitle,
        v.location,
        v.startDate,
        v.endDate,
        v.isCurrent,
        v.description,
      ].some((value) => value !== undefined),
    { message: "At least one field to update is required" },
  );

export type CreateExperienceInput = z.infer<typeof createExperienceSchema>;
export type UpdateExperienceInput = z.infer<typeof updateExperienceSchema>;

const experienceSelect = {
  id: true,
  organization: true,
  roleTitle: true,
  location: true,
  startDate: true,
  endDate: true,
  isCurrent: true,
  description: true,
  position: true,
  createdAt: true,
  updatedAt: true,
} as const;

export type ExperienceRow = Prisma.ExperienceGetPayload<{ select: typeof experienceSelect }>;

const order: Prisma.ExperienceOrderByWithRelationInput[] = [{ position: "asc" }, { id: "asc" }];

const toDate = (value: string | null) => (value ? new Date(value) : null);
const toDateString = (value: Date | null) => (value ? value.toISOString().slice(0, 10) : null);

function experienceDateError(
  start: string | null,
  end: string | null,
  isCurrent: boolean,
): ContentMutationError | null {
  if (start && end && end < start) {
    return "INVALID_DATE_RANGE";
  }
  if (isCurrent && end) {
    return "CURRENT_WITH_END_DATE";
  }
  return null;
}

const service = defineRepeatableContent<
  ExperienceRow,
  CreateExperienceInput,
  UpdateExperienceInput
>({
  maxItems: MAX_EXPERIENCES,
  count: (tx, portfolioId) => tx.experience.count({ where: { portfolioId } }),
  maxPosition: (tx, portfolioId) =>
    tx.experience
      .aggregate({ where: { portfolioId }, _max: { position: true } })
      .then((result) => result._max.position),
  insert: (tx, portfolioId, position, input) =>
    tx.experience.create({
      data: {
        portfolioId,
        position,
        organization: input.organization,
        roleTitle: input.roleTitle,
        ...(input.location !== undefined ? { location: input.location } : {}),
        ...(input.startDate !== undefined ? { startDate: toDate(input.startDate) } : {}),
        ...(input.endDate !== undefined ? { endDate: toDate(input.endDate) } : {}),
        ...(input.isCurrent !== undefined ? { isCurrent: input.isCurrent } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
      },
      select: experienceSelect,
    }),
  patch: async (tx, portfolioId, id, input) => {
    await tx.experience.updateMany({
      where: { id, portfolioId },
      data: {
        ...(input.organization !== undefined ? { organization: input.organization } : {}),
        ...(input.roleTitle !== undefined ? { roleTitle: input.roleTitle } : {}),
        ...(input.location !== undefined ? { location: input.location } : {}),
        ...(input.startDate !== undefined ? { startDate: toDate(input.startDate) } : {}),
        ...(input.endDate !== undefined ? { endDate: toDate(input.endDate) } : {}),
        ...(input.isCurrent !== undefined ? { isCurrent: input.isCurrent } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
      },
    });
  },
  fetch: (client, portfolioId, id) =>
    client.experience.findFirst({ where: { id, portfolioId }, select: experienceSelect }),
  remove: (tx, portfolioId, id) =>
    tx.experience.deleteMany({ where: { id, portfolioId } }).then((result) => result.count),
  listIds: (tx, portfolioId) =>
    tx.experience
      .findMany({ where: { portfolioId }, select: { id: true } })
      .then((rows) => rows.map((row) => row.id)),
  setPosition: async (tx, id, position) => {
    await tx.experience.update({ where: { id }, data: { position } });
  },
  listOrdered: (client, portfolioId) =>
    client.experience.findMany({
      where: { portfolioId },
      orderBy: order,
      select: experienceSelect,
    }),
  validateCreate: (input) =>
    experienceDateError(input.startDate ?? null, input.endDate ?? null, input.isCurrent ?? false),
  validateUpdate: (existing, input) =>
    experienceDateError(
      input.startDate !== undefined ? input.startDate : toDateString(existing.startDate),
      input.endDate !== undefined ? input.endDate : toDateString(existing.endDate),
      input.isCurrent !== undefined ? input.isCurrent : existing.isCurrent,
    ),
});

export const {
  list: listExperiences,
  create: createExperience,
  update: updateExperience,
  remove: deleteExperience,
  reorder: reorderExperiences,
} = service;

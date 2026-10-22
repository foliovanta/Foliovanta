import "server-only";

import { z } from "zod";

import type { Prisma } from "@/generated/prisma/client";
import { expectedRevisionSchema } from "@/lib/portfolios/draft-mutation";
import {
  type ContentMutationError,
  defineRepeatableContent,
} from "@/lib/portfolios/repeatable-content";

// shortcut: provisional cap; UserEntitlement.maxEducation not modeled yet
// (BACKEND_SCHEMA.md §3.9, deferred in M1 Step 4).
const MAX_EDUCATION = 30;

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

export const createEducationSchema = z.strictObject({
  expectedRevision: expectedRevisionSchema,
  institution: z.string().trim().min(1).max(200),
  degree: z.string().trim().max(200).nullish(),
  fieldOfStudy: z.string().trim().max(200).nullish(),
  startDate: dateString.nullish(),
  endDate: dateString.nullish(),
  description: z.string().trim().max(5000).nullish(),
});

export const updateEducationSchema = z
  .strictObject({
    expectedRevision: expectedRevisionSchema,
    institution: z.string().trim().min(1).max(200).optional(),
    degree: z.string().trim().max(200).nullish(),
    fieldOfStudy: z.string().trim().max(200).nullish(),
    startDate: dateString.nullish(),
    endDate: dateString.nullish(),
    description: z.string().trim().max(5000).nullish(),
  })
  .refine(
    (v) =>
      [v.institution, v.degree, v.fieldOfStudy, v.startDate, v.endDate, v.description].some(
        (value) => value !== undefined,
      ),
    { message: "At least one field to update is required" },
  );

export type CreateEducationInput = z.infer<typeof createEducationSchema>;
export type UpdateEducationInput = z.infer<typeof updateEducationSchema>;

const educationSelect = {
  id: true,
  institution: true,
  degree: true,
  fieldOfStudy: true,
  startDate: true,
  endDate: true,
  description: true,
  position: true,
  createdAt: true,
  updatedAt: true,
} as const;

export type EducationRow = Prisma.EducationGetPayload<{ select: typeof educationSelect }>;

const order: Prisma.EducationOrderByWithRelationInput[] = [{ position: "asc" }, { id: "asc" }];

const toDate = (value: string | null) => (value ? new Date(value) : null);
const toDateString = (value: Date | null) => (value ? value.toISOString().slice(0, 10) : null);

function educationDateError(start: string | null, end: string | null): ContentMutationError | null {
  if (start && end && end < start) {
    return "INVALID_DATE_RANGE";
  }
  return null;
}

const service = defineRepeatableContent<EducationRow, CreateEducationInput, UpdateEducationInput>({
  maxItems: MAX_EDUCATION,
  count: (tx, portfolioId) => tx.education.count({ where: { portfolioId } }),
  maxPosition: (tx, portfolioId) =>
    tx.education
      .aggregate({ where: { portfolioId }, _max: { position: true } })
      .then((result) => result._max.position),
  insert: (tx, portfolioId, position, input) =>
    tx.education.create({
      data: {
        portfolioId,
        position,
        institution: input.institution,
        ...(input.degree !== undefined ? { degree: input.degree } : {}),
        ...(input.fieldOfStudy !== undefined ? { fieldOfStudy: input.fieldOfStudy } : {}),
        ...(input.startDate !== undefined ? { startDate: toDate(input.startDate) } : {}),
        ...(input.endDate !== undefined ? { endDate: toDate(input.endDate) } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
      },
      select: educationSelect,
    }),
  patch: async (tx, portfolioId, id, input) => {
    await tx.education.updateMany({
      where: { id, portfolioId },
      data: {
        ...(input.institution !== undefined ? { institution: input.institution } : {}),
        ...(input.degree !== undefined ? { degree: input.degree } : {}),
        ...(input.fieldOfStudy !== undefined ? { fieldOfStudy: input.fieldOfStudy } : {}),
        ...(input.startDate !== undefined ? { startDate: toDate(input.startDate) } : {}),
        ...(input.endDate !== undefined ? { endDate: toDate(input.endDate) } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
      },
    });
  },
  fetch: (client, portfolioId, id) =>
    client.education.findFirst({ where: { id, portfolioId }, select: educationSelect }),
  remove: (tx, portfolioId, id) =>
    tx.education.deleteMany({ where: { id, portfolioId } }).then((result) => result.count),
  listIds: (tx, portfolioId) =>
    tx.education
      .findMany({ where: { portfolioId }, select: { id: true } })
      .then((rows) => rows.map((row) => row.id)),
  setPosition: async (tx, id, position) => {
    await tx.education.update({ where: { id }, data: { position } });
  },
  listOrdered: (client, portfolioId) =>
    client.education.findMany({ where: { portfolioId }, orderBy: order, select: educationSelect }),
  validateCreate: (input) => educationDateError(input.startDate ?? null, input.endDate ?? null),
  validateUpdate: (existing, input) =>
    educationDateError(
      input.startDate !== undefined ? input.startDate : toDateString(existing.startDate),
      input.endDate !== undefined ? input.endDate : toDateString(existing.endDate),
    ),
});

export const {
  list: listEducation,
  create: createEducation,
  update: updateEducation,
  remove: deleteEducation,
  reorder: reorderEducation,
} = service;

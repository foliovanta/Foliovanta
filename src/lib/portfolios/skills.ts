import "server-only";

import { z } from "zod";

import type { Prisma } from "@/generated/prisma/client";
import { expectedRevisionSchema } from "@/lib/portfolios/draft-mutation";
import { defineRepeatableContent } from "@/lib/portfolios/repeatable-content";

// shortcut: provisional cap; UserEntitlement.maxSkills not modeled yet
// (BACKEND_SCHEMA.md §3.9, deferred in M1 Step 4).
const MAX_SKILLS = 100;

export const createSkillSchema = z.strictObject({
  expectedRevision: expectedRevisionSchema,
  name: z.string().trim().min(1).max(100),
  category: z.string().trim().max(100).nullish(),
  proficiency: z.string().trim().max(50).nullish(),
});

export const updateSkillSchema = z
  .strictObject({
    expectedRevision: expectedRevisionSchema,
    name: z.string().trim().min(1).max(100).optional(),
    category: z.string().trim().max(100).nullish(),
    proficiency: z.string().trim().max(50).nullish(),
  })
  .refine((v) => [v.name, v.category, v.proficiency].some((value) => value !== undefined), {
    message: "At least one field to update is required",
  });

export type CreateSkillInput = z.infer<typeof createSkillSchema>;
export type UpdateSkillInput = z.infer<typeof updateSkillSchema>;

const skillSelect = {
  id: true,
  name: true,
  category: true,
  proficiency: true,
  position: true,
  createdAt: true,
  updatedAt: true,
} as const;

export type SkillRow = Prisma.SkillGetPayload<{ select: typeof skillSelect }>;

const order: Prisma.SkillOrderByWithRelationInput[] = [{ position: "asc" }, { id: "asc" }];

const service = defineRepeatableContent<SkillRow, CreateSkillInput, UpdateSkillInput>({
  maxItems: MAX_SKILLS,
  count: (tx, portfolioId) => tx.skill.count({ where: { portfolioId } }),
  maxPosition: (tx, portfolioId) =>
    tx.skill
      .aggregate({ where: { portfolioId }, _max: { position: true } })
      .then((result) => result._max.position),
  insert: (tx, portfolioId, position, input) =>
    tx.skill.create({
      data: {
        portfolioId,
        position,
        name: input.name,
        ...(input.category !== undefined ? { category: input.category } : {}),
        ...(input.proficiency !== undefined ? { proficiency: input.proficiency } : {}),
      },
      select: skillSelect,
    }),
  patch: async (tx, portfolioId, id, input) => {
    await tx.skill.updateMany({
      where: { id, portfolioId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.category !== undefined ? { category: input.category } : {}),
        ...(input.proficiency !== undefined ? { proficiency: input.proficiency } : {}),
      },
    });
  },
  fetch: (client, portfolioId, id) =>
    client.skill.findFirst({ where: { id, portfolioId }, select: skillSelect }),
  remove: (tx, portfolioId, id) =>
    tx.skill.deleteMany({ where: { id, portfolioId } }).then((result) => result.count),
  listIds: (tx, portfolioId) =>
    tx.skill
      .findMany({ where: { portfolioId }, select: { id: true } })
      .then((rows) => rows.map((row) => row.id)),
  setPosition: async (tx, id, position) => {
    await tx.skill.update({ where: { id }, data: { position } });
  },
  listOrdered: (client, portfolioId) =>
    client.skill.findMany({ where: { portfolioId }, orderBy: order, select: skillSelect }),
});

export const {
  list: listSkills,
  create: createSkill,
  update: updateSkill,
  remove: deleteSkill,
  reorder: reorderSkills,
} = service;

import { createHandler, listHandler } from "@/lib/portfolios/content-routes";
import {
  createExperience,
  createExperienceSchema,
  listExperiences,
} from "@/lib/portfolios/experience";

export const runtime = "nodejs";

export const GET = listHandler(listExperiences, "experiences");
export const POST = createHandler(createExperienceSchema, createExperience, "experience");

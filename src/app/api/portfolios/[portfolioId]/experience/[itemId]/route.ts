import { deleteHandler, updateHandler } from "@/lib/portfolios/content-routes";
import {
  deleteExperience,
  updateExperience,
  updateExperienceSchema,
} from "@/lib/portfolios/experience";

export const runtime = "nodejs";

export const PATCH = updateHandler(updateExperienceSchema, updateExperience, "experience");
export const DELETE = deleteHandler(deleteExperience, "experience");

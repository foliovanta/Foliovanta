import { deleteHandler, updateHandler } from "@/lib/portfolios/content-routes";
import {
  deleteEducation,
  updateEducation,
  updateEducationSchema,
} from "@/lib/portfolios/education";

export const runtime = "nodejs";

export const PATCH = updateHandler(updateEducationSchema, updateEducation, "education");
export const DELETE = deleteHandler(deleteEducation, "education");

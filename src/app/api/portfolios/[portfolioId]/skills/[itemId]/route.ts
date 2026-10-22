import { deleteHandler, updateHandler } from "@/lib/portfolios/content-routes";
import { deleteSkill, updateSkill, updateSkillSchema } from "@/lib/portfolios/skills";

export const runtime = "nodejs";

export const PATCH = updateHandler(updateSkillSchema, updateSkill, "skill");
export const DELETE = deleteHandler(deleteSkill, "skill");

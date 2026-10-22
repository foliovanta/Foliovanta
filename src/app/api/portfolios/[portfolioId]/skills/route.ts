import { createHandler, listHandler } from "@/lib/portfolios/content-routes";
import { createSkill, createSkillSchema, listSkills } from "@/lib/portfolios/skills";

export const runtime = "nodejs";

export const GET = listHandler(listSkills, "skills");
export const POST = createHandler(createSkillSchema, createSkill, "skill");

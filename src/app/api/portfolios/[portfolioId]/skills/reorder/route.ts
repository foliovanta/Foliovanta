import { reorderHandler } from "@/lib/portfolios/content-routes";
import { reorderSkills } from "@/lib/portfolios/skills";

export const runtime = "nodejs";

export const PATCH = reorderHandler(reorderSkills, "skills");

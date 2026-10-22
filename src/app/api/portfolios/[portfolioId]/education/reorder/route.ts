import { reorderHandler } from "@/lib/portfolios/content-routes";
import { reorderEducation } from "@/lib/portfolios/education";

export const runtime = "nodejs";

export const PATCH = reorderHandler(reorderEducation, "education");

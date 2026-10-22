import { reorderHandler } from "@/lib/portfolios/content-routes";
import { reorderExperiences } from "@/lib/portfolios/experience";

export const runtime = "nodejs";

export const PATCH = reorderHandler(reorderExperiences, "experiences");

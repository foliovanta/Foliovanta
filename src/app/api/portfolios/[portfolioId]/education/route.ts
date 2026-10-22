import { createHandler, listHandler } from "@/lib/portfolios/content-routes";
import { createEducation, createEducationSchema, listEducation } from "@/lib/portfolios/education";

export const runtime = "nodejs";

export const GET = listHandler(listEducation, "education");
export const POST = createHandler(createEducationSchema, createEducation, "education");

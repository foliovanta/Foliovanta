import type { MetadataRoute } from "next";

import { listIndexablePortfolios } from "@/lib/publishing/public-read";
import { publicPortfolioUrl } from "@/lib/urls/public-url";

export const runtime = "nodejs";
// Reflect publish/unpublish/moderation changes; never statically cached.
export const dynamic = "force-dynamic";

/**
 * Only currently public portfolios, at their canonical /{publicSlug}/{username}
 * URL on the configured origin. No draft/preview/legacy routes, no soft-deleted
 * or suspended content. For very large counts, split with generateSitemaps()
 * (documented in docs/decisions/M3-5-SEO.md); a single file holds up to 50k.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const portfolios = await listIndexablePortfolios();
  return portfolios.map((portfolio) => ({
    url: publicPortfolioUrl(portfolio.publicSlug, portfolio.username),
    ...(portfolio.lastModified ? { lastModified: portfolio.lastModified } : {}),
    changeFrequency: "weekly",
    priority: 0.7,
  }));
}

import { notFound, redirect } from "next/navigation";

import { getPublicPortfolio } from "@/lib/publishing/public-read";
import { publicPortfolioPath } from "@/lib/urls/public-url";

export const runtime = "nodejs";
// Resolve live each time so a portfolio that becomes hidden stops redirecting
// immediately and never leaks a canonical URL for a non-public portfolio.
export const dynamic = "force-dynamic";

/**
 * Legacy public URL. Portfolios now live at /{publicSlug}/{username}; keep old
 * /p/{slug} links working by redirecting to the canonical URL — but ONLY when
 * the portfolio is publicly visible. Otherwise a uniform 404, so the redirect
 * never reveals that a private/suspended portfolio exists.
 *
 * TEMPORARY (307) redirect: the canonical target includes the editable username,
 * so a permanent redirect could be cached pointing at a now-stale username.
 */
export default async function LegacyPublicPortfolioPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const result = await getPublicPortfolio(slug);
  if (!result.ok) {
    notFound();
  }
  redirect(publicPortfolioPath(result.publicSlug, result.username));
}

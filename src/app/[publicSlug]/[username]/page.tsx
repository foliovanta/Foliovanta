import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";

import { PortfolioRenderer } from "@/components/public/portfolio-renderer";
import { ReportPortfolio } from "@/components/public/report-portfolio";
import { getPublicPortfolioByUserSlug } from "@/lib/publishing/public-read";
import type { PublishedSnapshot } from "@/lib/publishing/snapshot";
import { publicPortfolioPath, publicPortfolioUrl } from "@/lib/urls/public-url";

export const runtime = "nodejs";
// no-store until cache invalidation + moderation busting are designed; a hidden
// or suspended portfolio must stop resolving immediately.
export const dynamic = "force-dynamic";

// Deduplicates the read between generateMetadata and the page within one request.
const loadPortfolio = cache((publicSlug: string) => getPublicPortfolioByUserSlug(publicSlug));

export async function generateMetadata({
  params,
}: {
  params: Promise<{ publicSlug: string; username: string }>;
}): Promise<Metadata> {
  const { publicSlug } = await params;
  const result = await loadPortfolio(publicSlug);

  if (!result.ok) {
    // Non-visible portfolios must never be indexed.
    return { title: "Portfolio not found", robots: { index: false, follow: false } };
  }

  const { profile } = result.snapshot;
  const title = profile.headline
    ? `${profile.displayName} — ${profile.headline}`
    : profile.displayName;
  const description = (profile.bio ?? profile.headline ?? `${profile.displayName}'s portfolio`)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
  // Canonical always points at the CURRENT username, so a renamed portfolio
  // never produces duplicate indexed URLs (stale usernames 308 → canonical).
  const canonical = publicPortfolioUrl(result.publicSlug, result.username);

  return {
    title,
    description,
    alternates: { canonical },
    // og:image / twitter:image are supplied automatically by the colocated
    // opengraph-image route.
    openGraph: { title, description, url: canonical, type: "profile" },
    twitter: { card: "summary_large_image", title, description },
    robots: { index: true, follow: true },
  };
}

// Conservative schema.org: only the published name, canonical URL, and an
// optional description from the published headline/bio. No invented employers,
// education, or social profiles. Escaped so it can't break out of the <script>.
function buildPersonJsonLd(profile: PublishedSnapshot["profile"], canonical: string): string {
  const description = (profile.headline ?? profile.bio ?? "")
    ?.replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
  const data = {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    mainEntity: {
      "@type": "Person",
      name: profile.displayName,
      url: canonical,
      ...(description ? { description } : {}),
    },
  };
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

export default async function PublicPortfolioPage({
  params,
}: {
  params: Promise<{ publicSlug: string; username: string }>;
}) {
  const { publicSlug, username } = await params;
  const result = await loadPortfolio(publicSlug);
  if (!result.ok) {
    notFound();
  }

  // Canonicalize the username segment. A TEMPORARY (307) redirect: usernames
  // are editable, so a permanent redirect could be cached pointing at a target
  // that later changes. The <link rel="canonical"> above handles SEO dedup.
  // Only reached for publicly visible portfolios, so it never leaks existence.
  if (decodeURIComponent(username) !== result.username) {
    redirect(publicPortfolioPath(result.publicSlug, result.username));
  }

  const jsonLd = buildPersonJsonLd(
    result.snapshot.profile,
    publicPortfolioUrl(result.publicSlug, result.username),
  );

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
      <PortfolioRenderer snapshot={result.snapshot} />
      <ReportPortfolio publicSlug={result.publicSlug} />
    </>
  );
}

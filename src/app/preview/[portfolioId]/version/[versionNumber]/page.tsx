import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";

import { PortfolioRenderer } from "@/components/public/portfolio-renderer";
import { buildVersionPreview } from "@/lib/publishing/preview";

export const runtime = "nodejs";
// Private, owner-only historical content: never statically generated or cached.
export const dynamic = "force-dynamic";

// Historical preview content must never be indexed or carry public SEO metadata.
export const metadata: Metadata = {
  title: "Version preview",
  robots: { index: false, follow: false },
};

export default async function VersionPreviewFramePage({
  params,
}: {
  params: Promise<{ portfolioId: string; versionNumber: string }>;
}) {
  const { portfolioId, versionNumber } = await params;
  if (!z.uuid().safeParse(portfolioId).success) {
    notFound();
  }
  const parsedVersion = z.coerce.number().int().positive().safeParse(versionNumber);
  if (!parsedVersion.success) {
    notFound();
  }

  // Middleware already requires authentication for /preview; this is defense in
  // depth and the owner check happens in buildVersionPreview.
  const { userId } = await auth();
  if (!userId) {
    notFound();
  }

  const result = await buildVersionPreview(userId, portfolioId, parsedVersion.data);
  if (!result.ok) {
    if (result.error === "UNRENDERABLE") {
      return <VersionPreviewUnavailable />;
    }
    // NOT_FOUND / access errors collapse to a uniform 404 — never reveal whether
    // another user's portfolio or version exists.
    notFound();
  }

  return <PortfolioRenderer snapshot={result.snapshot} />;
}

function VersionPreviewUnavailable() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-white p-8 text-center dark:bg-zinc-950">
      <div className="max-w-sm">
        <h1 className="text-lg font-medium text-zinc-900 dark:text-zinc-100">
          This version can&apos;t be previewed
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          It was published with a template or format this version of Foliovanta no longer supports,
          so it can&apos;t be rendered or rolled back to.
        </p>
      </div>
    </main>
  );
}

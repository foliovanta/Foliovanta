import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";

import { PortfolioRenderer } from "@/components/public/portfolio-renderer";
import { buildDraftPreview } from "@/lib/publishing/preview";

export const runtime = "nodejs";
// Private draft content: never statically generated or cached.
export const dynamic = "force-dynamic";

// Draft content must never be indexed or carry public SEO metadata.
export const metadata: Metadata = {
  title: "Draft preview",
  robots: { index: false, follow: false },
};

export default async function PreviewFramePage({
  params,
}: {
  params: Promise<{ portfolioId: string }>;
}) {
  const { portfolioId } = await params;
  if (!z.uuid().safeParse(portfolioId).success) {
    notFound();
  }

  // Middleware already requires authentication for /preview; this is defense in
  // depth and the owner check happens in buildDraftPreview.
  const { userId } = await auth();
  if (!userId) {
    notFound();
  }

  const result = await buildDraftPreview(userId, portfolioId);
  if (!result.ok) {
    if (result.error === "UNRENDERABLE") {
      return <PreviewUnavailable />;
    }
    // NOT_FOUND / access errors collapse to a uniform 404 — never reveal whether
    // another user's portfolio exists.
    notFound();
  }

  return <PortfolioRenderer snapshot={result.snapshot} />;
}

function PreviewUnavailable() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-white p-8 text-center dark:bg-zinc-950">
      <div className="max-w-sm">
        <h1 className="text-lg font-medium text-zinc-900 dark:text-zinc-100">
          This draft can&apos;t be previewed yet
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Something in the draft isn&apos;t ready to render. Return to the editor and check your
          most recent changes.
        </p>
      </div>
    </main>
  );
}

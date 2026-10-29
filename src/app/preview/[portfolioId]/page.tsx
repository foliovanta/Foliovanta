import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";

import { getPortfolioById } from "@/lib/portfolios/get-portfolios";
import { PreviewWorkspace } from "./preview-workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Draft preview · Foliovanta",
  robots: { index: false, follow: false },
};

export default async function PreviewPage({
  params,
}: {
  params: Promise<{ portfolioId: string }>;
}) {
  const { portfolioId } = await params;
  if (!z.uuid().safeParse(portfolioId).success) {
    notFound();
  }

  const { userId } = await auth();
  if (!userId) {
    notFound();
  }

  // Authorize the owner up front (ACTIVE account, not soft-deleted). A non-owner
  // or missing portfolio is a uniform 404.
  const result = await getPortfolioById(userId, portfolioId);
  if (!result.ok) {
    notFound();
  }

  return <PreviewWorkspace portfolioId={portfolioId} />;
}

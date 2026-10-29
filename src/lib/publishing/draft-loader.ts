import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { designConfigSchema } from "@/lib/design/config";
import type { PortfolioDraftInput } from "@/lib/publishing/snapshot";

type Tx = Prisma.TransactionClient;

// Normalize the stored design into the snapshot theme. An uncustomized portfolio
// (design = null) publishes an EMPTY theme — identical to pre-M3.2 snapshots, so
// publishing stays a true no-op and the public resolver applies template
// defaults. Only a valid custom design is carried through; invalid stored data
// degrades to defaults rather than failing the publish.
function normalizeDesignTheme(design: unknown): Record<string, unknown> {
  if (design == null) return {};
  const parsed = designConfigSchema.safeParse(design);
  return parsed.success ? parsed.data : {};
}

const order: Prisma.ProjectOrderByWithRelationInput[] = [{ position: "asc" }, { id: "asc" }];

/**
 * Assembles the complete PortfolioDraftInput from the owner's draft tables.
 * Intended to run inside the publish transaction (after the portfolio row is
 * locked) so the snapshot reflects one consistent draft state. Never exposed as
 * an endpoint. Template/theme default (no PortfolioDesign model yet).
 */
export async function loadPortfolioDraftInput(
  client: Tx,
  portfolioId: string,
): Promise<PortfolioDraftInput> {
  const portfolio = await client.portfolio.findUniqueOrThrow({
    where: { id: portfolioId },
    select: { slug: true, templateKey: true, templateVersion: true, design: true },
  });

  const [profile, sections, projects, experience, education, skills] = await Promise.all([
    client.portfolioProfile.findUnique({
      where: { portfolioId },
      select: {
        displayName: true,
        headline: true,
        bio: true,
        location: true,
        avatarAssetId: true,
        emailPublic: true,
      },
    }),
    client.portfolioSection.findMany({
      where: { portfolioId },
      select: { sectionKey: true, isVisible: true, position: true, layoutVariant: true },
      orderBy: order,
    }),
    client.project.findMany({
      where: { portfolioId },
      select: {
        id: true,
        title: true,
        summary: true,
        description: true,
        projectUrl: true,
        repositoryUrl: true,
        coverAssetId: true,
        isFeatured: true,
        position: true,
      },
      orderBy: order,
    }),
    client.experience.findMany({
      where: { portfolioId },
      select: {
        id: true,
        organization: true,
        roleTitle: true,
        location: true,
        startDate: true,
        endDate: true,
        isCurrent: true,
        description: true,
        position: true,
      },
      orderBy: order,
    }),
    client.education.findMany({
      where: { portfolioId },
      select: {
        id: true,
        institution: true,
        degree: true,
        fieldOfStudy: true,
        startDate: true,
        endDate: true,
        description: true,
        position: true,
      },
      orderBy: order,
    }),
    client.skill.findMany({
      where: { portfolioId },
      select: { id: true, name: true, category: true, proficiency: true, position: true },
      orderBy: order,
    }),
  ]);

  return {
    slug: portfolio.slug,
    templateKey: portfolio.templateKey,
    templateVersion: portfolio.templateVersion,
    theme: normalizeDesignTheme(portfolio.design),
    profile,
    sections,
    projects,
    experience,
    education,
    skills,
  };
}

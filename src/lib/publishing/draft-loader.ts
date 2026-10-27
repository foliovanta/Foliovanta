import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import type { PortfolioDraftInput } from "@/lib/publishing/snapshot";

type Tx = Prisma.TransactionClient;

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
    select: { slug: true },
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
    templateKey: null,
    templateVersion: null,
    theme: null,
    profile,
    sections,
    projects,
    experience,
    education,
    skills,
  };
}

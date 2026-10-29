import "server-only";

import { prisma } from "@/lib/db/prisma";
import { mutateDraft } from "@/lib/portfolios/draft-mutation";
import { type PortfolioAccessError, resolveActiveUser } from "@/lib/portfolios/get-portfolios";
import {
  type DesignConfig,
  defaultDesignForTemplate,
  designConfigSchema,
} from "@/lib/design/config";
import { TEMPLATE_KEYS, type TemplateKey } from "@/lib/publishing/snapshot";

export type UpdateDesignError = "INVALID_DESIGN";

function asTemplateKey(value: string): TemplateKey {
  return (TEMPLATE_KEYS as readonly string[]).includes(value) ? (value as TemplateKey) : "minimal";
}

export type DesignState = {
  design: DesignConfig;
  templateKey: TemplateKey;
  revision: bigint;
};

export type DesignStateResult =
  { ok: true; state: DesignState } | { ok: false; error: PortfolioAccessError | "NOT_FOUND" };

/**
 * Owner-scoped read of the current draft design. A portfolio with no saved
 * design (null) returns its template's identity defaults, so the editor always
 * has a full config to render.
 */
export async function getDesignState(
  clerkUserId: string,
  portfolioId: string,
): Promise<DesignStateResult> {
  const resolved = await resolveActiveUser(clerkUserId);
  if (!resolved.ok) {
    return resolved;
  }

  const portfolio = await prisma.portfolio.findFirst({
    where: { id: portfolioId, ownerId: resolved.userId, deletedAt: null },
    select: { templateKey: true, design: true, draftRevision: true },
  });
  if (!portfolio) {
    return { ok: false, error: "NOT_FOUND" };
  }

  const templateKey = asTemplateKey(portfolio.templateKey);
  const parsed = designConfigSchema.safeParse(portfolio.design);
  const design = parsed.success ? parsed.data : defaultDesignForTemplate(templateKey);

  return { ok: true, state: { design, templateKey, revision: portfolio.draftRevision } };
}

/**
 * Persist a validated design under optimistic concurrency. Rejecting an invalid
 * config before touching the revision keeps a bad payload a clean 400. Design
 * changes never affect published versions — the live design changes only on a
 * successful publish.
 */
export async function updateDesign(
  clerkUserId: string,
  portfolioId: string,
  expectedRevision: bigint,
  rawDesign: unknown,
) {
  const parsed = designConfigSchema.safeParse(rawDesign);
  if (!parsed.success) {
    return { ok: false as const, error: "INVALID_DESIGN" as const };
  }
  const design = parsed.data;

  return mutateDraft<{ design: DesignConfig }, UpdateDesignError>(
    clerkUserId,
    portfolioId,
    expectedRevision,
    async (tx) => {
      // Ownership + soft-delete already enforced by the revision bump.
      await tx.portfolio.update({ where: { id: portfolioId }, data: { design } });
      return { ok: true, value: { design } };
    },
  );
}

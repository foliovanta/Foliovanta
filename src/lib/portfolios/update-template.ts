import "server-only";

import { mutateDraft } from "@/lib/portfolios/draft-mutation";
import {
  CURRENT_TEMPLATE_VERSION,
  TEMPLATE_KEYS,
  type TemplateKey,
} from "@/lib/publishing/snapshot";

export type UpdateTemplateError = "INVALID_TEMPLATE";

function isTemplateKey(value: string): value is TemplateKey {
  return (TEMPLATE_KEYS as readonly string[]).includes(value);
}

/**
 * Persist the draft's selected template under optimistic concurrency. Changing
 * the draft template never touches published versions — the live template only
 * changes on a successful publish, which snapshots the then-current selection.
 * The template's current version is persisted alongside the key.
 */
export async function updateTemplate(
  clerkUserId: string,
  portfolioId: string,
  expectedRevision: bigint,
  rawTemplateKey: string,
) {
  if (!isTemplateKey(rawTemplateKey)) {
    // Validate before touching the revision so a bad key is a clean 400 and the
    // draft is never bumped.
    return { ok: false as const, error: "INVALID_TEMPLATE" as const };
  }
  const templateKey = rawTemplateKey;

  return mutateDraft<{ templateKey: TemplateKey }, UpdateTemplateError>(
    clerkUserId,
    portfolioId,
    expectedRevision,
    async (tx) => {
      // Ownership + soft-delete are already enforced by mutateDraft's revision
      // bump in this same transaction, so a bare unique-id update is safe here.
      await tx.portfolio.update({
        where: { id: portfolioId },
        data: { templateKey, templateVersion: CURRENT_TEMPLATE_VERSION[templateKey] },
      });
      return { ok: true, value: { templateKey } };
    },
  );
}

import type { PublishedSnapshot } from "@/lib/publishing/snapshot";
import { isRenderable, resolveTemplate } from "@/components/public/templates";

/**
 * Entry point for public rendering. Resolves the template from the snapshot's
 * templateKey (logging the intentional Minimal fallback for unbuilt templates)
 * and renders it only when the resolved template supports the snapshot's schema
 * and template versions. public-read already gates schemaVersion; the version
 * guard here is defensive against deploy skew and never produces wrong output.
 */
export function PortfolioRenderer({ snapshot }: { snapshot: PublishedSnapshot }) {
  const { portfolio, schemaVersion } = snapshot;
  const { template, isFallback } = resolveTemplate(portfolio.templateKey);

  if (isFallback) {
    console.warn("[public] template not built; rendering Minimal fallback", {
      templateKey: portfolio.templateKey,
    });
  }

  if (!isRenderable(template, portfolio.templateVersion, schemaVersion)) {
    console.error("[public] snapshot not renderable by resolved template", {
      templateKey: portfolio.templateKey,
      templateVersion: portfolio.templateVersion,
      schemaVersion,
    });
    return null;
  }

  return template.render({ snapshot });
}

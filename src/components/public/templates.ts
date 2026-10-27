import type { ReactNode } from "react";

import {
  SNAPSHOT_SCHEMA_VERSION,
  type PublishedSnapshot,
  type TemplateKey,
} from "@/lib/publishing/snapshot";
import { MinimalTemplate } from "@/components/public/minimal-template";

export type PortfolioTemplateProps = { snapshot: PublishedSnapshot };

export type PortfolioTemplate = {
  key: TemplateKey;
  // Forward-looking versioning: a template declares which snapshot schema
  // versions AND which template versions it can render. Multi-version routing
  // (serving an older template version alongside a newer one) is intentionally
  // NOT built yet — this contract just lets the renderer detect an unrenderable
  // snapshot instead of producing wrong output.
  supportedSchemaVersions: readonly number[];
  supportedTemplateVersions: readonly string[];
  render: (props: PortfolioTemplateProps) => ReactNode;
};

const TEMPLATES: Partial<Record<TemplateKey, PortfolioTemplate>> = {
  minimal: {
    key: "minimal",
    supportedSchemaVersions: [SNAPSHOT_SCHEMA_VERSION],
    supportedTemplateVersions: ["1.0.0"],
    render: MinimalTemplate,
  },
};

const FALLBACK_TEMPLATE = TEMPLATES.minimal!;

export type TemplateResolution = { template: PortfolioTemplate; isFallback: boolean };

/**
 * Resolves the template for a snapshot's templateKey. Professional/Creative are
 * not built yet; rather than silently rendering Minimal, this flags the result
 * as a fallback so the caller can log it explicitly. The published portfolio
 * still renders (with Minimal) rather than 404ing on template choice — an
 * intentional, documented legacy fallback.
 */
export function resolveTemplate(key: TemplateKey): TemplateResolution {
  const template = TEMPLATES[key];
  if (template) {
    return { template, isFallback: false };
  }
  return { template: FALLBACK_TEMPLATE, isFallback: true };
}

// A snapshot is renderable only if the resolved template supports both its
// schema version and its template version.
export function isRenderable(
  template: PortfolioTemplate,
  templateVersion: string,
  schemaVersion: number,
): boolean {
  return (
    template.supportedSchemaVersions.includes(schemaVersion) &&
    template.supportedTemplateVersions.includes(templateVersion)
  );
}

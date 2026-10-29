import type { ReactNode } from "react";

import {
  CURRENT_TEMPLATE_VERSION,
  SNAPSHOT_SCHEMA_VERSION,
  type PublishedSnapshot,
  type TemplateKey,
} from "@/lib/publishing/snapshot";
import { MinimalTemplate } from "@/components/public/minimal-template";
import { ProfessionalTemplate } from "@/components/public/professional-template";
import { CreativeTemplate } from "@/components/public/creative-template";

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

// All registry keys are implemented. Each template declares the schema and
// template versions it can render; nothing is a silent cross-template fallback.
const TEMPLATES: Record<TemplateKey, PortfolioTemplate> = {
  minimal: {
    key: "minimal",
    supportedSchemaVersions: [SNAPSHOT_SCHEMA_VERSION],
    supportedTemplateVersions: [CURRENT_TEMPLATE_VERSION.minimal],
    render: MinimalTemplate,
  },
  professional: {
    key: "professional",
    supportedSchemaVersions: [SNAPSHOT_SCHEMA_VERSION],
    supportedTemplateVersions: [CURRENT_TEMPLATE_VERSION.professional],
    render: ProfessionalTemplate,
  },
  creative: {
    key: "creative",
    supportedSchemaVersions: [SNAPSHOT_SCHEMA_VERSION],
    supportedTemplateVersions: [CURRENT_TEMPLATE_VERSION.creative],
    render: CreativeTemplate,
  },
};

// Minimal is the only safe cross-template fallback (it renders any valid
// snapshot). It is used ONLY for a templateKey outside the registry, which the
// snapshot schema's enum already prevents in practice — never to substitute one
// real template for another.
const FALLBACK_TEMPLATE = TEMPLATES.minimal;

export type TemplateResolution = { template: PortfolioTemplate; isFallback: boolean };

/**
 * Resolves the template for a snapshot's templateKey. All three keys are
 * implemented, so a valid key always resolves to its own template. An unknown
 * key (not possible for a schema-validated snapshot) flags a fallback so the
 * caller logs it rather than silently rendering the wrong template.
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

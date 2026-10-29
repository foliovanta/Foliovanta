import { z } from "zod";

import type { TemplateKey } from "@/lib/publishing/snapshot";

/**
 * Strict, versioned design-configuration contract (M3.2).
 *
 * Pure and framework-free. Only curated allowlists and a validated hex accent
 * are accepted — never arbitrary CSS, fonts, HTML or JS. The config is validated
 * when written to the draft and again when published; the public resolver
 * (components/public/design.ts) turns it into safe CSS tokens with contrast
 * fallbacks. Carried inside the snapshot's existing `portfolio.theme` field, so
 * no snapshot schema-version bump is needed and v1 snapshots stay renderable.
 */

export const DESIGN_CONFIG_VERSION = 1;

export const APPEARANCE_MODES = ["light", "dark"] as const;
export type AppearanceMode = (typeof APPEARANCE_MODES)[number];

// The page background per mode — the surface a custom accent is contrast-checked
// against (NOT always white). Shared by the public resolver and the editor.
export const MODE_BACKGROUND: Record<AppearanceMode, string> = {
  light: "#ffffff",
  dark: "#09090b",
};

// Curated palettes. Each carries a pre-validated accent for BOTH modes (a color
// readable on white is not necessarily readable on near-black), so mode never
// produces an inaccessible accent.
export const PALETTES = [
  { id: "indigo", name: "Indigo", light: "#4338ca", dark: "#a5b4fc" },
  { id: "emerald", name: "Emerald", light: "#047857", dark: "#6ee7b7" },
  { id: "rose", name: "Rose", light: "#be123c", dark: "#fda4af" },
  { id: "amber", name: "Amber", light: "#b45309", dark: "#fcd34d" },
  { id: "slate", name: "Slate", light: "#334155", dark: "#cbd5e1" },
] as const;
export const PALETTE_IDS = PALETTES.map((p) => p.id) as [string, ...string[]];
export type PaletteId = (typeof PALETTES)[number]["id"];

// Curated fonts (stable ids → next/font families live in components/public/fonts.ts).
export const HEADING_FONTS = ["fraunces", "space-grotesk", "inter"] as const;
export const BODY_FONTS = ["inter", "source-serif"] as const;
export type HeadingFontId = (typeof HEADING_FONTS)[number];
export type BodyFontId = (typeof BODY_FONTS)[number];

// Section layout presets.
export const PROJECTS_LAYOUTS = ["list", "grid"] as const;
export const EXPERIENCE_LAYOUTS = ["timeline", "stacked"] as const;
export const SKILLS_LAYOUTS = ["grouped", "compact"] as const;

const hexColor = z.string().regex(/^#[0-9a-f]{6}$/i);

export const designConfigSchema = z.strictObject({
  version: z.literal(DESIGN_CONFIG_VERSION),
  mode: z.enum(APPEARANCE_MODES),
  palette: z.enum(PALETTE_IDS),
  // Optional custom accent override; null = use the palette accent. Validated
  // for format here, and for contrast (per mode) at resolution time.
  accent: hexColor.nullable(),
  headingFont: z.enum(HEADING_FONTS),
  bodyFont: z.enum(BODY_FONTS),
  layouts: z.strictObject({
    projects: z.enum(PROJECTS_LAYOUTS),
    experience: z.enum(EXPERIENCE_LAYOUTS),
    skills: z.enum(SKILLS_LAYOUTS),
  }),
});

export type DesignConfig = z.infer<typeof designConfigSchema>;

// Per-template identity defaults, used when a portfolio has no saved design
// (design = null means "template defaults", not a stored blob).
export const TEMPLATE_DESIGN_DEFAULTS: Record<TemplateKey, DesignConfig> = {
  minimal: {
    version: DESIGN_CONFIG_VERSION,
    mode: "light",
    palette: "indigo",
    accent: null,
    headingFont: "fraunces",
    bodyFont: "inter",
    layouts: { projects: "list", experience: "timeline", skills: "grouped" },
  },
  professional: {
    version: DESIGN_CONFIG_VERSION,
    mode: "light",
    palette: "slate",
    accent: null,
    headingFont: "inter",
    bodyFont: "inter",
    layouts: { projects: "list", experience: "timeline", skills: "grouped" },
  },
  creative: {
    version: DESIGN_CONFIG_VERSION,
    mode: "dark",
    palette: "amber",
    accent: null,
    headingFont: "space-grotesk",
    bodyFont: "inter",
    layouts: { projects: "list", experience: "stacked", skills: "compact" },
  },
};

export function defaultDesignForTemplate(templateKey: TemplateKey): DesignConfig {
  return TEMPLATE_DESIGN_DEFAULTS[templateKey];
}

// Which controls each template can actually render. All templates support every
// appearance/palette/accent/font; layout presets are declared explicitly so the
// editor never exposes a preset a template does not implement.
export type DesignCapabilities = {
  layouts: {
    projects: readonly string[];
    experience: readonly string[];
    skills: readonly string[];
  };
};

export const DESIGN_CAPABILITIES: Record<TemplateKey, DesignCapabilities> = {
  minimal: {
    layouts: { projects: PROJECTS_LAYOUTS, experience: EXPERIENCE_LAYOUTS, skills: SKILLS_LAYOUTS },
  },
  professional: {
    layouts: { projects: PROJECTS_LAYOUTS, experience: EXPERIENCE_LAYOUTS, skills: SKILLS_LAYOUTS },
  },
  creative: {
    layouts: { projects: PROJECTS_LAYOUTS, experience: EXPERIENCE_LAYOUTS, skills: SKILLS_LAYOUTS },
  },
};

export function paletteAccent(paletteId: string, mode: AppearanceMode): string {
  const palette = PALETTES.find((p) => p.id === paletteId) ?? PALETTES[0];
  return mode === "dark" ? palette.dark : palette.light;
}

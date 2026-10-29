// Resolves a published design config into a safe, accessible set of CSS tokens.
//
// Input is the snapshot's `portfolio.theme` (loosely typed JSON). We strictly
// re-validate it; anything invalid or legacy (e.g. an old `{}` or `{accent}`
// theme) falls back predictably to the template's identity defaults. The accent
// is validated for contrast against the ACTIVE MODE's background — a color that
// is readable in light mode may be unreadable in dark mode — with a layered
// fallback, so an inaccessible accent can never ship.

import {
  type AppearanceMode,
  type DesignConfig,
  MODE_BACKGROUND,
  defaultDesignForTemplate,
  designConfigSchema,
  paletteAccent,
} from "@/lib/design/config";
import { MIN_CONTRAST, contrastRatio } from "@/lib/design/contrast";
import type { TemplateKey } from "@/lib/publishing/snapshot";
import { BODY_FONT_FAMILY, HEADING_FONT_FAMILY } from "@/components/public/fonts";

type ModeTokens = {
  bg: string;
  surface: string;
  fg: string;
  fgMuted: string;
  fgSubtle: string;
  border: string;
};

// Both token sets are internally AA-compliant (fg/muted/subtle vs bg).
const LIGHT: ModeTokens = {
  bg: MODE_BACKGROUND.light,
  surface: "#f4f4f5",
  fg: "#18181b",
  fgMuted: "#52525b",
  fgSubtle: "#71717a",
  border: "#e4e4e7",
};
const DARK: ModeTokens = {
  bg: MODE_BACKGROUND.dark,
  surface: "#18181b",
  fg: "#fafafa",
  fgMuted: "#d4d4d8",
  fgSubtle: "#a1a1aa",
  border: "#27272a",
};

export type ResolvedDesign = {
  mode: AppearanceMode;
  // Ready to spread into a style={{...}} as CSS custom properties.
  cssVars: Record<string, string>;
  headingFamily: string;
  bodyFamily: string;
  layouts: DesignConfig["layouts"];
};

const HEX = /^#[0-9a-f]{6}$/i;

// Accept a validated config, or fall back to the template defaults. Preserve a
// legacy top-level hex accent if the stored theme is otherwise unrecognised.
function coerceConfig(theme: unknown, templateKey: TemplateKey): DesignConfig {
  const parsed = designConfigSchema.safeParse(theme);
  if (parsed.success) return parsed.data;

  const fallback = defaultDesignForTemplate(templateKey);
  if (theme && typeof theme === "object" && "accent" in theme) {
    const legacyAccent = (theme as { accent?: unknown }).accent;
    if (typeof legacyAccent === "string" && HEX.test(legacyAccent)) {
      return { ...fallback, accent: legacyAccent };
    }
  }
  return fallback;
}

function resolveAccent(config: DesignConfig, tokens: ModeTokens): string {
  const candidate = config.accent ?? paletteAccent(config.palette, config.mode);
  if (contrastRatio(candidate, tokens.bg) >= MIN_CONTRAST) return candidate;
  // Custom accent fails on this mode's background → the palette accent for the
  // mode is pre-validated; last resort is the foreground colour.
  const palette = paletteAccent(config.palette, config.mode);
  if (contrastRatio(palette, tokens.bg) >= MIN_CONTRAST) return palette;
  return tokens.fg;
}

export function resolvePortfolioDesign(theme: unknown, templateKey: TemplateKey): ResolvedDesign {
  const config = coerceConfig(theme, templateKey);
  const tokens = config.mode === "dark" ? DARK : LIGHT;
  const accent = resolveAccent(config, tokens);

  return {
    mode: config.mode,
    cssVars: {
      "--bg": tokens.bg,
      "--surface": tokens.surface,
      "--fg": tokens.fg,
      "--fg-muted": tokens.fgMuted,
      "--fg-subtle": tokens.fgSubtle,
      "--border": tokens.border,
      "--accent": accent,
    },
    headingFamily: HEADING_FONT_FAMILY[config.headingFont],
    bodyFamily: BODY_FONT_FAMILY[config.bodyFont],
    layouts: config.layouts,
  };
}

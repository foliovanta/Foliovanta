// Resolves the published theme into a small, safe set of design tokens.
//
// The snapshot theme is validated JSONB with no customization UI yet, so it is
// typically empty. We read only an allowlist of keys and validate each value
// before it can reach a CSS custom property — never arbitrary CSS. A value must
// be a well-formed hex AND meet a contrast floor against white (the accent is
// used for link/contact text), so a validated-but-unreadable color can't ship.
// Anything else falls back to the Minimal defaults.

export type ResolvedTheme = { accent: string };

// Restrained editorial default (deep indigo on near-white). ~8.4:1 on white.
const DEFAULT_THEME: ResolvedTheme = { accent: "#4338ca" };

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

// WCAG 2.2 AA for normal-size text.
const MIN_CONTRAST = 4.5;

function channelToLinear(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(hex: string): number {
  const r = channelToLinear(parseInt(hex.slice(1, 3), 16));
  const g = channelToLinear(parseInt(hex.slice(3, 5), 16));
  const b = channelToLinear(parseInt(hex.slice(5, 7), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// Contrast ratio of a color against white (#ffffff, luminance 1).
function contrastAgainstWhite(hex: string): number {
  return (1 + 0.05) / (relativeLuminance(hex) + 0.05);
}

export function resolvePortfolioTheme(theme: unknown): ResolvedTheme {
  if (typeof theme !== "object" || theme === null) {
    return DEFAULT_THEME;
  }
  const accent = (theme as Record<string, unknown>).accent;
  if (
    typeof accent === "string" &&
    HEX_COLOR.test(accent) &&
    contrastAgainstWhite(accent) >= MIN_CONTRAST
  ) {
    return { accent };
  }
  return DEFAULT_THEME;
}

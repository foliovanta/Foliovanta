import { Fraunces, Inter, Source_Serif_4, Space_Grotesk } from "next/font/google";

import type { BodyFontId, HeadingFontId } from "@/lib/design/config";

// Curated font library. preload:false means the @font-face is defined but a face
// is only fetched when actually referenced — so a public page downloads only the
// two selected fonts, not all of them. next/font supplies size-adjusted fallback
// metrics to minimise layout shift, and display:swap avoids invisible text.
const fraunces = Fraunces({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  variable: "--font-fraunces",
});
const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  variable: "--font-inter",
});
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  variable: "--font-space-grotesk",
});
const sourceSerif = Source_Serif_4({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  variable: "--font-source-serif",
});

// Applied on the template root so every font's CSS variable is defined; unused
// ones are not downloaded (preload:false + never referenced).
export const FONT_ROOT_CLASS = [
  fraunces.variable,
  inter.variable,
  spaceGrotesk.variable,
  sourceSerif.variable,
].join(" ");

export const HEADING_FONT_FAMILY: Record<HeadingFontId, string> = {
  fraunces: "var(--font-fraunces), ui-serif, Georgia, serif",
  "space-grotesk": "var(--font-space-grotesk), ui-sans-serif, system-ui, sans-serif",
  inter: "var(--font-inter), ui-sans-serif, system-ui, sans-serif",
};

export const BODY_FONT_FAMILY: Record<BodyFontId, string> = {
  inter: "var(--font-inter), ui-sans-serif, system-ui, sans-serif",
  "source-serif": "var(--font-source-serif), ui-serif, Georgia, serif",
};

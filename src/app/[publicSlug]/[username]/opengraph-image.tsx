import { ImageResponse } from "next/og";

import { getPublicPortfolioByUserSlug } from "@/lib/publishing/public-read";

// Prisma is used via public-read, so this runs on Node (not Edge).
export const runtime = "nodejs";
// Re-check visibility per request so a suspended/unpublished portfolio's card is
// never served from a stale cache — it reads the DB-authoritative public read.
export const dynamic = "force-dynamic";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Portfolio on Foliovanta";

const INK = "#18181b";
const MUTED = "#52525b";
const ACCENT = "#4338ca";
const BG = "#fafafa";

function truncate(value: string, max: number): string {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export default async function OpengraphImage({
  params,
}: {
  params: Promise<{ publicSlug: string; username: string }>;
}) {
  const { publicSlug } = await params;
  const result = await getPublicPortfolioByUserSlug(publicSlug);

  // Only ever published, public content; an unavailable portfolio gets a generic
  // branded card with no private data.
  const name = result.ok
    ? truncate(result.snapshot.profile.displayName || "Portfolio", 42)
    : "A portfolio";
  const headline =
    result.ok && result.snapshot.profile.headline
      ? truncate(result.snapshot.profile.headline, 96)
      : null;

  return new ImageResponse(
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        width: "100%",
        height: "100%",
        backgroundColor: BG,
        padding: "80px",
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", width: "120px", height: "12px", backgroundColor: ACCENT }} />

      <div style={{ display: "flex", flexDirection: "column" }}>
        <div
          style={{
            display: "flex",
            fontSize: 76,
            fontWeight: 700,
            color: INK,
            letterSpacing: "-0.02em",
            lineHeight: 1.05,
          }}
        >
          {name}
        </div>
        {headline && (
          <div
            style={{
              display: "flex",
              marginTop: "24px",
              fontSize: 36,
              color: MUTED,
              lineHeight: 1.2,
            }}
          >
            {headline}
          </div>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <div
          style={{
            display: "flex",
            width: "16px",
            height: "16px",
            borderRadius: "9999px",
            backgroundColor: ACCENT,
          }}
        />
        <div style={{ display: "flex", fontSize: 28, fontWeight: 600, color: INK }}>Foliovanta</div>
      </div>
    </div>,
    size,
  );
}

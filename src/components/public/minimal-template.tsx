import type { PortfolioTemplateProps } from "@/components/public/templates";
import { resolvePortfolioDesign } from "@/components/public/design";
import { FONT_ROOT_CLASS } from "@/components/public/fonts";
import { initials } from "@/components/public/format";
import { renderSectionContent } from "@/components/public/sections";
import { SECTION_LABELS, sectionHasContent, visibleSections } from "@/components/public/shared";
import { publicAssetUrl } from "@/lib/media/url";

// Minimal: a single centered editorial column. Colour, mode, fonts and layout
// presets come from the resolved design tokens.
export function MinimalTemplate({ snapshot }: PortfolioTemplateProps) {
  const design = resolvePortfolioDesign(snapshot.portfolio.theme, snapshot.portfolio.templateKey);
  const { displayName, headline, location, avatarAssetId } = snapshot.profile;
  const sections = visibleSections(snapshot);
  const profileVisible = sections.some((s) => s.key === "PROFILE");
  const mainSections = sections.filter(
    (s) => s.key !== "PROFILE" && sectionHasContent(s.key, snapshot),
  );
  const sep = "mt-14 border-t border-[color:var(--border)] pt-14";

  return (
    <main
      className={`${FONT_ROOT_CLASS} min-h-screen`}
      style={{
        ...design.cssVars,
        backgroundColor: "var(--bg)",
        color: "var(--fg)",
        fontFamily: design.bodyFamily,
      }}
    >
      <article className="mx-auto max-w-2xl px-6 py-16 sm:py-24">
        {profileVisible ? (
          <header className="flex flex-col gap-5">
            {avatarAssetId ? (
              // eslint-disable-next-line @next/next/no-img-element -- proxy-served, dimensions unknown at render
              <img
                src={publicAssetUrl(avatarAssetId)}
                alt=""
                className="h-16 w-16 rounded-full border object-cover"
                style={{ borderColor: "var(--accent)" }}
              />
            ) : (
              <span
                aria-hidden="true"
                className="flex h-16 w-16 items-center justify-center rounded-full border text-lg font-medium text-[var(--fg-muted)]"
                style={{ borderColor: "var(--accent)" }}
              >
                {initials(displayName)}
              </span>
            )}
            <div className="flex flex-col gap-2">
              <h1
                className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl"
                style={{ fontFamily: design.headingFamily }}
              >
                {displayName}
              </h1>
              {headline && (
                <p className="text-lg leading-snug text-[var(--fg-muted)]">{headline}</p>
              )}
              {location && <p className="text-sm text-[var(--fg-subtle)]">{location}</p>}
            </div>
          </header>
        ) : (
          <h1 className="sr-only">{displayName}</h1>
        )}

        {mainSections.map((section, index) => (
          <section key={section.key} className={index === 0 && !profileVisible ? "" : sep}>
            <h2 className="mb-6 text-xs font-semibold tracking-[0.2em] text-[var(--fg-subtle)] uppercase">
              {SECTION_LABELS[section.key]}
            </h2>
            {renderSectionContent(section.key, snapshot, design)}
          </section>
        ))}
      </article>
    </main>
  );
}

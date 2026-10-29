import type { PortfolioTemplateProps } from "@/components/public/templates";
import { resolvePortfolioDesign } from "@/components/public/design";
import { FONT_ROOT_CLASS } from "@/components/public/fonts";
import { renderSectionContent } from "@/components/public/sections";
import { SECTION_LABELS, sectionHasContent, visibleSections } from "@/components/public/shared";
import { publicAssetUrl } from "@/lib/media/url";

// Creative: art-directed, oversized hero + asymmetric numbered sections. Mode
// (light/dark), colour, fonts and layout presets come from the resolved design;
// the default is a dark appearance, but the user can switch to light.
export function CreativeTemplate({ snapshot }: PortfolioTemplateProps) {
  const design = resolvePortfolioDesign(snapshot.portfolio.theme, snapshot.portfolio.templateKey);
  const { displayName, headline, location, avatarAssetId } = snapshot.profile;
  const sections = visibleSections(snapshot);
  const profileVisible = sections.some((s) => s.key === "PROFILE");
  const mainSections = sections.filter(
    (s) => s.key !== "PROFILE" && sectionHasContent(s.key, snapshot),
  );

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
      {profileVisible ? (
        <header className="mx-auto max-w-5xl px-6 py-20 sm:px-8 sm:py-28">
          {avatarAssetId ? (
            // eslint-disable-next-line @next/next/no-img-element -- proxy-served; name adjacent so decorative
            <img
              src={publicAssetUrl(avatarAssetId)}
              alt=""
              className="mb-8 h-24 w-24 rounded-full border-2 object-cover"
              style={{ borderColor: "var(--accent)" }}
            />
          ) : (
            <span
              aria-hidden="true"
              className="mb-8 block h-2 w-20"
              style={{ backgroundColor: "var(--accent)" }}
            />
          )}
          <h1
            className="text-[clamp(2.75rem,11vw,7.5rem)] leading-[0.95] font-bold tracking-tight text-balance break-words"
            style={{ fontFamily: design.headingFamily }}
          >
            {displayName}
          </h1>
          {headline && (
            <p className="mt-8 max-w-2xl text-xl leading-snug text-[var(--fg-muted)] sm:text-2xl">
              {headline}
            </p>
          )}
          {location && (
            <p className="mt-4 text-sm tracking-wide text-[var(--fg-subtle)] uppercase">
              {location}
            </p>
          )}
        </header>
      ) : (
        <h1 className="sr-only">{displayName}</h1>
      )}

      <div className="mx-auto max-w-5xl px-6 sm:px-8">
        {mainSections.map((section, index) => (
          <section
            key={section.key}
            id={section.key.toLowerCase()}
            className="scroll-mt-8 border-t border-[color:var(--border)] py-14 md:grid md:grid-cols-[13rem_1fr] md:gap-12 md:py-20"
          >
            <header className="mb-6 md:mb-0">
              <span
                aria-hidden="true"
                className="block text-5xl font-bold text-[var(--fg-subtle)] tabular-nums opacity-40"
                style={{ fontFamily: design.headingFamily }}
              >
                {String(index + 1).padStart(2, "0")}
              </span>
              <h2 className="mt-1 text-sm font-semibold tracking-[0.2em] uppercase">
                {SECTION_LABELS[section.key]}
              </h2>
            </header>
            <div className="min-w-0">{renderSectionContent(section.key, snapshot, design)}</div>
          </section>
        ))}
      </div>
    </main>
  );
}

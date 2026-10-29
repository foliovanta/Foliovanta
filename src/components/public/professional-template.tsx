import type { PortfolioTemplateProps } from "@/components/public/templates";
import { resolvePortfolioDesign } from "@/components/public/design";
import { FONT_ROOT_CLASS } from "@/components/public/fonts";
import { renderSectionContent } from "@/components/public/sections";
import { SECTION_LABELS, sectionHasContent, visibleSections } from "@/components/public/shared";
import { publicAssetUrl } from "@/lib/media/url";

// Professional: a sticky identity sidebar + section nav beside a structured main
// column. Colour/mode/fonts/layout come from the resolved design tokens.
export function ProfessionalTemplate({ snapshot }: PortfolioTemplateProps) {
  const design = resolvePortfolioDesign(snapshot.portfolio.theme, snapshot.portfolio.templateKey);
  const { displayName, headline, location, avatarAssetId } = snapshot.profile;
  const sections = visibleSections(snapshot);
  const profileVisible = sections.some((s) => s.key === "PROFILE");
  const mainSections = sections.filter(
    (s) => s.key !== "PROFILE" && sectionHasContent(s.key, snapshot),
  );
  const navSections = mainSections.filter((s) => SECTION_LABELS[s.key]);

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
      <div className="mx-auto grid max-w-5xl gap-12 px-6 py-14 sm:px-8 lg:grid-cols-[17rem_1fr] lg:gap-16 lg:py-20">
        <aside className="lg:sticky lg:top-16 lg:h-fit">
          {profileVisible ? (
            <div className="flex flex-col gap-3">
              {avatarAssetId && (
                // eslint-disable-next-line @next/next/no-img-element -- proxy-served; name adjacent so decorative
                <img
                  src={publicAssetUrl(avatarAssetId)}
                  alt=""
                  className="h-20 w-20 rounded-full border border-[color:var(--border)] object-cover"
                />
              )}
              <h1
                className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl"
                style={{ fontFamily: design.headingFamily }}
              >
                {displayName}
              </h1>
              {headline && (
                <p className="text-base leading-snug text-[var(--fg-muted)]">{headline}</p>
              )}
              {location && <p className="text-sm text-[var(--fg-subtle)]">{location}</p>}
            </div>
          ) : (
            <h1 className="sr-only">{displayName}</h1>
          )}

          {navSections.length > 0 && (
            <nav aria-label="Sections" className="mt-8 hidden lg:block">
              <span
                aria-hidden="true"
                className="mb-4 block h-px w-10"
                style={{ backgroundColor: "var(--accent)" }}
              />
              <ul className="flex flex-col gap-2 text-sm">
                {navSections.map((section) => (
                  <li key={section.key}>
                    <a
                      href={`#${section.key.toLowerCase()}`}
                      className="rounded-sm text-[var(--fg-subtle)] transition hover:text-[color:var(--accent)] focus-visible:ring-2 focus-visible:ring-[color:var(--accent)] focus-visible:outline-none"
                    >
                      {SECTION_LABELS[section.key]}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          )}
        </aside>

        <div className="min-w-0">
          {mainSections.map((section, index) => (
            <section
              key={section.key}
              id={section.key.toLowerCase()}
              className={index === 0 ? "scroll-mt-8" : "mt-14 scroll-mt-8"}
            >
              <div className="mb-6 flex items-center gap-4">
                <h2 className="text-sm font-semibold tracking-[0.15em] uppercase">
                  {SECTION_LABELS[section.key]}
                </h2>
                <span aria-hidden="true" className="h-px flex-1 bg-[color:var(--border)]" />
              </div>
              {renderSectionContent(section.key, snapshot, design)}
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}

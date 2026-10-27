import { Fraunces } from "next/font/google";

import type { PublishedSnapshot, SectionKey } from "@/lib/publishing/snapshot";
import type { PortfolioTemplateProps } from "@/components/public/templates";
import { formatDateRange, initials, isSafeHttpUrl, linkLabel } from "@/components/public/format";
import { resolvePortfolioTheme } from "@/components/public/theme";

// Editorial display serif, self-hosted via next/font (no runtime dependency),
// scoped to the public template via a CSS variable.
const display = Fraunces({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-display",
  axes: ["opsz"],
});

type Snapshot = PublishedSnapshot;

export function MinimalTemplate({ snapshot }: PortfolioTemplateProps) {
  const theme = resolvePortfolioTheme(snapshot.portfolio.theme);
  const visibleSections = snapshot.sections.filter((section) => section.isVisible);
  const hasVisibleProfile = visibleSections.some((section) => section.key === "PROFILE");

  return (
    <main
      className={`${display.variable} min-h-screen bg-white text-zinc-900`}
      style={{ ["--accent" as string]: theme.accent }}
    >
      <article className="mx-auto max-w-2xl px-6 py-16 sm:py-24">
        {/* Keeps a page heading for a11y/SEO even if PROFILE is hidden. */}
        {!hasVisibleProfile && <h1 className="sr-only">{snapshot.profile.displayName}</h1>}

        {visibleSections.map((section, index) => {
          const block = renderSection(section.key, snapshot);
          if (!block) return null;
          return (
            <div
              key={section.key}
              className={index === 0 ? "" : "mt-14 border-t border-zinc-200 pt-14"}
            >
              {block}
            </div>
          );
        })}
      </article>
    </main>
  );
}

// Minimal defines exactly one layout per section, so `section.layoutVariant` is
// not consulted here: any value (including unknown ones) explicitly falls back
// to this single layout. A real variant registry arrives with richer templates.
function renderSection(key: SectionKey, snapshot: Snapshot) {
  switch (key) {
    case "PROFILE":
      return <ProfileHeader snapshot={snapshot} />;
    case "ABOUT":
      return <AboutSection snapshot={snapshot} />;
    case "PROJECTS":
      return <ProjectsSection snapshot={snapshot} />;
    case "EXPERIENCE":
      return <ExperienceSection snapshot={snapshot} />;
    case "EDUCATION":
      return <EducationSection snapshot={snapshot} />;
    case "SKILLS":
      return <SkillsSection snapshot={snapshot} />;
    case "CONTACT":
      return <ContactSection snapshot={snapshot} />;
    case "CERTIFICATIONS":
      // No certifications data model exists; never fabricate content.
      return null;
  }
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-6 text-xs font-semibold tracking-[0.2em] text-zinc-400 uppercase">
      {children}
    </h2>
  );
}

function ProfileHeader({ snapshot }: { snapshot: Snapshot }) {
  const { displayName, headline, location } = snapshot.profile;
  return (
    <header className="flex flex-col gap-5">
      <span
        aria-hidden="true"
        className="flex h-16 w-16 items-center justify-center rounded-full border text-lg font-medium text-zinc-700"
        style={{ borderColor: "var(--accent)" }}
      >
        {initials(displayName)}
      </span>
      <div className="flex flex-col gap-2">
        <h1
          className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {displayName}
        </h1>
        {headline && <p className="text-lg leading-snug text-zinc-600">{headline}</p>}
        {location && <p className="text-sm text-zinc-500">{location}</p>}
      </div>
    </header>
  );
}

function AboutSection({ snapshot }: { snapshot: Snapshot }) {
  const { bio } = snapshot.profile;
  if (!bio) return null;
  return (
    <section>
      <SectionHeading>About</SectionHeading>
      <div className="space-y-4 text-[15px] leading-7 text-zinc-700">
        {bio.split(/\n{2,}/).map((paragraph, i) => (
          <p key={i} className="break-words whitespace-pre-line">
            {paragraph}
          </p>
        ))}
      </div>
    </section>
  );
}

function ExternalLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="inline-flex items-center gap-1 rounded-sm break-all underline decoration-zinc-300 underline-offset-4 transition hover:decoration-[color:var(--accent)] focus-visible:ring-2 focus-visible:ring-[color:var(--accent)] focus-visible:outline-none"
      style={{ color: "var(--accent)" }}
    >
      {label}
      <span aria-hidden="true">↗</span>
    </a>
  );
}

function ProjectsSection({ snapshot }: { snapshot: Snapshot }) {
  if (snapshot.projects.length === 0) return null;
  return (
    <section>
      <SectionHeading>Projects</SectionHeading>
      <ul className="space-y-10">
        {snapshot.projects.map((project, index) => (
          <li key={index} className="flex flex-col gap-2">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h3
                className="text-xl font-medium tracking-tight break-words"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {project.title}
              </h3>
              {project.isFeatured && (
                <span className="text-[11px] font-semibold tracking-widest text-zinc-400 uppercase">
                  Featured
                </span>
              )}
            </div>
            {project.summary && <p className="text-[15px] text-zinc-600">{project.summary}</p>}
            {project.description && (
              <p className="text-[15px] leading-7 break-words whitespace-pre-line text-zinc-700">
                {project.description}
              </p>
            )}
            <div className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-sm">
              {isSafeHttpUrl(project.projectUrl) && (
                <ExternalLink href={project.projectUrl} label={linkLabel(project.projectUrl)} />
              )}
              {isSafeHttpUrl(project.repositoryUrl) && (
                <ExternalLink href={project.repositoryUrl} label="Source" />
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function TimelineEntry({
  title,
  subtitle,
  meta,
  description,
}: {
  title: string;
  subtitle: string | null;
  meta: string | null;
  description: string | null;
}) {
  return (
    <li className="grid gap-1 sm:grid-cols-[1fr_auto] sm:gap-x-6">
      <div className="min-w-0">
        <h3 className="font-medium tracking-tight break-words">{title}</h3>
        {subtitle && <p className="text-[15px] break-words text-zinc-600">{subtitle}</p>}
      </div>
      {meta && <p className="text-sm text-zinc-500 tabular-nums sm:text-right">{meta}</p>}
      {description && (
        <p className="mt-2 text-[15px] leading-7 break-words whitespace-pre-line text-zinc-700 sm:col-span-2">
          {description}
        </p>
      )}
    </li>
  );
}

function ExperienceSection({ snapshot }: { snapshot: Snapshot }) {
  if (snapshot.experience.length === 0) return null;
  return (
    <section>
      <SectionHeading>Experience</SectionHeading>
      <ul className="space-y-8">
        {snapshot.experience.map((item, index) => (
          <TimelineEntry
            key={index}
            title={item.roleTitle}
            subtitle={[item.organization, item.location].filter(Boolean).join(" · ") || null}
            meta={formatDateRange(item.startDate, item.endDate, item.isCurrent)}
            description={item.description}
          />
        ))}
      </ul>
    </section>
  );
}

function EducationSection({ snapshot }: { snapshot: Snapshot }) {
  if (snapshot.education.length === 0) return null;
  return (
    <section>
      <SectionHeading>Education</SectionHeading>
      <ul className="space-y-8">
        {snapshot.education.map((item, index) => (
          <TimelineEntry
            key={index}
            title={item.institution}
            subtitle={[item.degree, item.fieldOfStudy].filter(Boolean).join(", ") || null}
            meta={formatDateRange(item.startDate, item.endDate)}
            description={item.description}
          />
        ))}
      </ul>
    </section>
  );
}

function SkillsSection({ snapshot }: { snapshot: Snapshot }) {
  if (snapshot.skills.length === 0) return null;

  // Group by category in first-appearance order; uncategorized skills last.
  const groups = new Map<string, string[]>();
  for (const skill of snapshot.skills) {
    const key = skill.category ?? "";
    const label = skill.proficiency ? `${skill.name} (${skill.proficiency})` : skill.name;
    groups.set(key, [...(groups.get(key) ?? []), label]);
  }

  return (
    <section>
      <SectionHeading>Skills</SectionHeading>
      <dl className="space-y-4">
        {[...groups.entries()].map(([category, names]) => (
          <div key={category || "_"} className="sm:grid sm:grid-cols-[10rem_1fr] sm:gap-6">
            {category && <dt className="text-sm font-medium text-zinc-500">{category}</dt>}
            <dd className={`text-[15px] text-zinc-700 ${category ? "" : "sm:col-span-2"}`}>
              {names.join(" · ")}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function ContactSection({ snapshot }: { snapshot: Snapshot }) {
  const { emailPublic } = snapshot.profile;
  // Only the explicitly published public email is shown; nothing is invented.
  if (!emailPublic) return null;
  return (
    <section>
      <SectionHeading>Contact</SectionHeading>
      <a
        href={`mailto:${emailPublic}`}
        className="text-[15px] break-all underline decoration-zinc-300 underline-offset-4 transition hover:decoration-[color:var(--accent)] focus-visible:ring-2 focus-visible:ring-[color:var(--accent)] focus-visible:outline-none"
        style={{ color: "var(--accent)" }}
      >
        {emailPublic}
      </a>
    </section>
  );
}

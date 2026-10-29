// Shared, token-driven section renderers used by all three templates. Colors
// come from CSS custom properties (--fg, --fg-muted, --fg-subtle, --border,
// --accent) the template sets from the resolved design, so light/dark and accent
// work everywhere without per-template duplication. Entry titles use the
// template's heading font via `headingFamily`. Layout presets are implemented
// here once. No private fields, no fabricated data.

import type { CSSProperties } from "react";

import type { PublishedSnapshot, SectionKey } from "@/lib/publishing/snapshot";
import type { DesignConfig } from "@/lib/design/config";
import type { ResolvedDesign } from "@/components/public/design";
import { formatDateRange, isSafeHttpUrl, linkLabel } from "@/components/public/format";
import { groupSkills } from "@/components/public/shared";
import { publicAssetUrl } from "@/lib/media/url";

type Layouts = DesignConfig["layouts"];

export function ExternalLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="inline-flex items-center gap-1 rounded-sm font-medium break-all text-[color:var(--accent)] underline decoration-transparent underline-offset-4 transition hover:decoration-current focus-visible:ring-2 focus-visible:ring-[color:var(--accent)] focus-visible:outline-none"
    >
      {label}
      <span aria-hidden="true">↗</span>
    </a>
  );
}

export function AboutBlock({ snapshot }: { snapshot: PublishedSnapshot }) {
  const { bio } = snapshot.profile;
  if (!bio) return null;
  return (
    <div className="max-w-2xl space-y-4 text-[15px] leading-7 text-[var(--fg-muted)]">
      {bio.split(/\n{2,}/).map((p, i) => (
        <p key={i} className="break-words whitespace-pre-line">
          {p}
        </p>
      ))}
    </div>
  );
}

export function ProjectsBlock({
  snapshot,
  layout,
  headingFamily,
}: {
  snapshot: PublishedSnapshot;
  layout: Layouts["projects"];
  headingFamily: string;
}) {
  const grid = layout === "grid";
  return (
    <ul className={grid ? "grid gap-x-8 gap-y-10 sm:grid-cols-2" : "space-y-10"}>
      {snapshot.projects.map((project, index) => (
        <li key={index} className="flex min-w-0 flex-col gap-2">
          {project.coverAssetId && (
            // eslint-disable-next-line @next/next/no-img-element -- proxy-served, dimensions unknown at render
            <img
              src={publicAssetUrl(project.coverAssetId)}
              alt=""
              loading="lazy"
              className="mb-1 aspect-video w-full rounded-md border border-[color:var(--border)] object-cover"
            />
          )}
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h3
              className="text-lg font-semibold tracking-tight break-words"
              style={{ fontFamily: headingFamily }}
            >
              {project.title}
            </h3>
            {project.isFeatured && (
              <span className="text-[11px] font-semibold tracking-widest text-[color:var(--accent)] uppercase">
                Featured
              </span>
            )}
          </div>
          {project.summary && (
            <p className="text-[15px] text-[var(--fg-muted)]">{project.summary}</p>
          )}
          {project.description && (
            <p className="text-[15px] leading-7 break-words whitespace-pre-line text-[var(--fg-muted)]">
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
  );
}

function TimelineEntry({
  title,
  subtitle,
  meta,
  description,
  layout,
  headingFamily,
}: {
  title: string;
  subtitle: string | null;
  meta: string | null;
  description: string | null;
  layout: Layouts["experience"];
  headingFamily: string;
}) {
  const titleStyle: CSSProperties = { fontFamily: headingFamily };
  if (layout === "stacked") {
    return (
      <li className="min-w-0">
        {meta && <p className="text-sm text-[var(--fg-subtle)] tabular-nums">{meta}</p>}
        <h3 className="font-semibold tracking-tight break-words" style={titleStyle}>
          {title}
        </h3>
        {subtitle && <p className="text-[15px] break-words text-[var(--fg-muted)]">{subtitle}</p>}
        {description && (
          <p className="mt-2 text-[15px] leading-7 break-words whitespace-pre-line text-[var(--fg-muted)]">
            {description}
          </p>
        )}
      </li>
    );
  }
  return (
    <li className="grid gap-x-6 gap-y-1 sm:grid-cols-[1fr_auto]">
      <div className="min-w-0">
        <h3 className="font-semibold tracking-tight break-words" style={titleStyle}>
          {title}
        </h3>
        {subtitle && <p className="text-[15px] break-words text-[var(--fg-muted)]">{subtitle}</p>}
      </div>
      {meta && <p className="text-sm text-[var(--fg-subtle)] tabular-nums sm:text-right">{meta}</p>}
      {description && (
        <p className="mt-1 text-[15px] leading-7 break-words whitespace-pre-line text-[var(--fg-muted)] sm:col-span-2">
          {description}
        </p>
      )}
    </li>
  );
}

export function ExperienceBlock({
  snapshot,
  layout,
  headingFamily,
}: {
  snapshot: PublishedSnapshot;
  layout: Layouts["experience"];
  headingFamily: string;
}) {
  return (
    <ul className="space-y-7">
      {snapshot.experience.map((item, index) => (
        <TimelineEntry
          key={index}
          title={item.roleTitle}
          subtitle={[item.organization, item.location].filter(Boolean).join(" · ") || null}
          meta={formatDateRange(item.startDate, item.endDate, item.isCurrent)}
          description={item.description}
          layout={layout}
          headingFamily={headingFamily}
        />
      ))}
    </ul>
  );
}

export function EducationBlock({
  snapshot,
  layout,
  headingFamily,
}: {
  snapshot: PublishedSnapshot;
  layout: Layouts["experience"];
  headingFamily: string;
}) {
  return (
    <ul className="space-y-7">
      {snapshot.education.map((item, index) => (
        <TimelineEntry
          key={index}
          title={item.institution}
          subtitle={[item.degree, item.fieldOfStudy].filter(Boolean).join(", ") || null}
          meta={formatDateRange(item.startDate, item.endDate)}
          description={item.description}
          layout={layout}
          headingFamily={headingFamily}
        />
      ))}
    </ul>
  );
}

export function SkillsBlock({
  snapshot,
  layout,
}: {
  snapshot: PublishedSnapshot;
  layout: Layouts["skills"];
}) {
  const groups = groupSkills(snapshot.skills);

  if (layout === "compact") {
    return (
      <div className="space-y-4">
        {groups.map((group) => (
          <div key={group.category ?? "_"}>
            {group.category && (
              <p className="mb-2 text-xs font-semibold tracking-wide text-[var(--fg-subtle)] uppercase">
                {group.category}
              </p>
            )}
            <ul className="flex flex-wrap gap-2">
              {group.names.map((name, i) => (
                <li
                  key={i}
                  className="rounded-full border border-[color:var(--border)] px-3 py-1 text-sm text-[var(--fg-muted)]"
                >
                  {name}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    );
  }

  return (
    <dl className="space-y-4">
      {groups.map((group) => (
        <div key={group.category ?? "_"} className="sm:grid sm:grid-cols-[10rem_1fr] sm:gap-6">
          {group.category && (
            <dt className="text-sm font-medium text-[var(--fg-subtle)]">{group.category}</dt>
          )}
          <dd
            className={`text-[15px] text-[var(--fg-muted)] ${group.category ? "" : "sm:col-span-2"}`}
          >
            {group.names.join(" · ")}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function ContactBlock({ snapshot }: { snapshot: PublishedSnapshot }) {
  const { emailPublic } = snapshot.profile;
  if (!emailPublic) return null;
  return (
    <a
      href={`mailto:${emailPublic}`}
      className="inline-block rounded-sm text-[15px] font-medium break-all text-[color:var(--accent)] underline decoration-transparent underline-offset-4 transition hover:decoration-current focus-visible:ring-2 focus-visible:ring-[color:var(--accent)] focus-visible:outline-none"
    >
      {emailPublic}
    </a>
  );
}

// Renders the content for a non-PROFILE section, applying the resolved layout
// presets. Education follows the experience layout preset. PROFILE (the hero)
// and CERTIFICATIONS (no content model) render nothing here.
export function renderSectionContent(
  key: SectionKey,
  snapshot: PublishedSnapshot,
  design: ResolvedDesign,
) {
  switch (key) {
    case "ABOUT":
      return <AboutBlock snapshot={snapshot} />;
    case "PROJECTS":
      return (
        <ProjectsBlock
          snapshot={snapshot}
          layout={design.layouts.projects}
          headingFamily={design.headingFamily}
        />
      );
    case "EXPERIENCE":
      return (
        <ExperienceBlock
          snapshot={snapshot}
          layout={design.layouts.experience}
          headingFamily={design.headingFamily}
        />
      );
    case "EDUCATION":
      return (
        <EducationBlock
          snapshot={snapshot}
          layout={design.layouts.experience}
          headingFamily={design.headingFamily}
        />
      );
    case "SKILLS":
      return <SkillsBlock snapshot={snapshot} layout={design.layouts.skills} />;
    case "CONTACT":
      return <ContactBlock snapshot={snapshot} />;
    case "PROFILE":
    case "CERTIFICATIONS":
      return null;
  }
}

// Snapshot-aware pure helpers shared by templates. No React, no DB. Keeps the
// template components focused on layout while section/content logic stays in one
// tested place. Each template still owns its own visual structure.

import type { PublishedSnapshot, SectionKey } from "@/lib/publishing/snapshot";

// Human labels for section headings/navigation. PROFILE/CERTIFICATIONS have no
// standalone label (PROFILE is the hero; CERTIFICATIONS has no content model).
export const SECTION_LABELS: Record<SectionKey, string> = {
  PROFILE: "",
  ABOUT: "About",
  PROJECTS: "Projects",
  EXPERIENCE: "Experience",
  EDUCATION: "Education",
  SKILLS: "Skills",
  CERTIFICATIONS: "",
  CONTACT: "Contact",
};

// Published sections in order, visible only. (The snapshot already orders them.)
export function visibleSections(snapshot: PublishedSnapshot) {
  return snapshot.sections.filter((section) => section.isVisible);
}

/**
 * Whether a section would render anything for this snapshot. Used to skip empty
 * sections and to build section navigation. CERTIFICATIONS always returns false
 * (no content model — never fabricate data). PROFILE is always true (displayName
 * is required to publish).
 */
export function sectionHasContent(key: SectionKey, s: PublishedSnapshot): boolean {
  switch (key) {
    case "PROFILE":
      return true;
    case "ABOUT":
      return Boolean(s.profile.bio);
    case "PROJECTS":
      return s.projects.length > 0;
    case "EXPERIENCE":
      return s.experience.length > 0;
    case "EDUCATION":
      return s.education.length > 0;
    case "SKILLS":
      return s.skills.length > 0;
    case "CONTACT":
      return Boolean(s.profile.emailPublic);
    case "CERTIFICATIONS":
      return false;
  }
}

export type SkillGroup = { category: string | null; names: string[] };

// Group skills by category in first-appearance order; uncategorized last.
export function groupSkills(skills: PublishedSnapshot["skills"]): SkillGroup[] {
  const groups = new Map<string, string[]>();
  for (const skill of skills) {
    const key = skill.category ?? "";
    const label = skill.proficiency ? `${skill.name} (${skill.proficiency})` : skill.name;
    groups.set(key, [...(groups.get(key) ?? []), label]);
  }
  return [...groups.entries()].map(([category, names]) => ({ category: category || null, names }));
}

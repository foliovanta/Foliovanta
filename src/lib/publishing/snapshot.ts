import { z } from "zod";

/**
 * Deterministic, immutable published-snapshot contract (M2 Step 1).
 *
 * Pure and framework-free: no database, auth, React/Next, Date.now, randomness,
 * or input mutation. A future owner-scoped loader assembles `PortfolioDraftInput`
 * from the draft tables; `buildSnapshot` transforms + validates it into a
 * `PublishedSnapshot` that public templates can read.
 */

export const SNAPSHOT_SCHEMA_VERSION = 1;

// Stable template registry (BACKEND_SCHEMA.md §3.6). No PortfolioDesign model
// exists yet, so templateKey/theme default until that model lands.
export const TEMPLATE_KEYS = ["minimal", "professional", "creative"] as const;
export type TemplateKey = (typeof TEMPLATE_KEYS)[number];
const DEFAULT_TEMPLATE_KEY: TemplateKey = "minimal";
const DEFAULT_TEMPLATE_VERSION = "1.0.0";

// Canonical section registry (BACKEND_SCHEMA.md §3.4), in default order. Kept
// here so the builder stays free of the server-only sections module; a unit
// test asserts it stays in sync with the server registry.
export const SECTION_REGISTRY = [
  "PROFILE",
  "ABOUT",
  "PROJECTS",
  "EXPERIENCE",
  "EDUCATION",
  "SKILLS",
  "CERTIFICATIONS",
  "CONTACT",
] as const;
export type SectionKey = (typeof SECTION_REGISTRY)[number];

// ---------------------------------------------------------------------------
// Draft input contract (what the future DB loader must produce). Canonical DB
// field names; `@db.Date` columns arrive as Date objects; row ids are used only
// as a stable sort tiebreak and are never emitted.
// ---------------------------------------------------------------------------

export type ProfileDraftInput = {
  displayName: string;
  headline: string | null;
  bio: string | null;
  location: string | null;
  avatarAssetId: string | null;
  emailPublic: string | null;
};

export type SectionDraftInput = {
  sectionKey: string;
  isVisible: boolean;
  position: number;
  layoutVariant: string | null;
  // `config` is intentionally NOT part of the draft→snapshot contract: it has
  // no validated public schema yet, so it is never published (see design doc).
};

export type ProjectDraftInput = {
  id: string;
  title: string;
  summary: string | null;
  description: string | null;
  projectUrl: string | null;
  repositoryUrl: string | null;
  coverAssetId: string | null;
  isFeatured: boolean;
  position: number;
};

export type ExperienceDraftInput = {
  id: string;
  organization: string;
  roleTitle: string;
  location: string | null;
  startDate: Date | null;
  endDate: Date | null;
  isCurrent: boolean;
  description: string | null;
  position: number;
};

export type EducationDraftInput = {
  id: string;
  institution: string;
  degree: string | null;
  fieldOfStudy: string | null;
  startDate: Date | null;
  endDate: Date | null;
  description: string | null;
  position: number;
};

export type SkillDraftInput = {
  id: string;
  name: string;
  category: string | null;
  proficiency: string | null;
  position: number;
};

export type PortfolioDraftInput = {
  slug: string;
  // Sourced from the future PortfolioDesign model; defaults applied when absent.
  templateKey?: string | null;
  templateVersion?: string | null;
  theme?: Record<string, unknown> | null;
  profile: ProfileDraftInput | null;
  sections: SectionDraftInput[];
  projects: ProjectDraftInput[];
  experience: ExperienceDraftInput[];
  education: EducationDraftInput[];
  skills: SkillDraftInput[];
};

// ---------------------------------------------------------------------------
// Snapshot schema (runtime-validated, strict). Private fields (ids, ownerId,
// Clerk identity, timestamps, config) are structurally absent.
// ---------------------------------------------------------------------------

const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable();

const publicUrl = z
  .string()
  .max(2048)
  .refine((v) => /^https?:\/\//i.test(v), { message: "URL must use http(s)" })
  .nullable();

const assetRef = z.uuid().nullable();

const profileSnapshotSchema = z.strictObject({
  displayName: z.string().max(120),
  headline: z.string().max(200).nullable(),
  bio: z.string().max(5000).nullable(),
  location: z.string().max(120).nullable(),
  avatarAssetId: assetRef,
  emailPublic: z.email().max(254).nullable(),
});

const sectionSnapshotSchema = z.strictObject({
  key: z.enum(SECTION_REGISTRY),
  position: z.number().int().min(0),
  isVisible: z.boolean(),
  layoutVariant: z.string().max(64).nullable(),
});

const projectSnapshotSchema = z.strictObject({
  title: z.string().min(1).max(200),
  summary: z.string().max(500).nullable(),
  description: z.string().max(5000).nullable(),
  projectUrl: publicUrl,
  repositoryUrl: publicUrl,
  coverAssetId: assetRef,
  isFeatured: z.boolean(),
  position: z.number().int().min(0),
});

const experienceSnapshotSchema = z.strictObject({
  organization: z.string().min(1).max(200),
  roleTitle: z.string().min(1).max(200),
  location: z.string().max(200).nullable(),
  startDate: dateOnly,
  endDate: dateOnly,
  isCurrent: z.boolean(),
  description: z.string().max(5000).nullable(),
  position: z.number().int().min(0),
});

const educationSnapshotSchema = z.strictObject({
  institution: z.string().min(1).max(200),
  degree: z.string().max(200).nullable(),
  fieldOfStudy: z.string().max(200).nullable(),
  startDate: dateOnly,
  endDate: dateOnly,
  description: z.string().max(5000).nullable(),
  position: z.number().int().min(0),
});

const skillSnapshotSchema = z.strictObject({
  name: z.string().min(1).max(100),
  category: z.string().max(100).nullable(),
  proficiency: z.string().max(50).nullable(),
  position: z.number().int().min(0),
});

export const publishedSnapshotSchema = z.strictObject({
  schemaVersion: z.literal(SNAPSHOT_SCHEMA_VERSION),
  portfolio: z.strictObject({
    slug: z.string().regex(/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/),
    templateKey: z.enum(TEMPLATE_KEYS),
    templateVersion: z.string().min(1).max(32),
    theme: z.record(z.string(), z.unknown()),
  }),
  profile: profileSnapshotSchema,
  sections: z.array(sectionSnapshotSchema),
  projects: z.array(projectSnapshotSchema),
  experience: z.array(experienceSnapshotSchema),
  education: z.array(educationSnapshotSchema),
  skills: z.array(skillSnapshotSchema),
});

export type PublishedSnapshot = z.infer<typeof publishedSnapshotSchema>;

// ---------------------------------------------------------------------------
// Pure builder
// ---------------------------------------------------------------------------

const toDateOnly = (value: Date | null): string | null =>
  value ? value.toISOString().slice(0, 10) : null;

// Stable ordering: position asc, then row id asc (ids drop out of the output).
function sortByPosition<T extends { position: number; id: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
}

const EMPTY_PROFILE: ProfileDraftInput = {
  displayName: "",
  headline: null,
  bio: null,
  location: null,
  avatarAssetId: null,
  emailPublic: null,
};

function buildSections(rows: SectionDraftInput[]) {
  const byKey = new Map(rows.map((row) => [row.sectionKey, row]));
  const merged = SECTION_REGISTRY.map((key, registryIndex) => {
    const row = byKey.get(key);
    return {
      key,
      registryIndex,
      // Unpersisted sections default to visible at their registry position,
      // matching the editor. Unknown keys in input are ignored.
      isVisible: row ? row.isVisible : true,
      position: row ? row.position : registryIndex,
      layoutVariant: row ? row.layoutVariant : null,
    };
  });
  merged.sort((a, b) => a.position - b.position || a.registryIndex - b.registryIndex);
  return merged.map((s, index) => ({
    key: s.key,
    position: index,
    isVisible: s.isVisible,
    layoutVariant: s.layoutVariant,
  }));
}

export function buildSnapshot(input: PortfolioDraftInput): PublishedSnapshot {
  const profile = input.profile ?? EMPTY_PROFILE;

  const snapshot = {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    portfolio: {
      slug: input.slug,
      templateKey: input.templateKey ?? DEFAULT_TEMPLATE_KEY,
      templateVersion: input.templateVersion ?? DEFAULT_TEMPLATE_VERSION,
      theme: input.theme ?? {},
    },
    profile: {
      displayName: profile.displayName,
      headline: profile.headline,
      bio: profile.bio,
      location: profile.location,
      avatarAssetId: profile.avatarAssetId,
      emailPublic: profile.emailPublic,
    },
    sections: buildSections(input.sections),
    projects: sortByPosition(input.projects).map((p, index) => ({
      title: p.title,
      summary: p.summary,
      description: p.description,
      projectUrl: p.projectUrl,
      repositoryUrl: p.repositoryUrl,
      coverAssetId: p.coverAssetId,
      isFeatured: p.isFeatured,
      position: index,
    })),
    experience: sortByPosition(input.experience).map((e, index) => ({
      organization: e.organization,
      roleTitle: e.roleTitle,
      location: e.location,
      startDate: toDateOnly(e.startDate),
      endDate: toDateOnly(e.endDate),
      isCurrent: e.isCurrent,
      description: e.description,
      position: index,
    })),
    education: sortByPosition(input.education).map((e, index) => ({
      institution: e.institution,
      degree: e.degree,
      fieldOfStudy: e.fieldOfStudy,
      startDate: toDateOnly(e.startDate),
      endDate: toDateOnly(e.endDate),
      description: e.description,
      position: index,
    })),
    skills: sortByPosition(input.skills).map((s, index) => ({
      name: s.name,
      category: s.category,
      proficiency: s.proficiency,
      position: index,
    })),
  };

  // Validates structure + public-field safety; throws a clear ZodError on
  // invalid draft data (e.g. a non-http(s) URL or malformed slug).
  return publishedSnapshotSchema.parse(snapshot);
}

import { describe, expect, it, vi } from "vitest";

// Importing the server section registry pulls in the Prisma client module;
// stub it (the registry constant needs no DB).
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));

import {
  type PortfolioDraftInput,
  SECTION_REGISTRY,
  buildSnapshot,
  publishedSnapshotSchema,
} from "@/lib/publishing/snapshot";
import { SECTION_KEYS } from "@/lib/portfolios/sections";

function baseInput(overrides: Partial<PortfolioDraftInput> = {}): PortfolioDraftInput {
  return {
    slug: "ada-lovelace",
    templateKey: null,
    templateVersion: null,
    theme: null,
    profile: {
      displayName: "Ada",
      headline: null,
      bio: null,
      location: null,
      avatarAssetId: null,
      emailPublic: null,
    },
    sections: [],
    projects: [],
    experience: [],
    education: [],
    skills: [],
    ...overrides,
  };
}

const project = (over: Partial<PortfolioDraftInput["projects"][number]>) => ({
  id: "p",
  title: "T",
  summary: null,
  description: null,
  projectUrl: null,
  repositoryUrl: null,
  coverAssetId: null,
  isFeatured: false,
  position: 0,
  ...over,
});

describe("buildSnapshot", () => {
  it("stays in sync with the server section registry", () => {
    expect([...SECTION_REGISTRY]).toEqual([...SECTION_KEYS]);
  });

  it("is deterministic and stably serializable", () => {
    const input = baseInput({
      projects: [
        project({ id: "b", title: "B", position: 1 }),
        project({ id: "a", title: "A", position: 0 }),
      ],
    });
    const a = buildSnapshot(input);
    const b = buildSnapshot(input);
    expect(a).toEqual(b);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.schemaVersion).toBe(1);
  });

  it("defaults all registry sections to visible, in registry order, when none persist", () => {
    const snap = buildSnapshot(baseInput());
    expect(snap.sections.map((s) => s.key)).toEqual([...SECTION_REGISTRY]);
    expect(snap.sections.every((s) => s.isVisible)).toBe(true);
    expect(snap.sections.map((s) => s.position)).toEqual(SECTION_REGISTRY.map((_, i) => i));
  });

  it("applies persisted visibility and ordering, and ignores unknown section keys", () => {
    const snap = buildSnapshot(
      baseInput({
        sections: [
          { sectionKey: "PROJECTS", isVisible: true, position: 0, layoutVariant: "grid" },
          { sectionKey: "PROFILE", isVisible: false, position: 1, layoutVariant: null },
          { sectionKey: "NOT_A_SECTION", isVisible: true, position: 0, layoutVariant: null },
        ],
      }),
    );
    // PROJECTS (pos 0) sorts before PROFILE (pos 1); the rest follow in registry order.
    expect(snap.sections[0]).toMatchObject({
      key: "PROJECTS",
      isVisible: true,
      layoutVariant: "grid",
    });
    expect(snap.sections[1]).toMatchObject({ key: "PROFILE", isVisible: false });
    expect(snap.sections).toHaveLength(SECTION_REGISTRY.length); // unknown key dropped
  });

  it("orders collections by position then id and renumbers densely", () => {
    const snap = buildSnapshot(
      baseInput({
        projects: [
          project({ id: "x", title: "X", position: 5 }),
          project({ id: "a", title: "A", position: 1 }),
          project({ id: "b", title: "B", position: 1 }),
        ],
      }),
    );
    expect(snap.projects.map((p) => p.title)).toEqual(["A", "B", "X"]); // pos then id
    expect(snap.projects.map((p) => p.position)).toEqual([0, 1, 2]); // renumbered
  });

  it("serializes date-only values without timezone drift", () => {
    const snap = buildSnapshot(
      baseInput({
        experience: [
          {
            id: "e",
            organization: "Acme",
            roleTitle: "Eng",
            location: null,
            startDate: new Date("2020-03-15"),
            endDate: null,
            isCurrent: true,
            description: null,
            position: 0,
          },
        ],
      }),
    );
    expect(snap.experience[0]!.startDate).toBe("2020-03-15");
    expect(snap.experience[0]!.endDate).toBeNull();
  });

  it("excludes private fields (row ids, ownerId) from output", () => {
    const snap = buildSnapshot(baseInput({ projects: [project({ id: "secret" })] }));
    expect(snap.projects[0]).not.toHaveProperty("id");
    expect(JSON.stringify(snap)).not.toContain("secret");
    expect(JSON.stringify(snap)).not.toContain("ownerId");
  });

  it("falls back to an empty profile when no profile row exists", () => {
    const snap = buildSnapshot(baseInput({ profile: null }));
    expect(snap.profile.displayName).toBe("");
    expect(snap.profile.emailPublic).toBeNull();
  });

  it("defaults template fields when no design data is provided", () => {
    const snap = buildSnapshot(baseInput());
    expect(snap.portfolio.templateKey).toBe("minimal");
    expect(snap.portfolio.templateVersion).toBe("1.0.0");
    expect(snap.portfolio.theme).toEqual({});
  });

  it("does not mutate the input", () => {
    const input = baseInput({
      projects: [
        project({ id: "b", title: "B", position: 1 }),
        project({ id: "a", title: "A", position: 0 }),
      ],
    });
    const snapshot = JSON.stringify(input);
    buildSnapshot(input);
    expect(JSON.stringify(input)).toBe(snapshot);
    expect(input.projects.map((p) => p.title)).toEqual(["B", "A"]); // original order intact
  });

  it("throws on an invalid public URL", () => {
    expect(() =>
      buildSnapshot(baseInput({ projects: [project({ projectUrl: "javascript:alert(1)" })] })),
    ).toThrow();
  });

  it("throws on an unsupported template key", () => {
    expect(() => buildSnapshot(baseInput({ templateKey: "fancy" }))).toThrow();
  });

  it("rejects a wrong schema version at the schema boundary", () => {
    const snap = buildSnapshot(baseInput());
    const tampered = { ...snap, schemaVersion: 2 };
    expect(publishedSnapshotSchema.safeParse(tampered).success).toBe(false);
  });
});

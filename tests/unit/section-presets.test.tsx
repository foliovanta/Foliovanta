import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ProjectsBlock, SkillsBlock } from "@/components/public/sections";
import type { PublishedSnapshot } from "@/lib/publishing/snapshot";

const snap = (over: Partial<PublishedSnapshot>): PublishedSnapshot =>
  ({
    schemaVersion: 1,
    portfolio: { slug: "ada", templateKey: "minimal", templateVersion: "1.0.0", theme: {} },
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
    ...over,
  }) as PublishedSnapshot;

const skills = [
  { name: "TypeScript", category: "Languages", proficiency: null, position: 0 },
  { name: "SQL", category: "Languages", proficiency: null, position: 1 },
];

describe("SkillsBlock presets", () => {
  it("compact renders each skill as a pill (listitem); grouped does not", () => {
    const { unmount } = render(<SkillsBlock snapshot={snap({ skills })} layout="compact" />);
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    unmount();

    render(<SkillsBlock snapshot={snap({ skills })} layout="grouped" />);
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    expect(screen.getByText("TypeScript · SQL")).toBeInTheDocument();
  });
});

describe("ProjectsBlock presets", () => {
  const projects = [
    {
      title: "Engine",
      summary: null,
      description: null,
      projectUrl: null,
      repositoryUrl: null,
      coverAssetId: null,
      isFeatured: false,
      position: 0,
    },
  ];

  it("renders the project in both list and grid layouts", () => {
    const { unmount } = render(
      <ProjectsBlock snapshot={snap({ projects })} layout="list" headingFamily="serif" />,
    );
    expect(screen.getByRole("heading", { name: "Engine" })).toBeInTheDocument();
    unmount();

    render(<ProjectsBlock snapshot={snap({ projects })} layout="grid" headingFamily="serif" />);
    expect(screen.getByRole("heading", { name: "Engine" })).toBeInTheDocument();
  });

  it("renders a cover via the delivery proxy when attached, and nothing otherwise", () => {
    const withCover = [{ ...projects[0]!, coverAssetId: "11111111-1111-1111-1111-111111111111" }];
    const { container, unmount } = render(
      <ProjectsBlock
        snapshot={snap({ projects: withCover })}
        layout="list"
        headingFamily="serif"
      />,
    );
    // Decorative cover (alt=""), so query the element directly.
    expect(container.querySelector("img")).toHaveAttribute(
      "src",
      "/api/media/11111111-1111-1111-1111-111111111111",
    );
    unmount();

    const { container: bare } = render(
      <ProjectsBlock snapshot={snap({ projects })} layout="list" headingFamily="serif" />,
    );
    expect(bare.querySelector("img")).toBeNull();
  });
});

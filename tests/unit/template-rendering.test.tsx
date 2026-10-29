import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/font/google", () => {
  const stub = () => ({ variable: "font-stub", className: "font-stub" });
  return { Fraunces: stub, Inter: stub, Space_Grotesk: stub, Source_Serif_4: stub };
});

import { ProfessionalTemplate } from "@/components/public/professional-template";
import { CreativeTemplate } from "@/components/public/creative-template";
import type { PublishedSnapshot } from "@/lib/publishing/snapshot";

const REGISTRY = [
  "PROFILE",
  "ABOUT",
  "PROJECTS",
  "EXPERIENCE",
  "EDUCATION",
  "SKILLS",
  "CERTIFICATIONS",
  "CONTACT",
] as const;

const sectionsInOrder = (keys: readonly string[], hidden: string[] = []) =>
  keys.map((key, i) => ({
    key: key as PublishedSnapshot["sections"][number]["key"],
    position: i,
    isVisible: !hidden.includes(key),
    layoutVariant: null,
  }));

function snap(overrides: Partial<PublishedSnapshot> = {}): PublishedSnapshot {
  return {
    schemaVersion: 1,
    portfolio: { slug: "ada", templateKey: "professional", templateVersion: "1.0.0", theme: {} },
    profile: {
      displayName: "Ada Lovelace",
      headline: null,
      bio: null,
      location: null,
      avatarAssetId: null,
      emailPublic: null,
    },
    sections: sectionsInOrder(REGISTRY),
    projects: [],
    experience: [],
    education: [],
    skills: [],
    ...overrides,
  };
}

const project = (o: Partial<PublishedSnapshot["projects"][number]> = {}) => ({
  title: "Analytical Engine",
  summary: null,
  description: null,
  projectUrl: null,
  repositoryUrl: null,
  coverAssetId: null,
  isFeatured: false,
  position: 0,
  ...o,
});

const templates = [
  { name: "Professional", Template: ProfessionalTemplate },
  { name: "Creative", Template: CreativeTemplate },
] as const;

describe.each(templates)("$name template", ({ Template }) => {
  it("renders the display name as the single h1", () => {
    render(<Template snapshot={snap({ profile: { ...snap().profile, headline: "Pioneer" } })} />);
    const h1s = screen.getAllByRole("heading", { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]?.textContent).toBe("Ada Lovelace");
    expect(screen.getByText("Pioneer")).toBeInTheDocument();
  });

  it("omits empty sections (no About/Projects headings without content)", () => {
    render(<Template snapshot={snap()} />);
    expect(screen.queryByText("About")).not.toBeInTheDocument();
    expect(screen.queryByText("Projects")).not.toBeInTheDocument();
  });

  it("respects published section order", () => {
    render(
      <Template
        snapshot={snap({
          sections: sectionsInOrder(["PROFILE", "PROJECTS", "ABOUT"]),
          profile: { ...snap().profile, bio: "Bio text" },
          projects: [project()],
        })}
      />,
    );
    const headings = screen.getAllByRole("heading").map((h) => h.textContent);
    expect(headings).toEqual(["Ada Lovelace", "Projects", "Analytical Engine", "About"]);
  });

  it("omits hidden sections even with content", () => {
    render(
      <Template
        snapshot={snap({
          sections: sectionsInOrder(REGISTRY, ["ABOUT"]),
          profile: { ...snap().profile, bio: "Hidden bio" },
        })}
      />,
    );
    expect(screen.queryByText("About")).not.toBeInTheDocument();
    expect(screen.queryByText("Hidden bio")).not.toBeInTheDocument();
  });

  it("renders only safe http(s) project links", () => {
    render(
      <Template
        snapshot={snap({
          projects: [
            project({
              projectUrl: "https://ada.dev",
              repositoryUrl: "javascript:alert(1)",
              isFeatured: true,
            }),
          ],
        })}
      />,
    );
    expect(screen.getByRole("link", { name: /ada\.dev/ })).toHaveAttribute(
      "href",
      "https://ada.dev",
    );
    expect(screen.queryByText("Source")).not.toBeInTheDocument();
    expect(screen.getByText("Featured")).toBeInTheDocument();
  });

  it("shows the public email in Contact only when published", () => {
    const { unmount } = render(<Template snapshot={snap()} />);
    expect(screen.queryByText("Contact")).not.toBeInTheDocument();
    unmount();

    render(
      <Template snapshot={snap({ profile: { ...snap().profile, emailPublic: "ada@x.dev" } })} />,
    );
    expect(screen.getByRole("link", { name: "ada@x.dev" })).toHaveAttribute(
      "href",
      "mailto:ada@x.dev",
    );
  });

  it("renders the avatar via the delivery proxy when attached, with a fallback otherwise", () => {
    const { container, unmount } = render(
      <Template
        snapshot={snap({
          profile: { ...snap().profile, avatarAssetId: "33333333-3333-3333-3333-333333333333" },
        })}
      />,
    );
    expect(container.querySelector("img")).toHaveAttribute(
      "src",
      "/api/media/33333333-3333-3333-3333-333333333333",
    );
    unmount();

    const { container: bare } = render(<Template snapshot={snap()} />);
    expect(bare.querySelector("img")).toBeNull();
  });

  it("never renders CERTIFICATIONS or leaks private field names", () => {
    const { container } = render(<Template snapshot={snap()} />);
    expect(screen.queryByText("Certifications")).not.toBeInTheDocument();
    const html = container.innerHTML;
    expect(html).not.toContain("ownerId");
    expect(html).not.toContain("draftRevision");
  });

  it("formats current experience with Present and handles long content", () => {
    render(
      <Template
        snapshot={snap({
          profile: { ...snap().profile, bio: "word ".repeat(1500).trim() },
          experience: [
            {
              organization: "Analytical Society",
              roleTitle: "Mathematician",
              location: "London",
              startDate: "2020-01-01",
              endDate: null,
              isCurrent: true,
              description: null,
              position: 0,
            },
          ],
        })}
      />,
    );
    expect(screen.getByText("Jan 2020 – Present")).toBeInTheDocument();
    // "About" may also appear as a nav link, so target the section heading.
    expect(screen.getByRole("heading", { name: "About" })).toBeInTheDocument();
  });
});

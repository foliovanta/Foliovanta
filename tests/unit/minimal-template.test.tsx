import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/font/google", () => ({
  Fraunces: () => ({ variable: "font-fraunces", className: "font-fraunces" }),
}));

import { MinimalTemplate } from "@/components/public/minimal-template";
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
    portfolio: { slug: "ada", templateKey: "minimal", templateVersion: "1.0.0", theme: {} },
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

const headings = () => screen.getAllByRole("heading").map((h) => h.textContent);

describe("MinimalTemplate", () => {
  it("renders the profile header and omits empty sections", () => {
    render(
      <MinimalTemplate
        snapshot={snap({ profile: { ...snap().profile, headline: "Pioneer", location: "London" } })}
      />,
    );
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Ada Lovelace");
    expect(screen.getByText("Pioneer")).toBeInTheDocument();
    expect(screen.getByText("London")).toBeInTheDocument();
    // No content → no section headings beyond the profile h1.
    expect(screen.queryByText("Projects")).not.toBeInTheDocument();
    expect(screen.queryByText("About")).not.toBeInTheDocument();
  });

  it("respects published section order", () => {
    render(
      <MinimalTemplate
        snapshot={snap({
          sections: sectionsInOrder(["PROFILE", "PROJECTS", "ABOUT"]),
          profile: { ...snap().profile, bio: "Bio text" },
          projects: [
            {
              title: "Analytical Engine",
              summary: null,
              description: null,
              projectUrl: null,
              repositoryUrl: null,
              coverAssetId: null,
              isFeatured: false,
              position: 0,
            },
          ],
        })}
      />,
    );
    expect(headings()).toEqual(["Ada Lovelace", "Projects", "Analytical Engine", "About"]);
  });

  it("omits hidden sections even when they have content", () => {
    render(
      <MinimalTemplate
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
      <MinimalTemplate
        snapshot={snap({
          projects: [
            {
              title: "Safe",
              summary: null,
              description: null,
              projectUrl: "https://ada.dev",
              repositoryUrl: "javascript:alert(1)",
              coverAssetId: null,
              isFeatured: true,
              position: 0,
            },
          ],
        })}
      />,
    );
    expect(screen.getByRole("link", { name: /ada\.dev/ })).toHaveAttribute(
      "href",
      "https://ada.dev",
    );
    expect(screen.queryByText("Source")).not.toBeInTheDocument(); // javascript: dropped
    expect(screen.getByText("Featured")).toBeInTheDocument();
  });

  it("formats experience dates with Present for current roles", () => {
    render(
      <MinimalTemplate
        snapshot={snap({
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
    expect(screen.getByText(/Mathematician/)).toBeInTheDocument();
  });

  it("shows the public email in Contact only when published", () => {
    const { unmount } = render(<MinimalTemplate snapshot={snap()} />);
    expect(screen.queryByText("Contact")).not.toBeInTheDocument();
    unmount();

    render(
      <MinimalTemplate
        snapshot={snap({ profile: { ...snap().profile, emailPublic: "ada@x.dev" } })}
      />,
    );
    expect(screen.getByRole("link", { name: "ada@x.dev" })).toHaveAttribute(
      "href",
      "mailto:ada@x.dev",
    );
  });

  it("renders nothing for CERTIFICATIONS and does not leak private field names", () => {
    const { container } = render(<MinimalTemplate snapshot={snap()} />);
    expect(screen.queryByText("Certifications")).not.toBeInTheDocument();
    const html = container.innerHTML;
    expect(html).not.toContain("ownerId");
    expect(html).not.toContain("draftRevision");
  });

  it("handles very long bio text without throwing", () => {
    const longBio = "word ".repeat(2000).trim();
    render(<MinimalTemplate snapshot={snap({ profile: { ...snap().profile, bio: longBio } })} />);
    expect(screen.getByText("About")).toBeInTheDocument();
  });
});

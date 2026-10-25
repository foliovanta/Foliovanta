// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import {
  createProject,
  reorderEducation,
  reorderProjects,
  reorderSections,
  reorderSkills,
  updateProfile,
  updateSection,
} from "@/lib/api/portfolios-client";

// Intercepts the real fetch (the API client is NOT mocked) to lock the exact
// wire contract of the projects reorder request. Regression guard for the
// `ids` vs `projectIds` field-name mismatch.
describe("portfolios-client reorderProjects wire contract", () => {
  it("PATCHes `projectIds` (not `ids`) to the reorder endpoint", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: { projects: [], revision: "5" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const result = await reorderProjects("portfolio-1", "4", ["uuid-1", "uuid-2"]);
    expect(result.ok).toBe(true);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("/api/portfolios/portfolio-1/projects/reorder");
    expect(init?.method).toBe("PATCH");
    expect(init?.cache).toBe("no-store");

    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(body).toEqual({ expectedRevision: "4", projectIds: ["uuid-1", "uuid-2"] });
    expect(body).not.toHaveProperty("ids");
  });

  it("education reorder PATCHes `ids` (not `projectIds`)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: { education: [], revision: "3" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const result = await reorderEducation("portfolio-9", "2", ["edu-1", "edu-2"]);
    expect(result.ok).toBe(true);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("/api/portfolios/portfolio-9/education/reorder");
    expect(init?.method).toBe("PATCH");
    expect(init?.cache).toBe("no-store");

    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(body).toEqual({ expectedRevision: "2", ids: ["edu-1", "edu-2"] });
    expect(body).not.toHaveProperty("projectIds");
  });

  it("skills reorder PATCHes `ids` (not `projectIds`)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: { skills: [], revision: "6" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const result = await reorderSkills("portfolio-5", "1", ["skill-1", "skill-2"]);
    expect(result.ok).toBe(true);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("/api/portfolios/portfolio-5/skills/reorder");
    expect(init?.method).toBe("PATCH");
    expect(init?.cache).toBe("no-store");

    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(body).toEqual({ expectedRevision: "1", ids: ["skill-1", "skill-2"] });
    expect(body).not.toHaveProperty("projectIds");
  });

  it("section update PATCHes the section-key endpoint with expectedRevision + isVisible", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: { section: { sectionKey: "PROJECTS", isVisible: false }, revision: "7" },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const result = await updateSection("portfolio-3", "PROJECTS", {
      expectedRevision: "6",
      isVisible: false,
    });
    expect(result.ok).toBe(true);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("/api/portfolios/portfolio-3/sections/PROJECTS");
    expect(init?.method).toBe("PATCH");
    expect(init?.cache).toBe("no-store");

    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(body).toEqual({ expectedRevision: "6", isVisible: false });
  });

  it("section reorder PATCHes `sectionKeys` to the reorder endpoint", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: { sections: [], revision: "9" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const result = await reorderSections("portfolio-7", "8", ["PROFILE", "ABOUT", "PROJECTS"]);
    expect(result.ok).toBe(true);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("/api/portfolios/portfolio-7/sections/reorder");
    expect(init?.method).toBe("PATCH");
    expect(init?.cache).toBe("no-store");

    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(body).toEqual({
      expectedRevision: "8",
      sectionKeys: ["PROFILE", "ABOUT", "PROJECTS"],
    });
  });

  it("createProject POSTs the content fields + expectedRevision", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: { project: {}, revision: "1" } }), {
        status: 201,
        headers: { "content-type": "application/json" },
      }),
    );

    await createProject("portfolio-2", {
      expectedRevision: "0",
      title: "Demo",
      summary: null,
      description: null,
      projectUrl: "https://x.dev",
      repositoryUrl: null,
      isFeatured: true,
    });

    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("/api/portfolios/portfolio-2/projects");
    expect(init?.method).toBe("POST");
    expect(init?.cache).toBe("no-store");
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(body).toEqual({
      expectedRevision: "0",
      title: "Demo",
      summary: null,
      description: null,
      projectUrl: "https://x.dev",
      repositoryUrl: null,
      isFeatured: true,
    });
  });

  it("updateProfile PATCHes the profile fields + expectedRevision", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: { profile: {}, revision: "4" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    await updateProfile("portfolio-8", {
      expectedRevision: "3",
      displayName: "Ada",
      headline: null,
      bio: null,
      location: null,
      emailPublic: null,
    });

    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("/api/portfolios/portfolio-8/profile");
    expect(init?.method).toBe("PATCH");
    expect(init?.cache).toBe("no-store");
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(body).toEqual({
      expectedRevision: "3",
      displayName: "Ada",
      headline: null,
      bio: null,
      location: null,
      emailPublic: null,
    });
  });
});

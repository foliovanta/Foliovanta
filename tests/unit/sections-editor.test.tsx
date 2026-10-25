import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PortfolioSection } from "@/lib/api/portfolios-client";

vi.mock("@/lib/api/portfolios-client", () => ({
  listSections: vi.fn(),
  updateSection: vi.fn(),
  reorderSections: vi.fn(),
}));

import { SectionsEditor } from "@/app/editor/[portfolioId]/[section]/sections-editor";
import { listSections, reorderSections, updateSection } from "@/lib/api/portfolios-client";

const listMock = vi.mocked(listSections);
const updateMock = vi.mocked(updateSection);
const reorderMock = vi.mocked(reorderSections);

const REGISTRY = [
  "PROFILE",
  "ABOUT",
  "PROJECTS",
  "EXPERIENCE",
  "EDUCATION",
  "SKILLS",
  "CERTIFICATIONS",
  "CONTACT",
];

// A full persisted set in a given key order, positioned 0..n-1.
const fullSet = (keys: string[]): PortfolioSection[] =>
  keys.map((sectionKey, position) => row({ id: `r-${sectionKey}`, sectionKey, position }));

const PID = "11111111-1111-1111-1111-111111111111";

const row = (overrides: Partial<PortfolioSection>): PortfolioSection => ({
  id: "r1",
  sectionKey: "PROFILE",
  isVisible: true,
  position: 0,
  layoutVariant: null,
  config: {},
  createdAt: "",
  updatedAt: "",
  ...overrides,
});

const ready = (sections: PortfolioSection[], revision = "0") =>
  listMock.mockResolvedValue({ ok: true, data: { sections, revision } });

// Returns the row <li> for a given section label.
const sectionRow = (label: string) => screen.getByText(label).closest("li") as HTMLElement;

describe("SectionsEditor", () => {
  beforeEach(() => {
    listMock.mockReset();
    updateMock.mockReset();
    reorderMock.mockReset();
  });

  it("shows all default sections (visible) when the server list is empty", async () => {
    ready([]);
    render(<SectionsEditor portfolioId={PID} />);
    expect(await screen.findByText("Profile")).toBeInTheDocument();
    // All 8 registry keys rendered.
    expect(screen.getAllByRole("listitem")).toHaveLength(8);
    // Each inferred default is marked as such and visible.
    expect(within(sectionRow("About")).getByText("Default")).toBeInTheDocument();
    expect(within(sectionRow("About")).getByText("Visible")).toBeInTheDocument();
  });

  it("lets persisted configuration override defaults", async () => {
    ready([row({ id: "a", sectionKey: "ABOUT", isVisible: false })]);
    render(<SectionsEditor portfolioId={PID} />);
    await screen.findByText("About");
    const about = sectionRow("About");
    expect(within(about).getByText("Configured")).toBeInTheDocument();
    expect(within(about).getByText("Hidden")).toBeInTheDocument();
    expect(within(about).getByRole("checkbox")).not.toBeChecked();
    // A section with no row stays a visible default.
    expect(within(sectionRow("Projects")).getByText("Default")).toBeInTheDocument();
  });

  it("persists a visibility change with the current revision", async () => {
    const user = userEvent.setup();
    ready([]);
    updateMock.mockResolvedValue({
      ok: true,
      data: { section: row({ sectionKey: "PROJECTS", isVisible: false }), revision: "1" },
    });
    render(<SectionsEditor portfolioId={PID} />);
    await screen.findByText("Projects");
    await user.click(within(sectionRow("Projects")).getByRole("checkbox"));

    expect(updateMock).toHaveBeenCalledWith(PID, "PROJECTS", {
      expectedRevision: "0",
      isVisible: false,
    });
    expect(await within(sectionRow("Projects")).findByText("Hidden")).toBeInTheDocument();
    expect(within(sectionRow("Projects")).getByText("Configured")).toBeInTheDocument();
  });

  it("updates the revision so the next change uses it", async () => {
    const user = userEvent.setup();
    ready([]);
    updateMock
      .mockResolvedValueOnce({
        ok: true,
        data: { section: row({ sectionKey: "PROJECTS", isVisible: false }), revision: "1" },
      })
      .mockResolvedValueOnce({
        ok: true,
        data: { section: row({ sectionKey: "SKILLS", isVisible: false }), revision: "2" },
      });
    render(<SectionsEditor portfolioId={PID} />);
    await screen.findByText("Projects");
    await user.click(within(sectionRow("Projects")).getByRole("checkbox"));
    await within(sectionRow("Projects")).findByText("Hidden");
    await user.click(within(sectionRow("Skills")).getByRole("checkbox"));

    expect(updateMock).toHaveBeenLastCalledWith(PID, "SKILLS", {
      expectedRevision: "1",
      isVisible: false,
    });
  });

  it("does not change local state when the request fails", async () => {
    const user = userEvent.setup();
    ready([]);
    updateMock.mockResolvedValue({
      ok: false,
      error: { status: 0, code: "NETWORK_ERROR", message: "Network error." },
    });
    render(<SectionsEditor portfolioId={PID} />);
    await screen.findByText("Projects");
    await user.click(within(sectionRow("Projects")).getByRole("checkbox"));

    expect(await screen.findByText(/network error/i)).toBeInTheDocument();
    // Still visible — not optimistically flipped.
    expect(within(sectionRow("Projects")).getByText("Visible")).toBeInTheDocument();
    expect(within(sectionRow("Projects")).getByRole("checkbox")).toBeChecked();
  });

  it("handles a 409 conflict and reloads on request", async () => {
    const user = userEvent.setup();
    ready([]);
    updateMock.mockResolvedValue({
      ok: false,
      error: { status: 409, code: "REVISION_CONFLICT", message: "conflict" },
    });
    render(<SectionsEditor portfolioId={PID} />);
    await screen.findByText("Projects");
    await user.click(within(sectionRow("Projects")).getByRole("checkbox"));

    expect(await screen.findByRole("button", { name: "Reload latest" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reload latest" }));
    expect(listMock).toHaveBeenCalledTimes(2);
  });

  it("recovers from a load error via retry", async () => {
    const user = userEvent.setup();
    listMock
      .mockResolvedValueOnce({
        ok: false,
        error: { status: 500, code: "INTERNAL_ERROR", message: "boom" },
      })
      .mockResolvedValueOnce({ ok: true, data: { sections: [], revision: "0" } });
    render(<SectionsEditor portfolioId={PID} />);
    expect(await screen.findByText("boom")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Profile")).toBeInTheDocument();
  });

  it("moves a section down, sending the full key permutation", async () => {
    const user = userEvent.setup();
    ready([]);
    reorderMock.mockResolvedValue({
      ok: true,
      data: {
        sections: fullSet(["ABOUT", "PROFILE", ...REGISTRY.slice(2)]),
        revision: "1",
      },
    });
    render(<SectionsEditor portfolioId={PID} />);
    await screen.findByText("Profile");
    await user.click(within(sectionRow("Profile")).getByLabelText("Move Profile down"));

    expect(reorderMock).toHaveBeenCalledWith(PID, "0", [
      "ABOUT",
      "PROFILE",
      "PROJECTS",
      "EXPERIENCE",
      "EDUCATION",
      "SKILLS",
      "CERTIFICATIONS",
      "CONTACT",
    ]);
    // New persisted order reflected (ABOUT now first).
    const items = await screen.findAllByRole("listitem");
    expect(within(items[0]!).getByText("About")).toBeInTheDocument();
  });

  it("disables boundary moves", async () => {
    ready([]);
    render(<SectionsEditor portfolioId={PID} />);
    await screen.findByText("Profile");
    expect(within(sectionRow("Profile")).getByLabelText("Move Profile up")).toBeDisabled();
    expect(within(sectionRow("Contact")).getByLabelText("Move Contact down")).toBeDisabled();
  });

  it("keeps local order and shows an error on reorder failure", async () => {
    const user = userEvent.setup();
    ready([]);
    reorderMock.mockResolvedValue({
      ok: false,
      error: { status: 0, code: "NETWORK_ERROR", message: "Network error." },
    });
    render(<SectionsEditor portfolioId={PID} />);
    await screen.findByText("Profile");
    await user.click(within(sectionRow("Profile")).getByLabelText("Move Profile down"));
    expect(await screen.findByText(/network error/i)).toBeInTheDocument();
    const items = screen.getAllByRole("listitem");
    expect(within(items[0]!).getByText("Profile")).toBeInTheDocument(); // order unchanged
  });

  it("handles a 409 conflict on reorder with explicit reload", async () => {
    const user = userEvent.setup();
    ready([]);
    reorderMock.mockResolvedValue({
      ok: false,
      error: { status: 409, code: "REVISION_CONFLICT", message: "conflict" },
    });
    render(<SectionsEditor portfolioId={PID} />);
    await screen.findByText("Profile");
    await user.click(within(sectionRow("Profile")).getByLabelText("Move Profile down"));
    expect(await screen.findByRole("button", { name: "Reload latest" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reload latest" }));
    expect(listMock).toHaveBeenCalledTimes(2);
  });

  it("updates the revision after a reorder so visibility uses it", async () => {
    const user = userEvent.setup();
    ready([]);
    reorderMock.mockResolvedValue({
      ok: true,
      data: { sections: fullSet(REGISTRY), revision: "5" },
    });
    updateMock.mockResolvedValue({
      ok: true,
      data: { section: row({ sectionKey: "PROFILE", isVisible: false }), revision: "6" },
    });
    render(<SectionsEditor portfolioId={PID} />);
    await screen.findByText("Profile");
    await user.click(within(sectionRow("Profile")).getByLabelText("Move Profile down"));
    // After reorder the set is fully persisted; toggle visibility.
    await user.click(within(sectionRow("About")).getByRole("checkbox"));
    expect(updateMock).toHaveBeenLastCalledWith(PID, "ABOUT", {
      expectedRevision: "5",
      isVisible: false,
    });
  });
});

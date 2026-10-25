import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Skill } from "@/lib/api/portfolios-client";

const { setDirtyMock } = vi.hoisted(() => ({ setDirtyMock: vi.fn() }));
vi.mock("@/app/editor/[portfolioId]/editor-shell", () => ({
  useEditorGuard: () => ({ setDirty: setDirtyMock }),
  EditorShell: () => null,
}));

vi.mock("@/lib/api/portfolios-client", () => ({
  listSkills: vi.fn(),
  createSkill: vi.fn(),
  updateSkill: vi.fn(),
  deleteSkill: vi.fn(),
  reorderSkills: vi.fn(),
}));

import { SkillsEditor } from "@/app/editor/[portfolioId]/[section]/skills-editor";
import {
  createSkill,
  deleteSkill,
  listSkills,
  reorderSkills,
  updateSkill,
} from "@/lib/api/portfolios-client";

const listMock = vi.mocked(listSkills);
const createMock = vi.mocked(createSkill);
const updateMock = vi.mocked(updateSkill);
const deleteMock = vi.mocked(deleteSkill);
const reorderMock = vi.mocked(reorderSkills);

const PID = "11111111-1111-1111-1111-111111111111";

const skill = (overrides: Partial<Skill> = {}): Skill => ({
  id: `s-${overrides.position ?? 0}`,
  name: "TypeScript",
  category: null,
  proficiency: null,
  position: 0,
  createdAt: "",
  updatedAt: "",
  ...overrides,
});

const ready = (items: Skill[], revision = "0") =>
  listMock.mockResolvedValue({ ok: true, data: { skills: items, revision } });

describe("SkillsEditor", () => {
  beforeEach(() => {
    [listMock, createMock, updateMock, deleteMock, reorderMock, setDirtyMock].forEach((m) =>
      m.mockReset(),
    );
  });

  it("shows an empty state", async () => {
    ready([]);
    render(<SkillsEditor portfolioId={PID} />);
    expect(await screen.findByText(/no skills yet/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add skill" })).toBeInTheDocument();
  });

  it("renders skills with category and proficiency", async () => {
    ready([skill({ id: "s1", name: "Prisma", category: "Backend", proficiency: "Expert" })]);
    render(<SkillsEditor portfolioId={PID} />);
    expect(await screen.findByText("Prisma")).toBeInTheDocument();
    expect(screen.getByText("Backend · Expert")).toBeInTheDocument();
  });

  it("creates a skill with the current revision", async () => {
    const user = userEvent.setup();
    ready([]);
    createMock.mockResolvedValue({
      ok: true,
      data: { skill: skill({ id: "new", name: "Rust" }), revision: "1" },
    });
    render(<SkillsEditor portfolioId={PID} />);
    await user.click(await screen.findByRole("button", { name: "Add skill" }));
    await user.type(screen.getByLabelText("Name"), "Rust");
    await user.type(screen.getByLabelText("Proficiency"), "Learning");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(createMock).toHaveBeenCalledWith(
      PID,
      expect.objectContaining({ expectedRevision: "0", name: "Rust", proficiency: "Learning" }),
    );
  });

  it("blocks submit with a client validation error (no name)", async () => {
    const user = userEvent.setup();
    ready([]);
    render(<SkillsEditor portfolioId={PID} />);
    await user.click(await screen.findByRole("button", { name: "Add skill" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByText("Name is required")).toBeInTheDocument();
    expect(createMock).not.toHaveBeenCalled();
  });

  it("shows a server validation error and keeps the form", async () => {
    const user = userEvent.setup();
    ready([]);
    createMock.mockResolvedValue({
      ok: false,
      error: {
        status: 400,
        code: "VALIDATION_ERROR",
        message: "invalid",
        details: { name: ["Name is required"] },
      },
    });
    render(<SkillsEditor portfolioId={PID} />);
    await user.click(await screen.findByRole("button", { name: "Add skill" }));
    await user.type(screen.getByLabelText("Name"), "x");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findAllByText("Name is required")).not.toHaveLength(0);
    expect(screen.getByLabelText("Name")).toHaveValue("x");
  });

  it("edits an existing skill", async () => {
    const user = userEvent.setup();
    ready([skill({ id: "s1", name: "Old" })]);
    updateMock.mockResolvedValue({
      ok: true,
      data: { skill: skill({ id: "s1", name: "New" }), revision: "1" },
    });
    render(<SkillsEditor portfolioId={PID} />);
    await user.click(await screen.findByRole("button", { name: "Edit" }));
    const name = screen.getByLabelText("Name");
    await user.clear(name);
    await user.type(name, "New");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(updateMock).toHaveBeenCalledWith(
      PID,
      "s1",
      expect.objectContaining({ expectedRevision: "0", name: "New" }),
    );
  });

  it("requires confirmation to delete and uses the bumped revision", async () => {
    const user = userEvent.setup();
    ready([]);
    createMock.mockResolvedValue({
      ok: true,
      data: { skill: skill({ id: "new", name: "Temp" }), revision: "1" },
    });
    deleteMock.mockResolvedValue({ ok: true, data: { deletedId: "new", revision: "2" } });
    render(<SkillsEditor portfolioId={PID} />);
    await user.click(await screen.findByRole("button", { name: "Add skill" }));
    await user.type(screen.getByLabelText("Name"), "Temp");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(deleteMock).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    expect(deleteMock).toHaveBeenCalledWith(PID, "new", "1");
  });

  it("reorders via move controls with the full id order", async () => {
    const user = userEvent.setup();
    const s1 = skill({ id: "s1", name: "First", position: 0 });
    const s2 = skill({ id: "s2", name: "Second", position: 1 });
    ready([s1, s2]);
    reorderMock.mockResolvedValue({
      ok: true,
      data: {
        skills: [
          { ...s2, position: 0 },
          { ...s1, position: 1 },
        ],
        revision: "1",
      },
    });
    render(<SkillsEditor portfolioId={PID} />);
    await user.click(await screen.findByLabelText("Move First down"));
    expect(reorderMock).toHaveBeenCalledWith(PID, "0", ["s2", "s1"]);
  });

  it("keeps local order on reorder failure", async () => {
    const user = userEvent.setup();
    ready([
      skill({ id: "s1", name: "First", position: 0 }),
      skill({ id: "s2", name: "Second", position: 1 }),
    ]);
    reorderMock.mockResolvedValue({
      ok: false,
      error: { status: 0, code: "NETWORK_ERROR", message: "Network error." },
    });
    render(<SkillsEditor portfolioId={PID} />);
    await user.click(await screen.findByLabelText("Move First down"));
    expect(await screen.findByText(/network error/i)).toBeInTheDocument();
    const items = screen.getAllByRole("listitem");
    expect(within(items[0]!).getByText("First")).toBeInTheDocument();
  });

  it("preserves edits and offers reload on a 409 conflict", async () => {
    const user = userEvent.setup();
    ready([]);
    createMock.mockResolvedValue({
      ok: false,
      error: { status: 409, code: "REVISION_CONFLICT", message: "conflict" },
    });
    render(<SkillsEditor portfolioId={PID} />);
    await user.click(await screen.findByRole("button", { name: "Add skill" }));
    await user.type(screen.getByLabelText("Name"), "Keep me");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("button", { name: "Reload latest" })).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toHaveValue("Keep me");
    await user.click(screen.getByRole("button", { name: "Reload latest" }));
    expect(listMock).toHaveBeenCalledTimes(2);
  });

  it("flags unsaved changes to the editor shell", async () => {
    const user = userEvent.setup();
    ready([]);
    render(<SkillsEditor portfolioId={PID} />);
    await user.click(await screen.findByRole("button", { name: "Add skill" }));
    await user.type(screen.getByLabelText("Name"), "x");
    expect(setDirtyMock).toHaveBeenCalledWith(true);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(setDirtyMock).toHaveBeenLastCalledWith(false);
  });
});

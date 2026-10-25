import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Project } from "@/lib/api/portfolios-client";

const { setDirtyMock } = vi.hoisted(() => ({ setDirtyMock: vi.fn() }));
vi.mock("@/app/editor/[portfolioId]/editor-shell", () => ({
  useEditorGuard: () => ({ setDirty: setDirtyMock }),
  EditorShell: () => null,
}));

vi.mock("@/lib/api/portfolios-client", () => ({
  listProjects: vi.fn(),
  createProject: vi.fn(),
  updateProject: vi.fn(),
  deleteProject: vi.fn(),
  reorderProjects: vi.fn(),
}));

import { ProjectsEditor } from "@/app/editor/[portfolioId]/[section]/projects-editor";
import {
  createProject,
  deleteProject,
  listProjects,
  reorderProjects,
  updateProject,
} from "@/lib/api/portfolios-client";

const listMock = vi.mocked(listProjects);
const createMock = vi.mocked(createProject);
const updateMock = vi.mocked(updateProject);
const deleteMock = vi.mocked(deleteProject);
const reorderMock = vi.mocked(reorderProjects);

const PID = "11111111-1111-1111-1111-111111111111";

const proj = (overrides: Partial<Project> = {}): Project => ({
  id: `p-${overrides.position ?? 0}`,
  title: "A project",
  summary: null,
  description: null,
  projectUrl: null,
  repositoryUrl: null,
  coverAssetId: null,
  isFeatured: false,
  position: 0,
  createdAt: "",
  updatedAt: "",
  ...overrides,
});

function ready(projects: Project[], revision = "0") {
  listMock.mockResolvedValue({ ok: true, data: { projects, revision } });
}

describe("ProjectsEditor", () => {
  beforeEach(() => {
    [listMock, createMock, updateMock, deleteMock, reorderMock, setDirtyMock].forEach((m) =>
      m.mockReset(),
    );
  });

  it("shows an empty state", async () => {
    ready([]);
    render(<ProjectsEditor portfolioId={PID} />);
    expect(await screen.findByText(/no projects yet/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add project" })).toBeInTheDocument();
  });

  it("renders projects with featured badge and links", async () => {
    ready([
      proj({
        id: "p1",
        title: "Featured one",
        isFeatured: true,
        projectUrl: "https://x.dev",
        position: 0,
      }),
      proj({ id: "p2", title: "Second", repositoryUrl: "https://github.com/x", position: 1 }),
    ]);
    render(<ProjectsEditor portfolioId={PID} />);
    expect(await screen.findByText("Featured one")).toBeInTheDocument();
    expect(screen.getByText("Featured")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Live" })).toHaveAttribute("href", "https://x.dev");
    expect(screen.getByRole("link", { name: "Repository" })).toHaveAttribute(
      "href",
      "https://github.com/x",
    );
  });

  it("creates a project with the current revision", async () => {
    const user = userEvent.setup();
    ready([]);
    createMock.mockResolvedValue({
      ok: true,
      data: { project: proj({ id: "new", title: "Built" }), revision: "1" },
    });

    render(<ProjectsEditor portfolioId={PID} />);
    await user.click(await screen.findByRole("button", { name: "Add project" }));
    await user.type(screen.getByLabelText("Title"), "Built");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(createMock).toHaveBeenCalledWith(
      PID,
      expect.objectContaining({ expectedRevision: "0", title: "Built" }),
    );
    expect(await screen.findByText("Built")).toBeInTheDocument();
  });

  it("moves focus to the first field when the create form opens", async () => {
    const user = userEvent.setup();
    ready([]);
    render(<ProjectsEditor portfolioId={PID} />);
    await user.click(await screen.findByRole("button", { name: "Add project" }));
    expect(screen.getByLabelText("Title")).toHaveFocus();
  });

  it("blocks submit with a client validation error (no title)", async () => {
    const user = userEvent.setup();
    ready([]);
    render(<ProjectsEditor portfolioId={PID} />);
    await user.click(await screen.findByRole("button", { name: "Add project" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByText("Title is required")).toBeInTheDocument();
    expect(createMock).not.toHaveBeenCalled();
  });

  it("shows server field errors and keeps the form open", async () => {
    const user = userEvent.setup();
    ready([]);
    createMock.mockResolvedValue({
      ok: false,
      error: {
        status: 400,
        code: "VALIDATION_ERROR",
        message: "invalid",
        details: { projectUrl: ["Must be an http(s) URL"] },
      },
    });
    render(<ProjectsEditor portfolioId={PID} />);
    await user.click(await screen.findByRole("button", { name: "Add project" }));
    await user.type(screen.getByLabelText("Title"), "Built");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Must be an http(s) URL")).toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toHaveValue("Built");
  });

  it("edits an existing project", async () => {
    const user = userEvent.setup();
    ready([proj({ id: "p1", title: "Old" })]);
    updateMock.mockResolvedValue({
      ok: true,
      data: { project: proj({ id: "p1", title: "New" }), revision: "1" },
    });
    render(<ProjectsEditor portfolioId={PID} />);
    await user.click(await screen.findByRole("button", { name: "Edit" }));
    const title = screen.getByLabelText("Title");
    await user.clear(title);
    await user.type(title, "New");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(updateMock).toHaveBeenCalledWith(
      PID,
      "p1",
      expect.objectContaining({ expectedRevision: "0", title: "New" }),
    );
  });

  it("requires explicit confirmation to delete and uses the revision bumped by a prior mutation", async () => {
    const user = userEvent.setup();
    ready([]);
    // Create bumps the shared revision 0 -> 1; the following delete must use 1.
    createMock.mockResolvedValue({
      ok: true,
      data: { project: proj({ id: "new", title: "Added" }), revision: "1" },
    });
    deleteMock.mockResolvedValue({ ok: true, data: { deletedId: "new", revision: "2" } });

    render(<ProjectsEditor portfolioId={PID} />);
    await user.click(await screen.findByRole("button", { name: "Add project" }));
    await user.type(screen.getByLabelText("Title"), "Added");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Added")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(deleteMock).not.toHaveBeenCalled(); // confirmation required
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    expect(deleteMock).toHaveBeenCalledWith(PID, "new", "1");
    expect(screen.queryByText("Added")).not.toBeInTheDocument();
  });

  it("reorders via move controls and persists the full id order", async () => {
    const user = userEvent.setup();
    const p1 = proj({ id: "p1", title: "First", position: 0 });
    const p2 = proj({ id: "p2", title: "Second", position: 1 });
    ready([p1, p2]);
    reorderMock.mockResolvedValue({
      ok: true,
      data: {
        projects: [
          { ...p2, position: 0 },
          { ...p1, position: 1 },
        ],
        revision: "1",
      },
    });
    render(<ProjectsEditor portfolioId={PID} />);
    await user.click(await screen.findByLabelText("Move First down"));
    expect(reorderMock).toHaveBeenCalledWith(PID, "0", ["p2", "p1"]);
  });

  it("surfaces a reorder failure without changing local order", async () => {
    const user = userEvent.setup();
    ready([
      proj({ id: "p1", title: "First", position: 0 }),
      proj({ id: "p2", title: "Second", position: 1 }),
    ]);
    reorderMock.mockResolvedValue({
      ok: false,
      error: { status: 0, code: "NETWORK_ERROR", message: "Network error." },
    });
    render(<ProjectsEditor portfolioId={PID} />);
    await user.click(await screen.findByLabelText("Move First down"));
    expect(await screen.findByText(/network error/i)).toBeInTheDocument();
    const items = screen.getAllByRole("listitem");
    expect(within(items[0]!).getByText("First")).toBeInTheDocument();
  });

  it("keeps unsaved edits and offers reload on a 409 conflict", async () => {
    const user = userEvent.setup();
    ready([]);
    createMock.mockResolvedValue({
      ok: false,
      error: { status: 409, code: "REVISION_CONFLICT", message: "conflict" },
    });
    render(<ProjectsEditor portfolioId={PID} />);
    await user.click(await screen.findByRole("button", { name: "Add project" }));
    await user.type(screen.getByLabelText("Title"), "My work");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("button", { name: "Reload latest" })).toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toHaveValue("My work"); // edits preserved
    await user.click(screen.getByRole("button", { name: "Reload latest" }));
    expect(listMock).toHaveBeenCalledTimes(2); // initial load + reload
  });

  it("shows a network error and preserves the form", async () => {
    const user = userEvent.setup();
    ready([]);
    createMock.mockResolvedValue({
      ok: false,
      error: { status: 0, code: "NETWORK_ERROR", message: "Network error." },
    });
    render(<ProjectsEditor portfolioId={PID} />);
    await user.click(await screen.findByRole("button", { name: "Add project" }));
    await user.type(screen.getByLabelText("Title"), "Draft");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText(/network error/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toHaveValue("Draft");
  });

  it("flags unsaved changes to the editor shell", async () => {
    const user = userEvent.setup();
    ready([]);
    render(<ProjectsEditor portfolioId={PID} />);
    await user.click(await screen.findByRole("button", { name: "Add project" }));
    await user.type(screen.getByLabelText("Title"), "x");
    expect(setDirtyMock).toHaveBeenCalledWith(true);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(setDirtyMock).toHaveBeenLastCalledWith(false);
  });
});

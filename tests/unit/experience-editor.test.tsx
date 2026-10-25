import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Experience } from "@/lib/api/portfolios-client";

const { setDirtyMock } = vi.hoisted(() => ({ setDirtyMock: vi.fn() }));
vi.mock("@/app/editor/[portfolioId]/editor-shell", () => ({
  useEditorGuard: () => ({ setDirty: setDirtyMock }),
  EditorShell: () => null,
}));

vi.mock("@/lib/api/portfolios-client", () => ({
  listExperience: vi.fn(),
  createExperience: vi.fn(),
  updateExperience: vi.fn(),
  deleteExperience: vi.fn(),
  reorderExperience: vi.fn(),
}));

import { ExperienceEditor } from "@/app/editor/[portfolioId]/[section]/experience-editor";
import {
  createExperience,
  deleteExperience,
  listExperience,
  reorderExperience,
  updateExperience,
} from "@/lib/api/portfolios-client";

const listMock = vi.mocked(listExperience);
const createMock = vi.mocked(createExperience);
const updateMock = vi.mocked(updateExperience);
const deleteMock = vi.mocked(deleteExperience);
const reorderMock = vi.mocked(reorderExperience);

const PID = "11111111-1111-1111-1111-111111111111";

const exp = (overrides: Partial<Experience> = {}): Experience => ({
  id: `e-${overrides.position ?? 0}`,
  organization: "Acme",
  roleTitle: "Engineer",
  location: null,
  startDate: null,
  endDate: null,
  isCurrent: false,
  description: null,
  position: 0,
  createdAt: "",
  updatedAt: "",
  ...overrides,
});

const ready = (items: Experience[], revision = "0") =>
  listMock.mockResolvedValue({ ok: true, data: { experiences: items, revision } });

describe("ExperienceEditor", () => {
  beforeEach(() => {
    [listMock, createMock, updateMock, deleteMock, reorderMock, setDirtyMock].forEach((m) =>
      m.mockReset(),
    );
  });

  it("shows an empty state", async () => {
    ready([]);
    render(<ExperienceEditor portfolioId={PID} />);
    expect(await screen.findByText(/no experience yet/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add experience" })).toBeInTheDocument();
  });

  it("renders entries with role, organization, dates and location", async () => {
    ready([
      exp({
        id: "e1",
        roleTitle: "Staff Engineer",
        organization: "Globex",
        location: "Berlin",
        startDate: "2020-01-01T00:00:00.000Z",
        isCurrent: true,
      }),
    ]);
    render(<ExperienceEditor portfolioId={PID} />);
    expect(await screen.findByText("Staff Engineer · Globex")).toBeInTheDocument();
    expect(screen.getByText(/2020-01-01 – Present · Berlin/)).toBeInTheDocument();
  });

  it("creates an entry with the current revision", async () => {
    const user = userEvent.setup();
    ready([]);
    createMock.mockResolvedValue({
      ok: true,
      data: { experience: exp({ id: "new", roleTitle: "Dev" }), revision: "1" },
    });
    render(<ExperienceEditor portfolioId={PID} />);
    await user.click(await screen.findByRole("button", { name: "Add experience" }));
    await user.type(screen.getByLabelText("Organization"), "Acme");
    await user.type(screen.getByLabelText("Role title"), "Dev");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(createMock).toHaveBeenCalledWith(
      PID,
      expect.objectContaining({ expectedRevision: "0", organization: "Acme", roleTitle: "Dev" }),
    );
  });

  it("blocks an invalid date range before submitting", async () => {
    const user = userEvent.setup();
    ready([]);
    render(<ExperienceEditor portfolioId={PID} />);
    await user.click(await screen.findByRole("button", { name: "Add experience" }));
    await user.type(screen.getByLabelText("Organization"), "Acme");
    await user.type(screen.getByLabelText("Role title"), "Dev");
    await user.type(screen.getByLabelText("Start date"), "2022-01-01");
    await user.type(screen.getByLabelText("End date"), "2020-01-01");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByText(/end date must be on or after/i)).toBeInTheDocument();
    expect(createMock).not.toHaveBeenCalled();
  });

  it("disables the end date when the role is current", async () => {
    const user = userEvent.setup();
    ready([]);
    render(<ExperienceEditor portfolioId={PID} />);
    await user.click(await screen.findByRole("button", { name: "Add experience" }));
    await user.type(screen.getByLabelText("End date"), "2021-01-01");
    await user.click(screen.getByLabelText(/currently work here/i));
    const end = screen.getByLabelText("End date");
    expect(end).toBeDisabled();
    expect(end).toHaveValue("");
  });

  it("sends null endDate for a current role on create", async () => {
    const user = userEvent.setup();
    ready([]);
    createMock.mockResolvedValue({
      ok: true,
      data: { experience: exp({ id: "new" }), revision: "1" },
    });
    render(<ExperienceEditor portfolioId={PID} />);
    await user.click(await screen.findByRole("button", { name: "Add experience" }));
    await user.type(screen.getByLabelText("Organization"), "Acme");
    await user.type(screen.getByLabelText("Role title"), "Dev");
    await user.type(screen.getByLabelText("Start date"), "2022-01-01");
    await user.click(screen.getByLabelText(/currently work here/i));
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(createMock).toHaveBeenCalledWith(
      PID,
      expect.objectContaining({ isCurrent: true, endDate: null, startDate: "2022-01-01" }),
    );
  });

  it("edits an existing entry", async () => {
    const user = userEvent.setup();
    ready([exp({ id: "e1", roleTitle: "Old" })]);
    updateMock.mockResolvedValue({
      ok: true,
      data: { experience: exp({ id: "e1", roleTitle: "New" }), revision: "1" },
    });
    render(<ExperienceEditor portfolioId={PID} />);
    await user.click(await screen.findByRole("button", { name: "Edit" }));
    const role = screen.getByLabelText("Role title");
    await user.clear(role);
    await user.type(role, "New");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(updateMock).toHaveBeenCalledWith(
      PID,
      "e1",
      expect.objectContaining({ expectedRevision: "0", roleTitle: "New" }),
    );
  });

  it("requires confirmation to delete and uses the bumped revision", async () => {
    const user = userEvent.setup();
    ready([]);
    createMock.mockResolvedValue({
      ok: true,
      data: { experience: exp({ id: "new", roleTitle: "Temp" }), revision: "1" },
    });
    deleteMock.mockResolvedValue({ ok: true, data: { deletedId: "new", revision: "2" } });
    render(<ExperienceEditor portfolioId={PID} />);
    await user.click(await screen.findByRole("button", { name: "Add experience" }));
    await user.type(screen.getByLabelText("Organization"), "Acme");
    await user.type(screen.getByLabelText("Role title"), "Temp");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(deleteMock).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    expect(deleteMock).toHaveBeenCalledWith(PID, "new", "1");
  });

  it("reorders via move controls with the full id order", async () => {
    const user = userEvent.setup();
    const e1 = exp({ id: "e1", roleTitle: "First", position: 0 });
    const e2 = exp({ id: "e2", roleTitle: "Second", position: 1 });
    ready([e1, e2]);
    reorderMock.mockResolvedValue({
      ok: true,
      data: {
        experiences: [
          { ...e2, position: 0 },
          { ...e1, position: 1 },
        ],
        revision: "1",
      },
    });
    render(<ExperienceEditor portfolioId={PID} />);
    await user.click(await screen.findByLabelText("Move First down"));
    expect(reorderMock).toHaveBeenCalledWith(PID, "0", ["e2", "e1"]);
  });

  it("keeps local order on reorder failure", async () => {
    const user = userEvent.setup();
    ready([
      exp({ id: "e1", roleTitle: "First", position: 0 }),
      exp({ id: "e2", roleTitle: "Second", position: 1 }),
    ]);
    reorderMock.mockResolvedValue({
      ok: false,
      error: { status: 0, code: "NETWORK_ERROR", message: "Network error." },
    });
    render(<ExperienceEditor portfolioId={PID} />);
    await user.click(await screen.findByLabelText("Move First down"));
    expect(await screen.findByText(/network error/i)).toBeInTheDocument();
    const items = screen.getAllByRole("listitem");
    expect(within(items[0]!).getByText(/First/)).toBeInTheDocument();
  });

  it("preserves edits and offers reload on a 409 conflict", async () => {
    const user = userEvent.setup();
    ready([]);
    createMock.mockResolvedValue({
      ok: false,
      error: { status: 409, code: "REVISION_CONFLICT", message: "conflict" },
    });
    render(<ExperienceEditor portfolioId={PID} />);
    await user.click(await screen.findByRole("button", { name: "Add experience" }));
    await user.type(screen.getByLabelText("Organization"), "Acme");
    await user.type(screen.getByLabelText("Role title"), "Keep me");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("button", { name: "Reload latest" })).toBeInTheDocument();
    expect(screen.getByLabelText("Role title")).toHaveValue("Keep me");
    await user.click(screen.getByRole("button", { name: "Reload latest" }));
    expect(listMock).toHaveBeenCalledTimes(2);
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
        details: { roleTitle: ["Role title is required"] },
      },
    });
    render(<ExperienceEditor portfolioId={PID} />);
    await user.click(await screen.findByRole("button", { name: "Add experience" }));
    await user.type(screen.getByLabelText("Organization"), "Acme");
    await user.type(screen.getByLabelText("Role title"), "x");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findAllByText("Role title is required")).not.toHaveLength(0);
    expect(screen.getByLabelText("Organization")).toHaveValue("Acme");
  });

  it("flags unsaved changes to the editor shell", async () => {
    const user = userEvent.setup();
    ready([]);
    render(<ExperienceEditor portfolioId={PID} />);
    await user.click(await screen.findByRole("button", { name: "Add experience" }));
    await user.type(screen.getByLabelText("Organization"), "x");
    expect(setDirtyMock).toHaveBeenCalledWith(true);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(setDirtyMock).toHaveBeenLastCalledWith(false);
  });
});

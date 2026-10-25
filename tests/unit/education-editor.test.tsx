import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Education } from "@/lib/api/portfolios-client";

const { setDirtyMock } = vi.hoisted(() => ({ setDirtyMock: vi.fn() }));
vi.mock("@/app/editor/[portfolioId]/editor-shell", () => ({
  useEditorGuard: () => ({ setDirty: setDirtyMock }),
  EditorShell: () => null,
}));

vi.mock("@/lib/api/portfolios-client", () => ({
  listEducation: vi.fn(),
  createEducation: vi.fn(),
  updateEducation: vi.fn(),
  deleteEducation: vi.fn(),
  reorderEducation: vi.fn(),
}));

import { EducationEditor } from "@/app/editor/[portfolioId]/[section]/education-editor";
import {
  createEducation,
  deleteEducation,
  listEducation,
  reorderEducation,
  updateEducation,
} from "@/lib/api/portfolios-client";

const listMock = vi.mocked(listEducation);
const createMock = vi.mocked(createEducation);
const updateMock = vi.mocked(updateEducation);
const deleteMock = vi.mocked(deleteEducation);
const reorderMock = vi.mocked(reorderEducation);

const PID = "11111111-1111-1111-1111-111111111111";

const edu = (overrides: Partial<Education> = {}): Education => ({
  id: `d-${overrides.position ?? 0}`,
  institution: "MIT",
  degree: null,
  fieldOfStudy: null,
  startDate: null,
  endDate: null,
  description: null,
  position: 0,
  createdAt: "",
  updatedAt: "",
  ...overrides,
});

const ready = (items: Education[], revision = "0") =>
  listMock.mockResolvedValue({ ok: true, data: { education: items, revision } });

describe("EducationEditor", () => {
  beforeEach(() => {
    [listMock, createMock, updateMock, deleteMock, reorderMock, setDirtyMock].forEach((m) =>
      m.mockReset(),
    );
  });

  it("shows an empty state", async () => {
    ready([]);
    render(<EducationEditor portfolioId={PID} />);
    expect(await screen.findByText(/no education yet/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add education" })).toBeInTheDocument();
  });

  it("renders entries with institution, degree, field and dates", async () => {
    ready([
      edu({
        id: "d1",
        institution: "Stanford",
        degree: "BSc",
        fieldOfStudy: "CS",
        startDate: "2015-09-01T00:00:00.000Z",
        endDate: "2019-06-01T00:00:00.000Z",
      }),
    ]);
    render(<EducationEditor portfolioId={PID} />);
    expect(await screen.findByText("Stanford")).toBeInTheDocument();
    expect(screen.getByText(/BSc · CS · 2015-09-01 – 2019-06-01/)).toBeInTheDocument();
  });

  it("creates an entry with the current revision", async () => {
    const user = userEvent.setup();
    ready([]);
    createMock.mockResolvedValue({
      ok: true,
      data: { education: edu({ id: "new", institution: "MIT" }), revision: "1" },
    });
    render(<EducationEditor portfolioId={PID} />);
    await user.click(await screen.findByRole("button", { name: "Add education" }));
    await user.type(screen.getByLabelText("Institution"), "MIT");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(createMock).toHaveBeenCalledWith(
      PID,
      expect.objectContaining({ expectedRevision: "0", institution: "MIT" }),
    );
  });

  it("blocks an invalid date range before submitting", async () => {
    const user = userEvent.setup();
    ready([]);
    render(<EducationEditor portfolioId={PID} />);
    await user.click(await screen.findByRole("button", { name: "Add education" }));
    await user.type(screen.getByLabelText("Institution"), "MIT");
    await user.type(screen.getByLabelText("Start date"), "2020-01-01");
    await user.type(screen.getByLabelText("End date"), "2018-01-01");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByText(/end date must be on or after/i)).toBeInTheDocument();
    expect(createMock).not.toHaveBeenCalled();
  });

  it("edits an existing entry", async () => {
    const user = userEvent.setup();
    ready([edu({ id: "d1", institution: "Old U" })]);
    updateMock.mockResolvedValue({
      ok: true,
      data: { education: edu({ id: "d1", institution: "New U" }), revision: "1" },
    });
    render(<EducationEditor portfolioId={PID} />);
    await user.click(await screen.findByRole("button", { name: "Edit" }));
    const inst = screen.getByLabelText("Institution");
    await user.clear(inst);
    await user.type(inst, "New U");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(updateMock).toHaveBeenCalledWith(
      PID,
      "d1",
      expect.objectContaining({ expectedRevision: "0", institution: "New U" }),
    );
  });

  it("requires confirmation to delete and uses the bumped revision", async () => {
    const user = userEvent.setup();
    ready([]);
    createMock.mockResolvedValue({
      ok: true,
      data: { education: edu({ id: "new", institution: "Temp" }), revision: "1" },
    });
    deleteMock.mockResolvedValue({ ok: true, data: { deletedId: "new", revision: "2" } });
    render(<EducationEditor portfolioId={PID} />);
    await user.click(await screen.findByRole("button", { name: "Add education" }));
    await user.type(screen.getByLabelText("Institution"), "Temp");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(deleteMock).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    expect(deleteMock).toHaveBeenCalledWith(PID, "new", "1");
  });

  it("reorders via move controls with the full id order", async () => {
    const user = userEvent.setup();
    const d1 = edu({ id: "d1", institution: "First", position: 0 });
    const d2 = edu({ id: "d2", institution: "Second", position: 1 });
    ready([d1, d2]);
    reorderMock.mockResolvedValue({
      ok: true,
      data: {
        education: [
          { ...d2, position: 0 },
          { ...d1, position: 1 },
        ],
        revision: "1",
      },
    });
    render(<EducationEditor portfolioId={PID} />);
    await user.click(await screen.findByLabelText("Move First down"));
    expect(reorderMock).toHaveBeenCalledWith(PID, "0", ["d2", "d1"]);
  });

  it("keeps local order on reorder failure", async () => {
    const user = userEvent.setup();
    ready([
      edu({ id: "d1", institution: "First", position: 0 }),
      edu({ id: "d2", institution: "Second", position: 1 }),
    ]);
    reorderMock.mockResolvedValue({
      ok: false,
      error: { status: 0, code: "NETWORK_ERROR", message: "Network error." },
    });
    render(<EducationEditor portfolioId={PID} />);
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
    render(<EducationEditor portfolioId={PID} />);
    await user.click(await screen.findByRole("button", { name: "Add education" }));
    await user.type(screen.getByLabelText("Institution"), "Keep me");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("button", { name: "Reload latest" })).toBeInTheDocument();
    expect(screen.getByLabelText("Institution")).toHaveValue("Keep me");
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
        details: { institution: ["Institution is required"] },
      },
    });
    render(<EducationEditor portfolioId={PID} />);
    await user.click(await screen.findByRole("button", { name: "Add education" }));
    await user.type(screen.getByLabelText("Institution"), "x");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findAllByText("Institution is required")).not.toHaveLength(0);
    expect(screen.getByLabelText("Institution")).toHaveValue("x");
  });

  it("flags unsaved changes to the editor shell", async () => {
    const user = userEvent.setup();
    ready([]);
    render(<EducationEditor portfolioId={PID} />);
    await user.click(await screen.findByRole("button", { name: "Add education" }));
    await user.type(screen.getByLabelText("Institution"), "x");
    expect(setDirtyMock).toHaveBeenCalledWith(true);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(setDirtyMock).toHaveBeenLastCalledWith(false);
  });
});

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api/portfolios-client", () => ({
  getDesign: vi.fn(),
  updateDesign: vi.fn(),
}));

import { DesignEditor } from "@/app/editor/[portfolioId]/[section]/design-editor";
import { getDesign, updateDesign } from "@/lib/api/portfolios-client";
import { defaultDesignForTemplate } from "@/lib/design/config";

const getMock = vi.mocked(getDesign);
const updateMock = vi.mocked(updateDesign);

const PID = "11111111-1111-1111-1111-111111111111";
const design = defaultDesignForTemplate("minimal"); // light, indigo, fraunces/inter

function loaded(revision = "3") {
  getMock.mockResolvedValue({ ok: true, data: { design, templateKey: "minimal", revision } });
}

describe("DesignEditor", () => {
  beforeEach(() => {
    getMock.mockReset();
    updateMock.mockReset();
  });

  it("renders controls reflecting the loaded design", async () => {
    loaded();
    render(<DesignEditor portfolioId={PID} />);
    expect(await screen.findByRole("radio", { name: "Light" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Dark" })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: "Indigo" })).toBeChecked();
    expect(screen.getByLabelText("Heading font")).toHaveValue("fraunces");
    expect(screen.getByLabelText("Projects")).toHaveValue("list");
  });

  it("marks unsaved changes when a control changes", async () => {
    const user = userEvent.setup();
    loaded();
    render(<DesignEditor portfolioId={PID} />);
    await user.click(await screen.findByRole("radio", { name: "Dark" }));
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
  });

  it("saves the design with the loaded revision", async () => {
    const user = userEvent.setup();
    loaded("3");
    updateMock.mockResolvedValue({ ok: true, data: { design, revision: "4" } });
    render(<DesignEditor portfolioId={PID} />);
    await screen.findByRole("radio", { name: "Light" });
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(updateMock).toHaveBeenCalledWith(PID, { ...design, accent: null }, "3");
    expect(await screen.findByText("Saved")).toBeInTheDocument();
  });

  it("blocks saving an invalid custom accent", async () => {
    const user = userEvent.setup();
    loaded();
    render(<DesignEditor portfolioId={PID} />);
    const accent = await screen.findByLabelText("Custom accent (optional)");
    await user.type(accent, "red");
    expect(screen.getByText(/6-digit hex/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("resets to template defaults", async () => {
    const user = userEvent.setup();
    loaded();
    render(<DesignEditor portfolioId={PID} />);
    await user.click(await screen.findByRole("radio", { name: "Dark" }));
    expect(screen.getByRole("radio", { name: "Dark" })).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Reset to defaults" }));
    expect(screen.getByRole("radio", { name: "Light" })).toBeChecked();
  });

  it("surfaces a revision conflict", async () => {
    const user = userEvent.setup();
    loaded();
    updateMock.mockResolvedValue({
      ok: false,
      error: { status: 409, code: "REVISION_CONFLICT", message: "conflict" },
    });
    render(<DesignEditor portfolioId={PID} />);
    await screen.findByRole("radio", { name: "Light" });
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Overwrite with my changes" })).toBeInTheDocument(),
    );
  });
});

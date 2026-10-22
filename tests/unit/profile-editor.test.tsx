import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ProfileDraft } from "@/lib/api/portfolios-client";

vi.mock("@/lib/api/portfolios-client", () => ({
  getProfile: vi.fn(),
  updateProfile: vi.fn(),
}));

import { ProfileEditor } from "@/app/editor/[portfolioId]/[section]/profile-editor";
import { getProfile, updateProfile } from "@/lib/api/portfolios-client";

const getMock = vi.mocked(getProfile);
const updateMock = vi.mocked(updateProfile);

const PID = "11111111-1111-1111-1111-111111111111";

const draft = (overrides: Partial<ProfileDraft> = {}): ProfileDraft => ({
  displayName: "Ada",
  headline: null,
  bio: null,
  location: null,
  avatarAssetId: null,
  emailPublic: null,
  updatedAt: null,
  ...overrides,
});

describe("ProfileEditor", () => {
  beforeEach(() => {
    getMock.mockReset();
    updateMock.mockReset();
  });

  it("loads the draft profile and revision", async () => {
    getMock.mockResolvedValue({ ok: true, data: { profile: draft(), revision: "3" } });
    render(<ProfileEditor portfolioId={PID} />);
    expect(await screen.findByLabelText("Display name")).toHaveValue("Ada");
  });

  it("saves with the current revision and shows Saved", async () => {
    const user = userEvent.setup();
    getMock.mockResolvedValue({ ok: true, data: { profile: draft(), revision: "3" } });
    updateMock.mockResolvedValue({
      ok: true,
      data: { profile: draft({ displayName: "Ada L" }), revision: "4" },
    });

    render(<ProfileEditor portfolioId={PID} />);
    const name = await screen.findByLabelText("Display name");
    await user.type(name, " L");
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(updateMock).toHaveBeenCalledWith(
      PID,
      expect.objectContaining({ expectedRevision: "3", displayName: "Ada L" }),
    );
    expect(await screen.findByText("Saved")).toBeInTheDocument();
  });

  it("preserves edits and offers recovery on a revision conflict", async () => {
    const user = userEvent.setup();
    getMock.mockResolvedValue({ ok: true, data: { profile: draft(), revision: "3" } });
    updateMock.mockResolvedValue({
      ok: false,
      error: { status: 409, code: "REVISION_CONFLICT", message: "conflict" },
    });

    render(<ProfileEditor portfolioId={PID} />);
    const name = await screen.findByLabelText("Display name");
    await user.clear(name);
    await user.type(name, "My local edit");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(
      await screen.findByRole("button", { name: "Overwrite with my changes" }),
    ).toBeInTheDocument();
    // Local edits must be kept, never silently overwritten.
    expect(screen.getByLabelText("Display name")).toHaveValue("My local edit");
  });

  it("shows field validation errors", async () => {
    const user = userEvent.setup();
    getMock.mockResolvedValue({ ok: true, data: { profile: draft(), revision: "3" } });
    updateMock.mockResolvedValue({
      ok: false,
      error: {
        status: 400,
        code: "VALIDATION_ERROR",
        message: "invalid",
        details: { emailPublic: ["Invalid email address"] },
      },
    });

    render(<ProfileEditor portfolioId={PID} />);
    await screen.findByLabelText("Display name");
    // Valid at the input level; the server rejects it. (jsdom blocks submit for
    // a type=email field with an invalid value, so use a well-formed address.)
    await user.type(screen.getByLabelText("Public email"), "ada@example.com");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Invalid email address")).toBeInTheDocument();
  });

  it("shows a network error when the request fails", async () => {
    const user = userEvent.setup();
    getMock.mockResolvedValue({ ok: true, data: { profile: draft(), revision: "3" } });
    updateMock.mockResolvedValue({
      ok: false,
      error: { status: 0, code: "NETWORK_ERROR", message: "Network error." },
    });

    render(<ProfileEditor portfolioId={PID} />);
    await screen.findByLabelText("Display name");
    await user.type(screen.getByLabelText("Headline"), "x");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText(/network error/i)).toBeInTheDocument();
  });
});

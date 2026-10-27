import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
  usePathname: () => "/editor/pid-1/profile",
}));
vi.mock("@/lib/api/portfolios-client", () => ({ getPortfolio: vi.fn() }));

import { EditorShell, useEditorGuard } from "@/app/editor/[portfolioId]/editor-shell";
import { getPortfolio } from "@/lib/api/portfolios-client";

const getPortfolioMock = vi.mocked(getPortfolio);

function DirtyToggle() {
  const { setDirty } = useEditorGuard();
  return (
    <button type="button" onClick={() => setDirty(true)}>
      make dirty
    </button>
  );
}

function renderShell() {
  return render(
    <EditorShell portfolioId="pid-1">
      <DirtyToggle />
    </EditorShell>,
  );
}

describe("EditorShell unsaved-changes guard", () => {
  beforeEach(() => {
    pushMock.mockReset();
    getPortfolioMock.mockResolvedValue({
      ok: true,
      data: {
        id: "pid-1",
        slug: "ada",
        title: "Ada",
        publicationStatus: "DRAFT",
        moderationStatus: "CLEAR",
        publicSlug: "10482",
        username: "ada",
        createdAt: "",
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("navigates to the dashboard without confirmation when there are no unsaved edits", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm");
    renderShell();
    await user.click(await screen.findByRole("button", { name: /dashboard/i }));
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(pushMock).toHaveBeenCalledWith("/dashboard");
  });

  it("does not leave the dashboard link when edits are unsaved and the user cancels", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderShell();
    await user.click(await screen.findByRole("button", { name: "make dirty" }));
    await user.click(screen.getByRole("button", { name: /dashboard/i }));
    expect(confirmSpy).toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("leaves to the dashboard when the user confirms discarding edits", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderShell();
    await user.click(await screen.findByRole("button", { name: "make dirty" }));
    await user.click(screen.getByRole("button", { name: /dashboard/i }));
    expect(pushMock).toHaveBeenCalledWith("/dashboard");
  });

  it("guards section navigation the same way", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(false);
    renderShell();
    await user.click(await screen.findByRole("button", { name: "make dirty" }));
    await user.click(screen.getByRole("button", { name: /Projects/ }));
    expect(pushMock).not.toHaveBeenCalled();
  });
});

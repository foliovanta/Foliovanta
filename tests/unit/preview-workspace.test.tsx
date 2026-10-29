import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api/portfolios-client", () => ({ getPublishStatus: vi.fn() }));

import { PreviewWorkspace } from "@/app/preview/[portfolioId]/preview-workspace";
import { getPublishStatus } from "@/lib/api/portfolios-client";

const statusMock = vi.mocked(getPublishStatus);
const PID = "11111111-1111-1111-1111-111111111111";

function status(overrides = {}) {
  return {
    slug: "ada",
    publicSlug: "10482",
    username: "ada",
    templateKey: "creative",
    publicationStatus: "PUBLISHED" as const,
    moderationStatus: "CLEAR" as const,
    revision: "3",
    publishedAt: "2026-01-01T00:00:00.000Z",
    hasUnpublishedChanges: true,
    readiness: { ok: true as const },
    activeVersion: null,
    ...overrides,
  };
}

describe("PreviewWorkspace", () => {
  beforeEach(() => {
    statusMock.mockReset();
    statusMock.mockResolvedValue({ ok: true, data: status() });
  });

  it("renders a labelled viewport switcher, defaulting to Desktop", () => {
    render(<PreviewWorkspace portfolioId={PID} />);
    expect(screen.getByRole("group", { name: "Preview width" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Desktop/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("1440 px")).toBeInTheDocument();
  });

  it("switches the previewed width", async () => {
    const user = userEvent.setup();
    render(<PreviewWorkspace portfolioId={PID} />);
    await user.click(screen.getByRole("button", { name: /Phone/ }));
    expect(screen.getByRole("button", { name: /Phone/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("375 px")).toBeInTheDocument();
  });

  it("points the iframe at the same-origin frame route and refreshes it", async () => {
    const user = userEvent.setup();
    render(<PreviewWorkspace portfolioId={PID} />);
    const frame = screen.getByTitle("Draft preview");
    expect(frame.getAttribute("src")).toContain(`/preview/${PID}/frame`);
    expect(frame.getAttribute("src")).toContain("v=0");

    await user.click(screen.getByRole("button", { name: /Refresh/ }));
    expect(screen.getByTitle("Draft preview").getAttribute("src")).toContain("v=1");
  });

  it("links back to the editor", () => {
    render(<PreviewWorkspace portfolioId={PID} />);
    expect(screen.getByRole("link", { name: "Back to editor" })).toHaveAttribute(
      "href",
      `/editor/${PID}/profile`,
    );
  });

  it("shows the template and an unpublished-changes indicator from status", async () => {
    render(<PreviewWorkspace portfolioId={PID} />);
    expect(await screen.findByText("Creative template")).toBeInTheDocument();
    expect(screen.getByText("Unpublished changes")).toBeInTheDocument();
  });
});

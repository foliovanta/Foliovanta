import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PublishStatus } from "@/lib/api/portfolios-client";

vi.mock("@/lib/api/portfolios-client", () => ({
  getPublishStatus: vi.fn(),
  publishPortfolio: vi.fn(),
  unpublishPortfolio: vi.fn(),
  listVersions: vi.fn(),
  rollbackPortfolio: vi.fn(),
  updateUsername: vi.fn(),
  updateTemplate: vi.fn(),
}));

import { PublishPanel } from "@/app/editor/[portfolioId]/[section]/publish-panel";
import {
  getPublishStatus,
  listVersions,
  publishPortfolio,
  rollbackPortfolio,
  unpublishPortfolio,
  updateUsername,
} from "@/lib/api/portfolios-client";

const statusMock = vi.mocked(getPublishStatus);
const publishMock = vi.mocked(publishPortfolio);
const unpublishMock = vi.mocked(unpublishPortfolio);
const versionsMock = vi.mocked(listVersions);
const rollbackMock = vi.mocked(rollbackPortfolio);
const usernameMock = vi.mocked(updateUsername);

const PID = "11111111-1111-1111-1111-111111111111";

const status = (overrides: Partial<PublishStatus> = {}): PublishStatus => ({
  slug: "ada",
  publicSlug: "10482",
  username: "ada",
  templateKey: "minimal",
  publicationStatus: "DRAFT",
  moderationStatus: "CLEAR",
  revision: "5",
  publishedAt: null,
  hasUnpublishedChanges: false,
  readiness: { ok: true },
  activeVersion: null,
  ...overrides,
});

describe("PublishPanel", () => {
  beforeEach(() => {
    statusMock.mockReset();
    publishMock.mockReset();
    unpublishMock.mockReset();
    versionsMock.mockReset();
    rollbackMock.mockReset();
    usernameMock.mockReset();
    versionsMock.mockResolvedValue({ ok: true, data: { versions: [], nextCursor: null } });
  });

  it("shows readiness issues with links to their sections and disables publishing", async () => {
    statusMock.mockResolvedValue({
      ok: true,
      data: status({
        readiness: {
          ok: false,
          issues: [{ field: "profile.displayName", code: "REQUIRED", message: "Add your name" }],
        },
      }),
    });

    render(<PublishPanel portfolioId={PID} />);

    expect(await screen.findByText("Add your name")).toBeInTheDocument();
    const fix = screen.getByRole("link", { name: /Fix in Profile/ });
    expect(fix).toHaveAttribute("href", `/editor/${PID}/profile`);
    expect(screen.getByRole("button", { name: "Publish" })).toBeDisabled();
  });

  it("shows the public link only when published and not suspended", async () => {
    statusMock.mockResolvedValue({
      ok: true,
      data: status({ publicationStatus: "PUBLISHED", publishedAt: "2026-01-01T00:00:00.000Z" }),
    });

    render(<PublishPanel portfolioId={PID} />);

    expect(await screen.findByRole("link", { name: /View live portfolio/ })).toHaveAttribute(
      "href",
      "/10482/ada",
    );
    expect(screen.getByRole("button", { name: "Up to date" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Unpublish" })).toBeInTheDocument();
  });

  it("hides the public link and disables publishing when suspended", async () => {
    statusMock.mockResolvedValue({
      ok: true,
      data: status({ publicationStatus: "PUBLISHED", moderationStatus: "SUSPENDED" }),
    });

    render(<PublishPanel portfolioId={PID} />);

    expect(await screen.findByText(/suspended by moderation/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /View live portfolio/ })).not.toBeInTheDocument();
  });

  it("publishes with the loaded revision and refetches on success", async () => {
    const user = userEvent.setup();
    statusMock
      .mockResolvedValueOnce({ ok: true, data: status({ revision: "5" }) })
      .mockResolvedValueOnce({
        ok: true,
        data: status({
          publicationStatus: "PUBLISHED",
          revision: "5",
          publishedAt: "2026-01-01T00:00:00.000Z",
        }),
      });
    publishMock.mockResolvedValue({
      ok: true,
      data: {
        versionNumber: 1,
        publicationStatus: "PUBLISHED",
        publishedAt: "2026-01-01T00:00:00.000Z",
        revision: "5",
        contentHash: "h",
        created: true,
      },
    });

    render(<PublishPanel portfolioId={PID} />);
    await user.click(await screen.findByRole("button", { name: "Publish" }));

    expect(publishMock).toHaveBeenCalledWith(PID, "5");
    expect(await screen.findByText("Published version 1.")).toBeInTheDocument();
    expect(statusMock).toHaveBeenCalledTimes(2); // initial + refetch
  });

  it("reports a no-op when the live content already matches", async () => {
    const user = userEvent.setup();
    statusMock.mockResolvedValue({ ok: true, data: status() });
    publishMock.mockResolvedValue({
      ok: true,
      data: {
        versionNumber: 1,
        publicationStatus: "PUBLISHED",
        publishedAt: "2026-01-01T00:00:00.000Z",
        revision: "5",
        contentHash: "h",
        created: false,
      },
    });

    render(<PublishPanel portfolioId={PID} />);
    await user.click(await screen.findByRole("button", { name: "Publish" }));

    expect(await screen.findByText(/nothing to publish/)).toBeInTheDocument();
  });

  it("surfaces a revision conflict and reloads the latest status", async () => {
    const user = userEvent.setup();
    statusMock.mockResolvedValue({ ok: true, data: status() });
    publishMock.mockResolvedValue({
      ok: false,
      error: { status: 409, code: "REVISION_CONFLICT", message: "conflict" },
    });

    render(<PublishPanel portfolioId={PID} />);
    await user.click(await screen.findByRole("button", { name: "Publish" }));

    expect(await screen.findByText(/draft changed since this view loaded/)).toBeInTheDocument();
    await waitFor(() => expect(statusMock).toHaveBeenCalledTimes(2));
  });

  it("requires a deliberate confirmation to unpublish", async () => {
    const user = userEvent.setup();
    statusMock.mockResolvedValue({
      ok: true,
      data: status({ publicationStatus: "PUBLISHED", publishedAt: "2026-01-01T00:00:00.000Z" }),
    });
    unpublishMock.mockResolvedValue({
      ok: true,
      data: { publicationStatus: "UNPUBLISHED", revision: "5" },
    });

    render(<PublishPanel portfolioId={PID} />);
    await user.click(await screen.findByRole("button", { name: "Unpublish" }));

    // Nothing happens until the explicit confirm.
    expect(unpublishMock).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Confirm unpublish" }));

    expect(unpublishMock).toHaveBeenCalledWith(PID);
    expect(await screen.findByText(/no longer public/)).toBeInTheDocument();
  });

  it("changes the template with the loaded revision and refetches", async () => {
    const user = userEvent.setup();
    statusMock
      .mockResolvedValueOnce({ ok: true, data: status({ templateKey: "minimal", revision: "5" }) })
      .mockResolvedValueOnce({
        ok: true,
        data: status({ templateKey: "creative", revision: "6" }),
      });
    const { updateTemplate } = await import("@/lib/api/portfolios-client");
    const templateMock = vi.mocked(updateTemplate);
    templateMock.mockResolvedValue({ ok: true, data: { templateKey: "creative", revision: "6" } });

    render(<PublishPanel portfolioId={PID} />);
    // The current selection is reflected.
    const minimal = await screen.findByRole("radio", { name: /Minimal/ });
    expect(minimal).toBeChecked();

    await user.click(screen.getByRole("radio", { name: /Creative/ }));

    expect(templateMock).toHaveBeenCalledWith(PID, "creative", "5");
    await waitFor(() => expect(statusMock).toHaveBeenCalledTimes(2));
  });

  it("edits the URL username and refetches so the link stays in sync", async () => {
    const user = userEvent.setup();
    statusMock
      .mockResolvedValueOnce({
        ok: true,
        data: status({ publicationStatus: "PUBLISHED", publishedAt: "2026-01-01T00:00:00.000Z" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        data: status({
          publicationStatus: "PUBLISHED",
          username: "ada-l",
          publishedAt: "2026-01-01T00:00:00.000Z",
        }),
      });
    usernameMock.mockResolvedValue({ ok: true, data: { username: "ada-l" } });

    render(<PublishPanel portfolioId={PID} />);
    const input = await screen.findByLabelText("URL username");
    await user.clear(input);
    await user.type(input, "ada-l");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(usernameMock).toHaveBeenCalledWith(PID, "ada-l");
    await waitFor(() => expect(statusMock).toHaveBeenCalledTimes(2));
  });

  const activeVersion = (versionNumber: number) => ({
    versionNumber,
    publishedAt: "2026-01-02T00:00:00.000Z",
    templateId: "minimal",
    templateVersion: "1",
  });
  const twoVersions = {
    ok: true as const,
    data: {
      versions: [
        { ...activeVersion(2), isActive: true },
        {
          versionNumber: 1,
          publishedAt: "2026-01-01T00:00:00.000Z",
          templateId: "minimal",
          templateVersion: "1",
          isActive: false,
        },
      ],
      nextCursor: null,
    },
  };

  it("renders the version history with the live indicator and a preview link per version", async () => {
    statusMock.mockResolvedValue({
      ok: true,
      data: status({
        publicationStatus: "PUBLISHED",
        publishedAt: "2026-01-02T00:00:00.000Z",
        activeVersion: activeVersion(2),
      }),
    });
    versionsMock.mockResolvedValue(twoVersions);

    render(<PublishPanel portfolioId={PID} />);

    expect(await screen.findByText("Version 2")).toBeInTheDocument();
    expect(screen.getByText("Version 1")).toBeInTheDocument();
    expect(screen.getByText("Live")).toBeInTheDocument();
    // Both versions are previewable; the owner-only historical frame is linked.
    const previews = screen.getAllByRole("link", { name: "Preview" });
    expect(previews).toHaveLength(2);
    expect(previews[0]).toHaveAttribute("href", `/preview/${PID}/version/2`);
  });

  it("rolls back a non-active version after confirmation, sending the active version", async () => {
    const user = userEvent.setup();
    statusMock.mockResolvedValue({
      ok: true,
      data: status({
        publicationStatus: "PUBLISHED",
        publishedAt: "2026-01-02T00:00:00.000Z",
        activeVersion: activeVersion(2),
      }),
    });
    versionsMock.mockResolvedValue(twoVersions);
    rollbackMock.mockResolvedValue({
      ok: true,
      data: {
        activeVersionNumber: 1,
        publicationStatus: "PUBLISHED",
        publishedAt: "2026-01-03T00:00:00.000Z",
        changed: true,
      },
    });

    render(<PublishPanel portfolioId={PID} />);

    // Only the non-active version offers rollback; it takes a deliberate confirm.
    await user.click(await screen.findByRole("button", { name: "Roll back" }));
    expect(rollbackMock).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Make this version live" }));

    // Optimistic concurrency: the active version (2) is sent as expected.
    expect(rollbackMock).toHaveBeenCalledWith(PID, 1, 2);
    await waitFor(() => expect(statusMock).toHaveBeenCalledTimes(2)); // parent refresh
  });

  it("surfaces a rollback conflict and reloads", async () => {
    const user = userEvent.setup();
    statusMock.mockResolvedValue({
      ok: true,
      data: status({
        publicationStatus: "PUBLISHED",
        publishedAt: "2026-01-02T00:00:00.000Z",
        activeVersion: activeVersion(2),
      }),
    });
    versionsMock.mockResolvedValue(twoVersions);
    rollbackMock.mockResolvedValue({
      ok: false,
      error: { status: 409, code: "ROLLBACK_CONFLICT", message: "conflict" },
    });

    render(<PublishPanel portfolioId={PID} />);
    await user.click(await screen.findByRole("button", { name: "Roll back" }));
    await user.click(screen.getByRole("button", { name: "Make this version live" }));

    expect(await screen.findByText(/live version changed/)).toBeInTheDocument();
  });
});

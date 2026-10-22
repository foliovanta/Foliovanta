import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PortfolioSummary } from "@/lib/api/portfolios-client";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("@/lib/api/portfolios-client", () => ({
  listPortfolios: vi.fn(),
  createPortfolio: vi.fn(),
}));

import { DashboardClient } from "@/app/dashboard/dashboard-client";
import { createPortfolio, listPortfolios } from "@/lib/api/portfolios-client";

const listMock = vi.mocked(listPortfolios);
const createMock = vi.mocked(createPortfolio);

const portfolio = (overrides: Partial<PortfolioSummary> = {}): PortfolioSummary => ({
  id: "11111111-1111-1111-1111-111111111111",
  slug: "ada",
  title: "Ada Lovelace",
  publicationStatus: "DRAFT",
  moderationStatus: "CLEAR",
  createdAt: new Date().toISOString(),
  ...overrides,
});

describe("DashboardClient", () => {
  beforeEach(() => {
    listMock.mockReset();
    createMock.mockReset();
  });

  it("shows the create form when no portfolios exist", async () => {
    listMock.mockResolvedValue({ ok: true, data: [] });
    render(<DashboardClient />);
    expect(await screen.findByText("Create your portfolio")).toBeInTheDocument();
  });

  it("renders a card with an edit link for an existing portfolio", async () => {
    listMock.mockResolvedValue({ ok: true, data: [portfolio()] });
    render(<DashboardClient />);
    expect(await screen.findByText("Ada Lovelace")).toBeInTheDocument();
    const edit = screen.getByRole("link", { name: "Edit" });
    expect(edit).toHaveAttribute("href", "/editor/11111111-1111-1111-1111-111111111111/profile");
  });

  it("shows a syncing state while the user is not yet provisioned", async () => {
    listMock.mockResolvedValue({
      ok: false,
      error: { status: 404, code: "USER_NOT_SYNCED", message: "syncing" },
    });
    render(<DashboardClient />);
    expect(await screen.findByText(/setting up your account/i)).toBeInTheDocument();
  });

  it("shows an error with retry on an API failure", async () => {
    listMock.mockResolvedValue({
      ok: false,
      error: { status: 500, code: "INTERNAL_ERROR", message: "Server exploded" },
    });
    render(<DashboardClient />);
    expect(await screen.findByText("Server exploded")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("creates a portfolio and reloads the list", async () => {
    const user = userEvent.setup();
    listMock.mockResolvedValueOnce({ ok: true, data: [] });
    createMock.mockResolvedValue({ ok: true, data: portfolio({ slug: "grace" }) });
    listMock.mockResolvedValueOnce({ ok: true, data: [portfolio({ slug: "grace" })] });

    render(<DashboardClient />);
    const slug = await screen.findByLabelText("Slug");
    await user.type(slug, "grace");
    await user.click(screen.getByRole("button", { name: "Create portfolio" }));

    expect(createMock).toHaveBeenCalledWith({ slug: "grace" });
    expect(await screen.findByRole("link", { name: "Edit" })).toBeInTheDocument();
  });
});

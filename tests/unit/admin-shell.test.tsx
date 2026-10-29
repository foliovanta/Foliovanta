import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/admin" }));

import { AdminShell } from "@/app/admin/admin-shell";

const child = <p>Overview content</p>;

describe("AdminShell", () => {
  it("shows the administrator identity and role", () => {
    render(
      <AdminShell actor={{ role: "SUPER_ADMIN", name: "Ada Lovelace", email: "ada@x.com" }}>
        {child}
      </AdminShell>,
    );
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByText("Super admin")).toBeInTheDocument();
  });

  it("shows the audit-logs destination to SUPER_ADMIN but not to ADMIN", () => {
    const { rerender } = render(
      <AdminShell actor={{ role: "SUPER_ADMIN", name: null, email: null }}>{child}</AdminShell>,
    );
    expect(screen.getByText("Audit logs")).toBeInTheDocument();

    rerender(
      <AdminShell actor={{ role: "ADMIN", name: null, email: null }}>{child}</AdminShell>,
    );
    expect(screen.queryByText("Audit logs")).not.toBeInTheDocument();
    // ADMIN still sees operational destinations.
    expect(screen.getByText("Users")).toBeInTheDocument();
  });

  it("links the implemented destinations for ADMIN", () => {
    render(<AdminShell actor={{ role: "ADMIN", name: null, email: null }}>{child}</AdminShell>);
    // Overview, Users, Portfolios, Reports and Feedback are implemented → links.
    expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute("href", "/admin");
    expect(screen.getByRole("link", { name: "Users" })).toHaveAttribute("href", "/admin/users");
    expect(screen.getByRole("link", { name: "Portfolios" })).toHaveAttribute("href", "/admin/portfolios");
    expect(screen.getByRole("link", { name: "Reports" })).toHaveAttribute("href", "/admin/reports");
    expect(screen.getByRole("link", { name: "Feedback" })).toHaveAttribute("href", "/admin/feedback");
    // Audit logs is SUPER_ADMIN-only, so an ADMIN never sees it at all.
    expect(screen.queryByText("Audit logs")).not.toBeInTheDocument();
  });

  it("links Audit logs for SUPER_ADMIN (now implemented)", () => {
    render(<AdminShell actor={{ role: "SUPER_ADMIN", name: null, email: null }}>{child}</AdminShell>);
    expect(screen.getByRole("link", { name: "Audit logs" })).toHaveAttribute("href", "/admin/audit-logs");
    // Every SUPER_ADMIN destination is implemented now — no "Soon" placeholders.
    expect(screen.queryByText("Soon")).not.toBeInTheDocument();
  });

  it("toggles the mobile navigation", async () => {
    const user = userEvent.setup();
    render(<AdminShell actor={{ role: "ADMIN", name: null, email: null }}>{child}</AdminShell>);
    const toggle = screen.getByRole("button", { name: /menu/i });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
  });
});

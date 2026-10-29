import { describe, expect, it } from "vitest";

import {
  accountReasonRequired,
  portfolioReasonRequired,
  resolveAccountTransition,
  resolvePortfolioTransition,
  validateReason,
} from "@/lib/admin/moderation-policy";

describe("portfolio transitions", () => {
  it("allows the approved transitions", () => {
    expect(resolvePortfolioTransition("SUSPEND", "CLEAR")).toMatchObject({ kind: "apply", to: "SUSPENDED" });
    expect(resolvePortfolioTransition("SUSPEND", "UNDER_REVIEW")).toMatchObject({ kind: "apply", to: "SUSPENDED" });
    expect(resolvePortfolioTransition("MARK_UNDER_REVIEW", "CLEAR")).toMatchObject({ kind: "apply", to: "UNDER_REVIEW" });
    expect(resolvePortfolioTransition("REINSTATE", "SUSPENDED")).toMatchObject({ kind: "apply", to: "CLEAR" });
    expect(resolvePortfolioTransition("CLEAR_REVIEW", "UNDER_REVIEW")).toMatchObject({ kind: "apply", to: "CLEAR" });
  });

  it("treats a re-apply of the current state as an idempotent no-op", () => {
    expect(resolvePortfolioTransition("SUSPEND", "SUSPENDED")).toEqual({ kind: "noop", state: "SUSPENDED" });
    expect(resolvePortfolioTransition("REINSTATE", "CLEAR")).toEqual({ kind: "noop", state: "CLEAR" });
  });

  it("rejects disallowed transitions", () => {
    // MARK_UNDER_REVIEW only from CLEAR, not from SUSPENDED.
    expect(resolvePortfolioTransition("MARK_UNDER_REVIEW", "SUSPENDED")).toEqual({ kind: "invalid" });
    // CLEAR_REVIEW only from UNDER_REVIEW.
    expect(resolvePortfolioTransition("CLEAR_REVIEW", "SUSPENDED")).toEqual({ kind: "invalid" });
  });

  it("flags restrictive actions", () => {
    expect(resolvePortfolioTransition("SUSPEND", "CLEAR")).toMatchObject({ restrictive: true });
    expect(resolvePortfolioTransition("REINSTATE", "SUSPENDED")).toMatchObject({ restrictive: false });
  });

  it("requires a reason only for restrictive actions", () => {
    expect(portfolioReasonRequired("SUSPEND")).toBe(true);
    expect(portfolioReasonRequired("MARK_UNDER_REVIEW")).toBe(true);
    expect(portfolioReasonRequired("REINSTATE")).toBe(false);
    expect(portfolioReasonRequired("CLEAR_REVIEW")).toBe(false);
  });
});

describe("account transitions", () => {
  it("allows ACTIVE↔SUSPENDED and no-ops repeats", () => {
    expect(resolveAccountTransition("SUSPEND", "ACTIVE")).toMatchObject({ kind: "apply", to: "SUSPENDED" });
    expect(resolveAccountTransition("REINSTATE", "SUSPENDED")).toMatchObject({ kind: "apply", to: "ACTIVE" });
    expect(resolveAccountTransition("SUSPEND", "SUSPENDED")).toEqual({ kind: "noop", state: "SUSPENDED" });
  });

  it("cannot suspend or reinstate a deletion-pending account", () => {
    expect(resolveAccountTransition("SUSPEND", "DELETION_PENDING")).toEqual({ kind: "invalid" });
    expect(resolveAccountTransition("REINSTATE", "DELETION_PENDING")).toEqual({ kind: "invalid" });
  });

  it("requires a reason only for suspension", () => {
    expect(accountReasonRequired("SUSPEND")).toBe(true);
    expect(accountReasonRequired("REINSTATE")).toBe(false);
  });
});

describe("validateReason", () => {
  it("requires a non-trivial reason when required", () => {
    expect(validateReason(undefined, true).ok).toBe(false);
    expect(validateReason("  ", true).ok).toBe(false);
    expect(validateReason("ab", true).ok).toBe(false); // too short
    expect(validateReason("spam content", true)).toEqual({ ok: true, reason: "spam content" });
  });

  it("allows an empty reason when optional, trims otherwise", () => {
    expect(validateReason(undefined, false)).toEqual({ ok: true, reason: null });
    expect(validateReason("  looks fine  ", false)).toEqual({ ok: true, reason: "looks fine" });
  });

  it("rejects an over-long reason", () => {
    expect(validateReason("x".repeat(1001), false).ok).toBe(false);
  });
});

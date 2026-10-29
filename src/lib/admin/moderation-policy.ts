// Pure moderation policy: allowed transitions, target states, and whether a
// reason is mandatory. No DB, no auth — the services apply this under a row lock.
//
// Policy (see docs/decisions/M6-3-MODERATION.md):
//  - Portfolio SUSPEND: CLEAR|UNDER_REVIEW → SUSPENDED (reason required).
//    A SUSPENDED portfolio is NOT publicly eligible.
//  - Portfolio MARK_UNDER_REVIEW: CLEAR → UNDER_REVIEW (reason required).
//    UNDER_REVIEW does NOT hide the portfolio.
//  - Portfolio REINSTATE: SUSPENDED → CLEAR (reason optional). Does NOT republish
//    an unpublished portfolio; it only lifts the moderation block.
//  - Portfolio CLEAR_REVIEW: UNDER_REVIEW → CLEAR (reason optional).
//  - Account SUSPEND: ACTIVE → SUSPENDED (reason required). Blocks all owner/admin
//    access and hides every portfolio the account owns.
//  - Account REINSTATE: SUSPENDED → ACTIVE (reason optional).
//  Re-applying a state the target is already in is an idempotent no-op, not an
//  error. Immutable snapshots and draft content are never touched.

import type { PortfolioModerationStatus, UserStatus } from "@/generated/prisma/enums";

export type PortfolioModerationAction =
  | "SUSPEND"
  | "REINSTATE"
  | "MARK_UNDER_REVIEW"
  | "CLEAR_REVIEW";

export type AccountModerationAction = "SUSPEND" | "REINSTATE";

type PortfolioRule = {
  from: readonly PortfolioModerationStatus[];
  to: PortfolioModerationStatus;
  reasonRequired: boolean;
  restrictive: boolean;
};

const PORTFOLIO_RULES: Record<PortfolioModerationAction, PortfolioRule> = {
  SUSPEND: { from: ["CLEAR", "UNDER_REVIEW"], to: "SUSPENDED", reasonRequired: true, restrictive: true },
  MARK_UNDER_REVIEW: { from: ["CLEAR"], to: "UNDER_REVIEW", reasonRequired: true, restrictive: true },
  REINSTATE: { from: ["SUSPENDED"], to: "CLEAR", reasonRequired: false, restrictive: false },
  CLEAR_REVIEW: { from: ["UNDER_REVIEW"], to: "CLEAR", reasonRequired: false, restrictive: false },
};

type AccountRule = {
  from: readonly UserStatus[];
  to: UserStatus;
  reasonRequired: boolean;
  restrictive: boolean;
};

const ACCOUNT_RULES: Record<AccountModerationAction, AccountRule> = {
  SUSPEND: { from: ["ACTIVE"], to: "SUSPENDED", reasonRequired: true, restrictive: true },
  REINSTATE: { from: ["SUSPENDED"], to: "ACTIVE", reasonRequired: false, restrictive: false },
};

export type TransitionResolution<S> =
  | { kind: "noop"; state: S } // already in the target state — idempotent no-op
  | { kind: "apply"; to: S; restrictive: boolean }
  | { kind: "invalid" };

export function resolvePortfolioTransition(
  action: PortfolioModerationAction,
  current: PortfolioModerationStatus,
): TransitionResolution<PortfolioModerationStatus> {
  const rule = PORTFOLIO_RULES[action];
  if (current === rule.to) return { kind: "noop", state: current };
  if (rule.from.includes(current)) return { kind: "apply", to: rule.to, restrictive: rule.restrictive };
  return { kind: "invalid" };
}

export function resolveAccountTransition(
  action: AccountModerationAction,
  current: UserStatus,
): TransitionResolution<UserStatus> {
  const rule = ACCOUNT_RULES[action];
  if (current === rule.to) return { kind: "noop", state: current };
  if (rule.from.includes(current)) return { kind: "apply", to: rule.to, restrictive: rule.restrictive };
  return { kind: "invalid" };
}

export function portfolioReasonRequired(action: PortfolioModerationAction): boolean {
  return PORTFOLIO_RULES[action].reasonRequired;
}

export function accountReasonRequired(action: AccountModerationAction): boolean {
  return ACCOUNT_RULES[action].reasonRequired;
}

export const MAX_REASON_LENGTH = 1000;
export const MIN_REASON_LENGTH = 3;

/** Validate a reason given whether the action requires one. */
export function validateReason(
  reason: string | undefined,
  required: boolean,
): { ok: true; reason: string | null } | { ok: false } {
  const trimmed = reason?.trim() ?? "";
  if (trimmed.length === 0) {
    return required ? { ok: false } : { ok: true, reason: null };
  }
  if (trimmed.length < MIN_REASON_LENGTH || trimmed.length > MAX_REASON_LENGTH) {
    return { ok: false };
  }
  return { ok: true, reason: trimmed };
}

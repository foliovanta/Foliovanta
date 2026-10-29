"use client";

import { useRouter } from "next/navigation";

import { type PortfolioModerationAction, moderatePortfolioRequest } from "@/lib/api/admin-client";

import {
  type ModerationActionConfig,
  ModerationPanel,
  type SubmitOutcome,
} from "../../_components/moderation-panel";

const ACTIONS: Record<PortfolioModerationAction, ModerationActionConfig> = {
  SUSPEND: {
    action: "SUSPEND",
    label: "Suspend",
    tone: "danger",
    reasonRequired: true,
    consequence:
      "The public page, metadata, Open Graph image, sitemap entry and media become immediately inaccessible. The draft and all published versions are preserved.",
    confirmLabel: "Suspend portfolio",
  },
  MARK_UNDER_REVIEW: {
    action: "MARK_UNDER_REVIEW",
    label: "Mark under review",
    tone: "secondary",
    reasonRequired: true,
    consequence: "Flags the portfolio for review. It remains publicly visible — this does not hide it.",
    confirmLabel: "Mark under review",
  },
  REINSTATE: {
    action: "REINSTATE",
    label: "Reinstate",
    tone: "secondary",
    reasonRequired: false,
    consequence:
      "Lifts the moderation block. The portfolio becomes public again ONLY if it is otherwise publication-eligible (published, has an active version, active owner). It is never republished automatically.",
    confirmLabel: "Reinstate portfolio",
  },
  CLEAR_REVIEW: {
    action: "CLEAR_REVIEW",
    label: "Clear review",
    tone: "secondary",
    reasonRequired: false,
    consequence: "Removes the under-review flag and returns the portfolio to CLEAR.",
    confirmLabel: "Clear review",
  },
};

function applicable(status: string): PortfolioModerationAction[] {
  switch (status) {
    case "CLEAR":
      return ["SUSPEND", "MARK_UNDER_REVIEW"];
    case "UNDER_REVIEW":
      return ["SUSPEND", "CLEAR_REVIEW"];
    case "SUSPENDED":
      return ["REINSTATE"];
    default:
      return [];
  }
}

export function PortfolioModerationControls({
  portfolioId,
  moderationStatus,
  canModerate,
  note,
}: {
  portfolioId: string;
  moderationStatus: string;
  canModerate: boolean;
  note: { reason: string | null; at: string } | null;
}) {
  const router = useRouter();
  const actions = canModerate ? applicable(moderationStatus).map((a) => ACTIONS[a]) : [];

  const onSubmit = async (action: string, reason: string): Promise<SubmitOutcome> => {
    const result = await moderatePortfolioRequest(portfolioId, {
      action: action as PortfolioModerationAction,
      expectedModerationStatus: moderationStatus,
      idempotencyKey: crypto.randomUUID(),
      ...(reason ? { reason } : {}),
    });
    if (result.ok) {
      router.refresh();
      return { ok: true, changed: result.data.changed };
    }
    const conflict = result.error.status === 409;
    if (conflict) router.refresh();
    return { ok: false, conflict, message: result.error.message ?? "Couldn't apply the change." };
  };

  return (
    <ModerationPanel
      title="Moderation"
      description="Restrict or restore this portfolio's public visibility."
      currentState={moderationStatus}
      stateKind="moderation"
      note={note}
      actions={actions}
      readOnly={!canModerate}
      onSubmit={onSubmit}
    />
  );
}

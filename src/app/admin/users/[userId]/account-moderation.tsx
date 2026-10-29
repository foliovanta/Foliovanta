"use client";

import { useRouter } from "next/navigation";

import { type AccountModerationAction, moderateAccountRequest } from "@/lib/api/admin-client";

import {
  type ModerationActionConfig,
  ModerationPanel,
  type SubmitOutcome,
} from "../../_components/moderation-panel";

const ACTIONS: Record<AccountModerationAction, ModerationActionConfig> = {
  SUSPEND: {
    action: "SUSPEND",
    label: "Suspend account",
    tone: "danger",
    reasonRequired: true,
    consequence:
      "The account can no longer access owner or admin functionality, and every portfolio it owns becomes immediately inaccessible publicly. Draft content and published versions are preserved.",
    confirmLabel: "Suspend account",
  },
  REINSTATE: {
    action: "REINSTATE",
    label: "Reinstate account",
    tone: "secondary",
    reasonRequired: false,
    consequence:
      "Restores account access. Portfolios become public again only if they are independently publication-eligible; nothing is republished automatically.",
    confirmLabel: "Reinstate account",
  },
};

function applicable(status: string): AccountModerationAction[] {
  if (status === "ACTIVE") return ["SUSPEND"];
  if (status === "SUSPENDED") return ["REINSTATE"];
  return []; // DELETION_PENDING etc. — no moderation actions
}

export function AccountModerationControls({
  userId,
  status,
  role,
  canSuspend,
  note,
}: {
  userId: string;
  status: string;
  role: string;
  canSuspend: boolean;
  note: { reason: string | null; at: string } | null;
}) {
  const router = useRouter();
  // Policy: only USER-role accounts are moderatable here (no admin-on-admin).
  const eligible = canSuspend && role === "USER";
  const actions = eligible ? applicable(status).map((a) => ACTIONS[a]) : [];

  const onSubmit = async (action: string, reason: string): Promise<SubmitOutcome> => {
    const result = await moderateAccountRequest(userId, {
      action: action as AccountModerationAction,
      expectedStatus: status,
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

  const description =
    role === "USER"
      ? "Restrict or restore this account's access and public visibility."
      : "Administrator accounts can't be restricted here.";

  return (
    <ModerationPanel
      title="Account moderation"
      description={description}
      currentState={status}
      stateKind="status"
      note={note}
      actions={actions}
      readOnly={!eligible}
      onSubmit={onSubmit}
    />
  );
}

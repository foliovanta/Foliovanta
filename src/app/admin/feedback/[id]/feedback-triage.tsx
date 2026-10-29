"use client";

import { useRouter } from "next/navigation";

import { triageFeedbackRequest } from "@/lib/api/admin-client";

import { type ModerationActionConfig, ModerationPanel, type SubmitOutcome } from "../../_components/moderation-panel";

const ACTIONS: Record<string, ModerationActionConfig> = {
  REVIEW: { action: "REVIEW", label: "Start review", tone: "secondary", reasonRequired: false, consequence: "Marks this feedback as in review.", confirmLabel: "Mark in review" },
  RESOLVE: { action: "RESOLVE", label: "Resolve", tone: "secondary", reasonRequired: false, consequence: "Marks this feedback resolved. Add an optional resolution note.", confirmLabel: "Resolve feedback" },
  CLOSE: { action: "CLOSE", label: "Close", tone: "secondary", reasonRequired: false, consequence: "Closes this feedback without further action.", confirmLabel: "Close feedback" },
};

function applicable(status: string): string[] {
  switch (status) {
    case "OPEN":
      return ["REVIEW", "RESOLVE", "CLOSE"];
    case "IN_REVIEW":
      return ["RESOLVE", "CLOSE"];
    case "RESOLVED":
      return ["CLOSE"];
    default:
      return [];
  }
}

export function FeedbackTriageControls({ id, status, canTriage }: { id: string; status: string; canTriage: boolean }) {
  const router = useRouter();
  const actions = canTriage ? applicable(status).map((a) => ACTIONS[a]!) : [];

  const onSubmit = async (action: string, reason: string): Promise<SubmitOutcome> => {
    const result = await triageFeedbackRequest(id, {
      action,
      expectedStatus: status,
      idempotencyKey: crypto.randomUUID(),
      ...(reason ? { resolutionNote: reason } : {}),
    });
    if (result.ok) {
      router.refresh();
      return { ok: true, changed: result.data.changed };
    }
    const conflict = result.error.status === 409;
    if (conflict) router.refresh();
    return { ok: false, conflict, message: result.error.message ?? "Couldn't update the feedback." };
  };

  return (
    <ModerationPanel
      title="Triage"
      description="Move this feedback through its lifecycle."
      currentState={status}
      stateKind="neutral"
      note={null}
      actions={actions}
      readOnly={!canTriage}
      onSubmit={onSubmit}
    />
  );
}

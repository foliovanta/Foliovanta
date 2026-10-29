"use client";

import { useRouter } from "next/navigation";

import { triageReportRequest } from "@/lib/api/admin-client";

import { type ModerationActionConfig, ModerationPanel, type SubmitOutcome } from "../../_components/moderation-panel";

const ACTIONS: Record<string, ModerationActionConfig> = {
  REVIEW: { action: "REVIEW", label: "Start review", tone: "secondary", reasonRequired: false, consequence: "Marks this report as under investigation. Does not change the portfolio.", confirmLabel: "Mark in review" },
  DISMISS: { action: "DISMISS", label: "Dismiss", tone: "secondary", reasonRequired: false, consequence: "Closes this report with no enforcement. Does not change the portfolio. Add an optional note.", confirmLabel: "Dismiss report" },
  ACTION: { action: "ACTION", label: "Mark actioned", tone: "danger", reasonRequired: false, consequence: "Use ONLY after you have already suspended the portfolio via its Moderation panel. This records that enforcement happened; it does not suspend the portfolio itself.", confirmLabel: "Mark actioned" },
};

function applicable(status: string): string[] {
  switch (status) {
    case "OPEN":
      return ["REVIEW", "DISMISS", "ACTION"];
    case "IN_REVIEW":
      return ["DISMISS", "ACTION"];
    default:
      return [];
  }
}

export function ReportTriageControls({
  id,
  status,
  canTriage,
  portfolioSuspended,
}: {
  id: string;
  status: string;
  canTriage: boolean;
  portfolioSuspended: boolean;
}) {
  const router = useRouter();
  const actions = canTriage ? applicable(status).map((a) => ACTIONS[a]!) : [];

  const onSubmit = async (action: string, reason: string): Promise<SubmitOutcome> => {
    const result = await triageReportRequest(id, {
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
    return { ok: false, conflict, message: result.error.message ?? "Couldn't update the report." };
  };

  return (
    <div className="flex flex-col gap-2">
      {canTriage && !portfolioSuspended && (
        <p className="text-xs text-zinc-500 dark:text-zinc-500">
          To mark a report <strong>actioned</strong>, suspend the portfolio first from its Moderation panel —
          the server rejects “actioned” unless the portfolio is already suspended.
        </p>
      )}
      <ModerationPanel
        title="Triage"
        description="Investigate this report. Enforcement uses the portfolio Moderation panel, not this control."
        currentState={status}
        stateKind="neutral"
        note={null}
        actions={actions}
        readOnly={!canTriage}
        onSubmit={onSubmit}
      />
    </div>
  );
}

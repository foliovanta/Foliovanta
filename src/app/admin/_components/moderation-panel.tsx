"use client";

import { useState } from "react";

import { Pill } from "./ui";

export type ModerationActionConfig = {
  action: string;
  label: string;
  tone: "danger" | "secondary";
  reasonRequired: boolean;
  // Shown in the confirmation so the admin understands the public consequence.
  consequence: string;
  confirmLabel: string;
};

export type SubmitOutcome =
  | { ok: true; changed: boolean }
  | { ok: false; conflict: boolean; message: string };

export function ModerationPanel({
  title,
  description,
  currentState,
  stateKind,
  note,
  actions,
  readOnly,
  onSubmit,
}: {
  title: string;
  description: string;
  currentState: string;
  stateKind: "moderation" | "status" | "neutral";
  note: { reason: string | null; at: string } | null;
  actions: ModerationActionConfig[];
  readOnly: boolean;
  onSubmit: (action: string, reason: string) => Promise<SubmitOutcome>;
}) {
  const [pending, setPending] = useState<ModerationActionConfig | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "error" | "info"; message: string } | null>(null);
  const [reasonError, setReasonError] = useState(false);

  const open = (action: ModerationActionConfig) => {
    setPending(action);
    setReason("");
    setReasonError(false);
    setNotice(null);
  };
  const cancel = () => {
    setPending(null);
    setReason("");
    setReasonError(false);
  };

  const confirm = async () => {
    if (!pending) return;
    if (pending.reasonRequired && reason.trim().length < 3) {
      setReasonError(true);
      return;
    }
    setBusy(true);
    setNotice(null);
    const outcome = await onSubmit(pending.action, reason.trim());
    setBusy(false);
    if (outcome.ok) {
      setPending(null);
      setReason("");
      setNotice(
        outcome.changed
          ? { tone: "success", message: `${title} updated.` }
          : { tone: "info", message: "No change — the target was already in that state." },
      );
    } else if (outcome.conflict) {
      setPending(null);
      setNotice({ tone: "error", message: outcome.message });
    } else {
      setNotice({ tone: "error", message: outcome.message });
    }
  };

  return (
    <section className="rounded-lg border border-zinc-200 p-5 dark:border-zinc-800">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
          {title}
        </h2>
        <Pill value={currentState} kind={stateKind} />
      </div>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{description}</p>
      {note && (note.reason || note.at) && (
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-500">
          Last change {new Date(note.at).toLocaleString()}
          {note.reason ? ` — “${note.reason}”` : ""}
        </p>
      )}

      {notice && (
        <p
          role={notice.tone === "error" ? "alert" : "status"}
          className={`mt-3 rounded-md border p-3 text-sm ${
            notice.tone === "success"
              ? "border-green-200 bg-green-50 text-green-700 dark:border-green-900/50 dark:bg-green-950/30 dark:text-green-300"
              : notice.tone === "error"
                ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300"
                : "border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
          }`}
        >
          {notice.message}
        </p>
      )}

      {readOnly ? (
        <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-500">
          You don&apos;t have permission to change this.
        </p>
      ) : pending ? (
        <div className="mt-4 flex flex-col gap-3 rounded-md border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/60">
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
            Confirm: {pending.label}
          </p>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">{pending.consequence}</p>
          <div className="flex flex-col gap-1">
            <label htmlFor="moderation-reason" className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Reason {pending.reasonRequired ? "(required)" : "(optional)"}
            </label>
            <textarea
              id="moderation-reason"
              value={reason}
              onChange={(event) => {
                setReason(event.target.value);
                setReasonError(false);
              }}
              rows={3}
              aria-invalid={reasonError}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            />
            {reasonError && (
              <p role="alert" className="text-xs text-red-600 dark:text-red-400">
                Enter a reason (at least 3 characters).
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void confirm()}
              disabled={busy}
              className={`inline-flex min-h-11 items-center rounded-md px-4 text-sm font-medium text-white focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-50 dark:focus-visible:ring-offset-zinc-950 ${
                pending.tone === "danger"
                  ? "bg-red-600 hover:bg-red-700 focus-visible:ring-red-600"
                  : "bg-indigo-600 hover:bg-indigo-700 focus-visible:ring-indigo-600"
              }`}
            >
              {busy ? "Working…" : pending.confirmLabel}
            </button>
            <button
              type="button"
              onClick={cancel}
              disabled={busy}
              className="inline-flex min-h-11 items-center rounded-md border border-zinc-300 px-4 text-sm font-medium text-zinc-800 hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:outline-none disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : actions.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {actions.map((action) => (
            <button
              key={action.action}
              type="button"
              onClick={() => open(action)}
              className={`inline-flex min-h-11 items-center rounded-md border px-4 text-sm font-medium focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none dark:focus-visible:ring-offset-zinc-950 ${
                action.tone === "danger"
                  ? "border-red-300 text-red-700 hover:bg-red-50 focus-visible:ring-red-600 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950/40"
                  : "border-zinc-300 text-zinc-800 hover:bg-zinc-50 focus-visible:ring-indigo-600 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
              }`}
            >
              {action.label}
            </button>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-500">No actions available in this state.</p>
      )}
    </section>
  );
}

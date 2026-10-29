"use client";

import { useEffect, useRef, useState } from "react";

const REASONS = [
  { value: "HARASSMENT", label: "Harassment or hate" },
  { value: "IMPERSONATION", label: "Impersonation" },
  { value: "SPAM", label: "Spam or scams" },
  { value: "INAPPROPRIATE", label: "Inappropriate content" },
  { value: "IP_CONCERN", label: "Intellectual property concern" },
  { value: "OTHER", label: "Other" },
];
const DETAILS_MAX = 2000;
const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

type State = { kind: "idle" | "submitting" | "done" } | { kind: "error"; message: string };

export function ReportPortfolio({ publicSlug }: { publicSlug: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mx-auto flex w-full max-w-3xl justify-center px-4 py-10">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-zinc-400 underline underline-offset-2 hover:text-zinc-600 focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:outline-none dark:text-zinc-500 dark:hover:text-zinc-300"
      >
        Report this portfolio
      </button>
      {open && <ReportDialog publicSlug={publicSlug} onClose={() => setOpen(false)} />}
    </div>
  );
}

function ReportDialog({ publicSlug, onClose }: { publicSlug: string; onClose: () => void }) {
  const [reason, setReason] = useState(REASONS[0]!.value);
  const [details, setDetails] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });
  const firstFieldRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    firstFieldRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Load the Turnstile widget script only if configured.
  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) return;
    const existing = document.querySelector<HTMLScriptElement>("script[data-turnstile]");
    if (existing) return;
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
    script.async = true;
    script.defer = true;
    script.dataset.turnstile = "true";
    document.head.appendChild(script);
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (state.kind === "submitting") return;
    setState({ kind: "submitting" });

    // Read the Turnstile token from its managed hidden field, when present.
    const form = event.currentTarget as HTMLFormElement;
    const token = (form.elements.namedItem("cf-turnstile-response") as HTMLInputElement | null)?.value;

    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          publicSlug,
          reason,
          ...(details.trim() ? { details: details.trim() } : {}),
          ...(token ? { turnstileToken: token } : {}),
        }),
      });
      if (res.ok) {
        setState({ kind: "done" });
        return;
      }
      const body = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
      setState({
        kind: "error",
        message:
          body?.error?.code === "VERIFICATION_FAILED"
            ? "Please complete the verification and try again."
            : res.status === 429 || res.status === 503
              ? "Too many requests right now — please try again later."
              : "Couldn't submit your report. Please try again.",
      });
    } catch {
      setState({ kind: "error", message: "Network error. Please try again." });
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/50 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-title"
        className="w-full max-w-md rounded-lg border border-zinc-200 bg-white p-6 text-zinc-900 shadow-lg dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
        onClick={(e) => e.stopPropagation()}
      >
        {state.kind === "done" ? (
          <div role="status">
            <h2 id="report-title" className="text-lg font-medium">
              Report received
            </h2>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              Thanks. Our team reviews reports and takes action where appropriate. We can&apos;t share
              the outcome of individual reports.
            </p>
            <div className="mt-4">
              <button
                type="button"
                onClick={onClose}
                className="inline-flex min-h-11 items-center rounded-md bg-indigo-600 px-4 text-sm font-medium text-white hover:bg-indigo-700 focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-offset-2 focus-visible:outline-none dark:focus-visible:ring-offset-zinc-900"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit}>
            <h2 id="report-title" className="text-lg font-medium">
              Report this portfolio
            </h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Reports are private and the owner is never told who reported them.
            </p>

            <div className="mt-4 flex flex-col gap-1">
              <label htmlFor="report-reason" className="text-sm font-medium">
                Reason
              </label>
              <select
                id="report-reason"
                ref={firstFieldRef}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="min-h-11 rounded-md border border-zinc-300 bg-white px-3 text-sm focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              >
                {REASONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-3 flex flex-col gap-1">
              <label htmlFor="report-details" className="text-sm font-medium">
                Details <span className="font-normal text-zinc-500">(optional)</span>
              </label>
              <textarea
                id="report-details"
                value={details}
                onChange={(e) => setDetails(e.target.value.slice(0, DETAILS_MAX))}
                rows={4}
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </div>

            {TURNSTILE_SITE_KEY && (
              <div className="mt-3 cf-turnstile" data-sitekey={TURNSTILE_SITE_KEY} />
            )}

            {state.kind === "error" && (
              <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">
                {state.message}
              </p>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="inline-flex min-h-11 items-center rounded-md border border-zinc-300 px-4 text-sm font-medium text-zinc-800 hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:outline-none dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={state.kind === "submitting"}
                className="inline-flex min-h-11 items-center rounded-md bg-indigo-600 px-4 text-sm font-medium text-white hover:bg-indigo-700 focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-50 dark:focus-visible:ring-offset-zinc-900"
              >
                {state.kind === "submitting" ? "Submitting…" : "Submit report"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

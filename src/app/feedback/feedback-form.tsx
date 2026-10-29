"use client";

import { useState } from "react";

const MESSAGE_MAX = 4000; // keep in sync with FEEDBACK_MESSAGE_MAX (server)

const CATEGORIES = [
  { value: "BUG", label: "Bug" },
  { value: "FEATURE_REQUEST", label: "Feature request" },
  { value: "USABILITY", label: "Usability" },
  { value: "OTHER", label: "Other" },
];

type State = { kind: "idle" | "submitting" | "success" } | { kind: "error"; message: string };

export function FeedbackForm() {
  const [category, setCategory] = useState("BUG");
  const [message, setMessage] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });

  const tooLong = message.length > MESSAGE_MAX;
  const canSubmit = message.trim().length > 0 && !tooLong && state.kind !== "submitting";

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    setState({ kind: "submitting" });
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ category, message: message.trim() }),
      });
      if (res.ok) {
        // Only claim success after the server confirmed persistence.
        setState({ kind: "success" });
        setMessage("");
        return;
      }
      const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      setState({
        kind: "error",
        message:
          res.status === 429
            ? "You're sending feedback too quickly — wait a moment and try again."
            : (body?.error?.message ?? "Couldn't send your feedback. Please try again."),
      });
    } catch {
      setState({ kind: "error", message: "Network error. Your text is preserved — try again." });
    }
  };

  if (state.kind === "success") {
    return (
      <div role="status" className="rounded-lg border border-green-200 bg-green-50 p-6 dark:border-green-900/50 dark:bg-green-950/30">
        <p className="text-sm font-medium text-green-800 dark:text-green-200">Thanks — your feedback was sent.</p>
        <button
          type="button"
          onClick={() => setState({ kind: "idle" })}
          className="mt-3 text-sm text-green-800 underline underline-offset-2 hover:text-green-900 focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:outline-none dark:text-green-300"
        >
          Send more feedback
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex flex-col gap-1">
        <label htmlFor="fb-category" className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
          Category
        </label>
        <select
          id="fb-category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="min-h-11 rounded-md border border-zinc-300 bg-white px-3 text-sm focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
        >
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="fb-message" className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
          Message
        </label>
        <textarea
          id="fb-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={6}
          maxLength={MESSAGE_MAX + 100}
          aria-invalid={tooLong}
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
        />
        <p className={`text-xs ${tooLong ? "text-red-600 dark:text-red-400" : "text-zinc-500 dark:text-zinc-400"}`}>
          {message.length}/{MESSAGE_MAX}
        </p>
      </div>

      {state.kind === "error" && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.message}
        </p>
      )}

      <div>
        <button
          type="submit"
          disabled={!canSubmit}
          className="inline-flex min-h-11 items-center rounded-md bg-indigo-600 px-4 text-sm font-medium text-white hover:bg-indigo-700 focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 dark:focus-visible:ring-offset-zinc-950"
        >
          {state.kind === "submitting" ? "Sending…" : "Send feedback"}
        </button>
      </div>
    </form>
  );
}

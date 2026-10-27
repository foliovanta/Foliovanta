"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { publicPortfolioPath } from "@/lib/urls/public-url";
import {
  type ApiError,
  type PortfolioSummary,
  createPortfolio,
  listPortfolios,
} from "@/lib/api/portfolios-client";

type LoadState =
  | { kind: "loading" }
  | { kind: "syncing" }
  | { kind: "error"; error: ApiError }
  | { kind: "ready"; portfolios: PortfolioSummary[] };

const MAX_SYNC_ATTEMPTS = 4;

export function DashboardClient() {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [syncAttempt, setSyncAttempt] = useState(0);
  // Bumped to force a reload (e.g. after creating a portfolio) even when
  // syncAttempt is unchanged.
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let active = true;
    listPortfolios().then((result) => {
      if (!active) return;

      if (result.ok) {
        setState({ kind: "ready", portfolios: result.data });
        return;
      }

      // The Clerk webhook may not have provisioned the user row yet; retry a
      // few times before surfacing an error.
      if (result.error.code === "USER_NOT_SYNCED" && syncAttempt < MAX_SYNC_ATTEMPTS) {
        setState({ kind: "syncing" });
        window.setTimeout(
          () => {
            if (active) setSyncAttempt((current) => current + 1);
          },
          1000 * 2 ** syncAttempt,
        );
        return;
      }

      setState({ kind: "error", error: result.error });
    });

    return () => {
      active = false;
    };
  }, [syncAttempt, reloadToken]);

  const retry = () => {
    setSyncAttempt(0);
    setReloadToken((current) => current + 1);
    setState({ kind: "loading" });
  };

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10 font-sans sm:px-6">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Your portfolios
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Create and manage your Foliovanta portfolio.
        </p>
      </header>

      {state.kind === "loading" && <StatusPanel>Loading your portfolios…</StatusPanel>}

      {state.kind === "syncing" && (
        <StatusPanel>Setting up your account. This only takes a moment…</StatusPanel>
      )}

      {state.kind === "error" && <ErrorPanel error={state.error} onRetry={retry} />}

      {state.kind === "ready" && <DashboardReady portfolios={state.portfolios} onChange={retry} />}
    </main>
  );
}

function DashboardReady({
  portfolios,
  onChange,
}: {
  portfolios: PortfolioSummary[];
  onChange: () => void;
}) {
  if (portfolios.length === 0) {
    return <CreatePortfolioForm onCreated={onChange} empty />;
  }

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-4">
        {portfolios.map((portfolio) => (
          <li key={portfolio.id}>
            <PortfolioCard portfolio={portfolio} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function PortfolioCard({ portfolio }: { portfolio: PortfolioSummary }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="min-w-0">
        <p className="truncate text-base font-medium text-zinc-900 dark:text-zinc-100">
          {portfolio.title || portfolio.slug}
        </p>
        <p className="mt-0.5 truncate text-sm text-zinc-500 dark:text-zinc-400">
          /{portfolio.slug}
        </p>
        <span className="mt-2 inline-block rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
          {portfolio.publicationStatus}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {portfolio.publicationStatus === "PUBLISHED" &&
          portfolio.moderationStatus !== "SUSPENDED" && (
            <a
              href={publicPortfolioPath(portfolio.publicSlug, portfolio.username)}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex min-h-11 items-center justify-center rounded-md border border-zinc-300 px-4 text-sm font-medium text-zinc-800 transition hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:outline-none dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              View live
            </a>
          )}
        <Link
          href={`/editor/${portfolio.id}/profile`}
          className="inline-flex min-h-11 items-center justify-center rounded-md bg-indigo-600 px-4 text-sm font-medium text-white transition hover:bg-indigo-700 focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-offset-2 focus-visible:outline-none dark:focus-visible:ring-offset-zinc-950"
        >
          Edit
        </Link>
      </div>
    </div>
  );
}

function CreatePortfolioForm({ onCreated, empty }: { onCreated: () => void; empty?: boolean }) {
  const [title, setTitle] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    // The public URL is /{publicSlug}/{username}; the user no longer chooses a
    // slug. Only an optional title is collected; the rest is set server-side.
    const result = await createPortfolio(title.trim() ? { title: title.trim() } : {});

    setSubmitting(false);

    if (result.ok) {
      onCreated();
      return;
    }

    setError(result.error.message);
  };

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-4 rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <div>
        <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-100">
          {empty ? "Create your portfolio" : "New portfolio"}
        </h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Give it a title to get started. You can set your public URL once it&apos;s created.
        </p>
      </div>

      <TextField
        id="portfolio-title"
        label="Title (optional)"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="Ada Lovelace — Portfolio"
        autoComplete="off"
      />

      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <div>
        <Button type="submit" disabled={submitting}>
          {submitting ? "Creating…" : "Create portfolio"}
        </Button>
      </div>
    </form>
  );
}

function StatusPanel({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="status"
      className="rounded-lg border border-zinc-200 bg-white p-6 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400"
    >
      {children}
    </div>
  );
}

function ErrorPanel({ error, onRetry }: { error: ApiError; onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-col gap-3 rounded-lg border border-red-200 bg-red-50 p-6 dark:border-red-900/50 dark:bg-red-950/30"
    >
      <p className="text-sm text-red-700 dark:text-red-300">{error.message}</p>
      <div>
        <Button variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      </div>
    </div>
  );
}

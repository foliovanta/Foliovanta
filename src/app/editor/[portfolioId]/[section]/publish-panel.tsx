"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  type ApiError,
  type PublishStatus,
  type VersionSummary,
  getPublishStatus,
  listVersions,
  publishPortfolio,
  unpublishPortfolio,
  updateUsername,
} from "@/lib/api/portfolios-client";
import { publicPortfolioPath, publicPortfolioUrl } from "@/lib/urls/public-url";

type Load =
  | { kind: "loading" }
  | { kind: "error"; error: ApiError }
  | { kind: "ready"; status: PublishStatus };

type Action = "idle" | "publishing" | "unpublishing";
type Notice = { tone: "success" | "error" | "info" | "conflict"; message: string };

const FIELD_SECTION: Record<string, string> = {
  profile: "profile",
  projects: "projects",
  experience: "experience",
  education: "education",
  skills: "skills",
};

function sectionLabel(section: string) {
  return section.charAt(0).toUpperCase() + section.slice(1);
}

export function PublishPanel({ portfolioId }: { portfolioId: string }) {
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [action, setAction] = useState<Action>("idle");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [confirmingUnpublish, setConfirmingUnpublish] = useState(false);

  const refresh = useCallback(async () => {
    const result = await getPublishStatus(portfolioId);
    setLoad(
      result.ok ? { kind: "ready", status: result.data } : { kind: "error", error: result.error },
    );
  }, [portfolioId]);

  useEffect(() => {
    let active = true;
    getPublishStatus(portfolioId).then((result) => {
      if (!active) return;
      setLoad(
        result.ok ? { kind: "ready", status: result.data } : { kind: "error", error: result.error },
      );
    });
    return () => {
      active = false;
    };
  }, [portfolioId]);

  if (load.kind === "loading") {
    return (
      <p role="status" className="text-sm text-zinc-600 dark:text-zinc-400">
        Loading publishing status…
      </p>
    );
  }

  if (load.kind === "error") {
    return (
      <div role="alert" className="flex flex-col items-start gap-3">
        <p className="text-sm text-red-600 dark:text-red-400">
          {load.error.status === 404
            ? "This portfolio doesn't exist or you don't have access to it."
            : (load.error.message ?? "Unable to load publishing status.")}
        </p>
        <Button variant="secondary" onClick={() => void refresh()}>
          Try again
        </Button>
      </div>
    );
  }

  const status = load.status;
  const suspended = status.moderationStatus === "SUSPENDED";
  const published = status.publicationStatus === "PUBLISHED";
  const ready = status.readiness.ok;

  const handlePublish = async () => {
    setAction("publishing");
    setNotice(null);
    const result = await publishPortfolio(portfolioId, status.revision);
    setAction("idle");

    if (result.ok) {
      setNotice(
        result.data.created
          ? { tone: "success", message: `Published version ${result.data.versionNumber}.` }
          : {
              tone: "info",
              message: "Your live portfolio already matches the draft — nothing to publish.",
            },
      );
      await refresh();
      return;
    }
    handleMutationError(result.error, true);
  };

  const handleUnpublish = async () => {
    setConfirmingUnpublish(false);
    setAction("unpublishing");
    setNotice(null);
    const result = await unpublishPortfolio(portfolioId);
    setAction("idle");

    if (result.ok) {
      setNotice({ tone: "success", message: "Your portfolio is no longer public." });
      await refresh();
      return;
    }
    handleMutationError(result.error, false);
  };

  function handleMutationError(error: ApiError, isPublish: boolean) {
    if (error.status === 409 && error.code === "REVISION_CONFLICT") {
      setNotice({
        tone: "conflict",
        message:
          "Your draft changed since this view loaded. Reloaded the latest — review and try again.",
      });
      void refresh();
    } else if (error.code === "NOT_READY") {
      setNotice({ tone: "error", message: "Resolve the issues below before publishing." });
      void refresh();
    } else if (error.code === "PORTFOLIO_SUSPENDED") {
      setNotice({ tone: "error", message: "This portfolio is suspended and can't be published." });
      void refresh();
    } else if (error.code === "NETWORK_ERROR") {
      setNotice({ tone: "error", message: "Network error. Please try again." });
    } else {
      setNotice({
        tone: "error",
        message: error.message || `Couldn't ${isPublish ? "publish" : "unpublish"}.`,
      });
    }
  }

  const busy = action !== "idle";
  const publishLabel =
    action === "publishing"
      ? "Publishing…"
      : status.hasUnpublishedChanges
        ? "Publish changes"
        : published
          ? "Up to date"
          : "Publish";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-100">Publishing</h2>
        <StatusBadge status={status} action={action} />
      </div>

      {notice && <NoticeBanner notice={notice} />}

      {suspended && (
        <p
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300"
        >
          This portfolio is suspended by moderation and is not publicly visible. Publishing is
          disabled.
        </p>
      )}

      {!ready && !suspended && <ReadinessList status={status} portfolioId={portfolioId} />}

      {published && !suspended && (
        <PublicLink
          portfolioId={portfolioId}
          publicSlug={status.publicSlug}
          username={status.username}
          onUsernameChanged={() => void refresh()}
        />
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          onClick={() => void handlePublish()}
          disabled={busy || suspended || !ready || (published && !status.hasUnpublishedChanges)}
        >
          {publishLabel}
        </Button>

        {published &&
          (confirmingUnpublish ? (
            <>
              <Button variant="danger" onClick={() => void handleUnpublish()} disabled={busy}>
                {action === "unpublishing" ? "Unpublishing…" : "Confirm unpublish"}
              </Button>
              <Button variant="ghost" onClick={() => setConfirmingUnpublish(false)} disabled={busy}>
                Cancel
              </Button>
              <span className="text-sm text-zinc-500 dark:text-zinc-400">
                Your public portfolio will immediately become unavailable. Draft and version history
                are kept.
              </span>
            </>
          ) : (
            <Button
              variant="secondary"
              onClick={() => setConfirmingUnpublish(true)}
              disabled={busy}
            >
              Unpublish
            </Button>
          ))}
      </div>

      <VersionHistory portfolioId={portfolioId} />
    </div>
  );
}

function StatusBadge({ status, action }: { status: PublishStatus; action: Action }) {
  const { label, className } = describeStatus(status, action);
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-medium ${className}`} aria-live="polite">
      {label}
    </span>
  );
}

function describeStatus(
  status: PublishStatus,
  action: Action,
): { label: string; className: string } {
  const amber = "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300";
  const green = "bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-300";
  const zinc = "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300";
  const red = "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300";

  if (action === "publishing") return { label: "Publishing…", className: amber };
  if (action === "unpublishing") return { label: "Unpublishing…", className: amber };
  if (status.moderationStatus === "SUSPENDED") return { label: "Suspended", className: red };
  if (status.publicationStatus === "DRAFT")
    return { label: "Draft · not published", className: zinc };
  if (status.publicationStatus === "UNPUBLISHED") return { label: "Unpublished", className: zinc };
  if (status.hasUnpublishedChanges)
    return { label: "Published · unpublished changes", className: amber };
  return { label: "Published · up to date", className: green };
}

function NoticeBanner({ notice }: { notice: Notice }) {
  const tones: Record<Notice["tone"], string> = {
    success:
      "border-green-200 bg-green-50 text-green-700 dark:border-green-900/50 dark:bg-green-950/30 dark:text-green-300",
    info: "border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300",
    error:
      "border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300",
    conflict:
      "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200",
  };
  return (
    <p
      role={notice.tone === "error" || notice.tone === "conflict" ? "alert" : "status"}
      className={`rounded-md border p-4 text-sm ${tones[notice.tone]}`}
    >
      {notice.message}
    </p>
  );
}

function ReadinessList({ status, portfolioId }: { status: PublishStatus; portfolioId: string }) {
  if (status.readiness.ok) return null;
  return (
    <div className="rounded-md border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
      <h3 className="text-sm font-medium text-amber-900 dark:text-amber-200">
        Resolve these before publishing
      </h3>
      <ul className="mt-2 flex flex-col gap-1.5 text-sm text-amber-800 dark:text-amber-300">
        {status.readiness.issues.map((issue, index) => {
          const section = FIELD_SECTION[issue.field.split(".")[0] ?? ""];
          return (
            <li key={index} className="flex flex-wrap items-center gap-2">
              <span>{issue.message}</span>
              {section && (
                <Link
                  href={`/editor/${portfolioId}/${section}`}
                  className="underline underline-offset-2 hover:text-amber-950 focus-visible:ring-2 focus-visible:ring-amber-600 focus-visible:outline-none dark:hover:text-amber-100"
                >
                  Fix in {sectionLabel(section)}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function PublicLink({
  portfolioId,
  publicSlug,
  username,
  onUsernameChanged,
}: {
  portfolioId: string;
  publicSlug: string;
  username: string;
  onUsernameChanged: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [draft, setDraft] = useState(username);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Build from authoritative publicSlug + current username. The displayed/
  // copied URL always reflects the latest username (refetched after a save).
  const path = publicPortfolioPath(publicSlug, username);
  const href = publicPortfolioUrl(publicSlug, username);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const saveUsername = async () => {
    setSaving(true);
    setError(null);
    const result = await updateUsername(portfolioId, draft);
    setSaving(false);
    if (result.ok) {
      onUsernameChanged(); // refetch status so the link stays in sync
    } else {
      setError(
        result.error.code === "INVALID_USERNAME"
          ? "Use letters, numbers and hyphens."
          : (result.error.message ?? "Couldn't update the username."),
      );
    }
  };

  const dirty = draft !== username;

  return (
    <div className="flex flex-col gap-3 rounded-md border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <p className="text-xs font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
        Live portfolio
      </p>
      <p className="truncate font-mono text-sm text-zinc-700 dark:text-zinc-300">{href}</p>
      <div className="flex flex-wrap gap-2">
        <a
          href={path}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex min-h-11 items-center justify-center rounded-md border border-zinc-300 px-4 text-sm font-medium text-zinc-800 hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:outline-none dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          View live portfolio ↗
        </a>
        <Button variant="secondary" onClick={() => void copy()}>
          {copied ? "Copied!" : "Copy link"}
        </Button>
      </div>

      <div className="flex flex-col gap-1.5 border-t border-zinc-200 pt-3 dark:border-zinc-800">
        <label
          htmlFor="public-username"
          className="text-xs font-medium text-zinc-600 dark:text-zinc-400"
        >
          URL username
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm text-zinc-400">/{publicSlug}/</span>
          <input
            id="public-username"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            className="min-h-11 flex-1 rounded-md border border-zinc-300 px-3 font-mono text-sm text-zinc-900 focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
          />
          <Button
            variant="secondary"
            onClick={() => void saveUsername()}
            disabled={saving || !dirty}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
        {error && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

function VersionHistory({ portfolioId }: { portfolioId: string }) {
  const [versions, setVersions] = useState<VersionSummary[]>([]);
  const [cursor, setCursor] = useState<number | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    let active = true;
    listVersions(portfolioId).then((result) => {
      if (!active) return;
      if (result.ok) {
        setVersions(result.data.versions);
        setCursor(result.data.nextCursor);
        setState("ready");
      } else {
        setState("error");
      }
    });
    return () => {
      active = false;
    };
  }, [portfolioId]);

  const loadMore = async () => {
    if (cursor === null) return;
    setLoadingMore(true);
    const result = await listVersions(portfolioId, cursor);
    setLoadingMore(false);
    if (result.ok) {
      setVersions((prev) => [...prev, ...result.data.versions]);
      setCursor(result.data.nextCursor);
    }
  };

  if (state === "loading" || (state === "ready" && versions.length === 0)) {
    return null; // nothing to show until there is published history
  }

  return (
    <section className="border-t border-zinc-200 pt-6 dark:border-zinc-800">
      <h3 className="mb-3 text-xs font-semibold tracking-widest text-zinc-400 uppercase">
        Version history
      </h3>
      {state === "error" ? (
        <p className="text-sm text-red-600 dark:text-red-400">Unable to load version history.</p>
      ) : (
        <>
          <ul className="flex flex-col gap-2">
            {versions.map((version) => (
              <li
                key={version.versionNumber}
                className="flex flex-wrap items-center justify-between gap-2 text-sm"
              >
                <span className="flex items-center gap-2">
                  <span className="font-medium text-zinc-900 dark:text-zinc-100">
                    Version {version.versionNumber}
                  </span>
                  {version.isActive && (
                    <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800 dark:bg-green-950/40 dark:text-green-300">
                      Active
                    </span>
                  )}
                </span>
                <span className="text-zinc-500 dark:text-zinc-400">
                  {new Date(version.publishedAt).toLocaleString()} · {version.templateId}
                </span>
              </li>
            ))}
          </ul>
          {cursor !== null && (
            <div className="mt-3">
              <Button variant="ghost" onClick={() => void loadMore()} disabled={loadingMore}>
                {loadingMore ? "Loading…" : "Load more"}
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

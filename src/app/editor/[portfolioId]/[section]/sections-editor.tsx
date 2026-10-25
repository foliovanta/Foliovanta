"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  type ApiError,
  type PortfolioSection,
  listSections,
  reorderSections,
  updateSection,
} from "@/lib/api/portfolios-client";

// The documented section registry (BACKEND_SCHEMA.md §3.4) in its default order.
// Kept client-side as a small constant (the server enum module is server-only).
const SECTIONS: { key: string; label: string }[] = [
  { key: "PROFILE", label: "Profile" },
  { key: "ABOUT", label: "About" },
  { key: "PROJECTS", label: "Projects" },
  { key: "EXPERIENCE", label: "Experience" },
  { key: "EDUCATION", label: "Education" },
  { key: "SKILLS", label: "Skills" },
  { key: "CERTIFICATIONS", label: "Certifications" },
  { key: "CONTACT", label: "Contact" },
];

type SectionView = {
  key: string;
  label: string;
  isVisible: boolean;
  persisted: boolean;
};

const LABELS = new Map(SECTIONS.map((s) => [s.key, s.label]));
const REGISTRY_KEYS = new Set<string>(SECTIONS.map((s) => s.key));

// Merge persisted rows over the default registry. A reorder materializes all
// rows with a 0..n-1 position permutation; in that case display follows the
// persisted order. Otherwise (legacy/partial rows, or position defaults from
// visibility toggles) fall back to the stable registry order so toggling a
// section never reshuffles the list.
function mergeViews(rows: PortfolioSection[]): SectionView[] {
  const known = rows.filter((row) => REGISTRY_KEYS.has(row.sectionKey));
  const byKey = new Map(known.map((row) => [row.sectionKey, row]));

  const positions = known.map((row) => row.position);
  const isFullOrder =
    known.length === SECTIONS.length &&
    new Set(positions).size === SECTIONS.length &&
    Math.min(...positions) === 0 &&
    Math.max(...positions) === SECTIONS.length - 1;

  const orderedKeys = isFullOrder
    ? // rows already arrive sorted by (position, id) from the API
      known.map((row) => row.sectionKey)
    : SECTIONS.map((s) => s.key);

  return orderedKeys.map((key) => {
    const row = byKey.get(key);
    return {
      key,
      label: LABELS.get(key) ?? key,
      isVisible: row ? row.isVisible : true,
      persisted: Boolean(row),
    };
  });
}

export function SectionsEditor({ portfolioId }: { portfolioId: string }) {
  const [load, setLoad] = useState<"loading" | "error" | "ready">("loading");
  const [loadError, setLoadError] = useState<ApiError | null>(null);
  const [views, setViews] = useState<SectionView[]>([]);
  const [revision, setRevision] = useState("0");
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [reordering, setReordering] = useState(false);

  useEffect(() => {
    let active = true;
    listSections(portfolioId).then((result) => {
      if (!active) return;
      if (result.ok) {
        setViews(mergeViews(result.data.sections));
        setRevision(result.data.revision);
        setLoad("ready");
      } else {
        setLoadError(result.error);
        setLoad("error");
      }
    });
    return () => {
      active = false;
    };
  }, [portfolioId]);

  const refetch = async () => {
    const result = await listSections(portfolioId);
    if (result.ok) {
      setViews(mergeViews(result.data.sections));
      setRevision(result.data.revision);
      setLoad("ready");
    } else {
      setLoadError(result.error);
      setLoad("error");
    }
  };

  // Persist first; only update local state on success (no optimistic flip).
  const toggle = async (key: string, next: boolean) => {
    setSavingKey(key);
    setError(null);
    const result = await updateSection(portfolioId, key, {
      expectedRevision: revision,
      isVisible: next,
    });
    setSavingKey(null);

    if (result.ok) {
      setRevision(result.data.revision);
      setViews((prev) =>
        prev.map((view) =>
          view.key === key
            ? { ...view, isVisible: result.data.section.isVisible, persisted: true }
            : view,
        ),
      );
      return;
    }
    if (result.error.status === 409 && result.error.code === "REVISION_CONFLICT") {
      setConflict(true);
      return;
    }
    setError(result.error.message);
  };

  // Sends the complete section-key permutation; local order/revision update
  // only on success. On conflict or failure the current order is preserved.
  const move = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= views.length) return;

    const reordered = [...views];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(target, 0, moved!);
    const sectionKeys = reordered.map((view) => view.key);

    setReordering(true);
    setError(null);
    const result = await reorderSections(portfolioId, revision, sectionKeys);
    setReordering(false);

    if (result.ok) {
      setViews(mergeViews(result.data.sections));
      setRevision(result.data.revision);
      return;
    }
    if (result.error.status === 409 && result.error.code === "REVISION_CONFLICT") {
      setConflict(true);
      return;
    }
    setError(result.error.message);
  };

  const reload = async () => {
    setConflict(false);
    setError(null);
    await refetch();
  };

  const busy = savingKey !== null || reordering;

  if (load === "loading") {
    return (
      <p role="status" className="text-sm text-zinc-600 dark:text-zinc-400">
        Loading sections…
      </p>
    );
  }

  if (load === "error") {
    return (
      <div role="alert" className="flex flex-col items-start gap-3">
        <p className="text-sm text-red-600 dark:text-red-400">
          {loadError?.status === 404
            ? "This portfolio doesn't exist or you don't have access to it."
            : (loadError?.message ?? "Unable to load sections.")}
        </p>
        <Button variant="secondary" onClick={() => void refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-100">Sections</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Choose which sections appear on your portfolio. Hiding a section keeps its content.
        </p>
      </div>

      {conflict && (
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-md border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30"
        >
          <p className="text-sm text-amber-800 dark:text-amber-200">
            This portfolio changed somewhere else. Reload to get the latest configuration.
          </p>
          <div>
            <Button variant="secondary" onClick={() => void reload()}>
              Reload latest
            </Button>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {views.map((view, index) => (
          <li
            key={view.key}
            className="flex items-center justify-between gap-4 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
          >
            <div className="flex min-w-0 items-center gap-1">
              <div className="flex flex-col">
                <IconButton
                  label={`Move ${view.label} up`}
                  disabled={index === 0 || busy}
                  onClick={() => void move(index, -1)}
                >
                  ↑
                </IconButton>
                <IconButton
                  label={`Move ${view.label} down`}
                  disabled={index === views.length - 1 || busy}
                  onClick={() => void move(index, 1)}
                >
                  ↓
                </IconButton>
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-zinc-900 dark:text-zinc-100">{view.label}</p>
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                    {view.persisted ? "Configured" : "Default"}
                  </span>
                </div>
                <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
                  {view.isVisible ? "Visible" : "Hidden"}
                </p>
              </div>
            </div>

            <label className="flex shrink-0 items-center gap-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
              {savingKey === view.key && (
                <span className="text-xs text-zinc-500 dark:text-zinc-400">Saving…</span>
              )}
              <span className="sr-only">{`Show ${view.label}`}</span>
              <input
                type="checkbox"
                checked={view.isVisible}
                disabled={busy}
                onChange={() => void toggle(view.key, !view.isVisible)}
                aria-label={`Show ${view.label}`}
                className="h-4 w-4 rounded border-zinc-300 text-indigo-600 focus-visible:ring-indigo-500 disabled:opacity-50 dark:border-zinc-600"
              />
            </label>
          </li>
        ))}
      </ul>

      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        Layout and advanced configuration options are coming soon.
      </p>
    </div>
  );
}

function IconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex h-6 w-7 items-center justify-center rounded text-zinc-600 transition hover:bg-zinc-100 focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40 dark:text-zinc-300 dark:hover:bg-zinc-800"
    >
      {children}
    </button>
  );
}

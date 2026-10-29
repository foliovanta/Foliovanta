"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { getPublishStatus } from "@/lib/api/portfolios-client";

type ViewportId = "desktop" | "tablet" | "phone";
const VIEWPORTS: { id: ViewportId; label: string; width: number }[] = [
  { id: "desktop", label: "Desktop", width: 1440 },
  { id: "tablet", label: "Tablet", width: 768 },
  { id: "phone", label: "Phone", width: 375 },
];

const TEMPLATE_NAME: Record<string, string> = {
  minimal: "Minimal",
  professional: "Professional",
  creative: "Creative",
};

export function PreviewWorkspace({ portfolioId }: { portfolioId: string }) {
  const [viewport, setViewport] = useState<ViewportId>("desktop");
  const [nonce, setNonce] = useState(0);
  const [loading, setLoading] = useState(true);
  const [templateKey, setTemplateKey] = useState<string | null>(null);
  const [hasUnpublishedChanges, setHasUnpublishedChanges] = useState(false);
  const frameRef = useRef<HTMLIFrameElement>(null);

  // Template name + unpublished indicator reuse the existing publish-status logic.
  useEffect(() => {
    let active = true;
    getPublishStatus(portfolioId).then((result) => {
      if (!active || !result.ok) return;
      setTemplateKey(result.data.templateKey);
      setHasUnpublishedChanges(result.data.hasUnpublishedChanges);
    });
    return () => {
      active = false;
    };
  }, [portfolioId]);

  const width = VIEWPORTS.find((v) => v.id === viewport)!.width;
  const src = `/preview/${portfolioId}/frame?v=${nonce}`;

  const refresh = () => {
    setLoading(true);
    setNonce((n) => n + 1);
  };

  return (
    <div className="flex min-h-dvh flex-col bg-zinc-200 font-sans dark:bg-zinc-900">
      <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-zinc-300 bg-white px-4 py-2.5 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href={`/editor/${portfolioId}/profile`}
            className="inline-flex min-h-9 shrink-0 items-center rounded-md px-2 text-sm font-medium text-zinc-600 hover:text-zinc-900 focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:outline-none dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            Back to editor
          </Link>
          <span className="h-4 w-px shrink-0 bg-zinc-300 dark:bg-zinc-700" aria-hidden="true" />
          <div className="flex min-w-0 items-center gap-2">
            <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
              Draft preview
            </span>
            {templateKey && (
              <span className="hidden truncate text-sm text-zinc-500 sm:inline dark:text-zinc-400">
                {TEMPLATE_NAME[templateKey] ?? templateKey} template
              </span>
            )}
          </div>
          {hasUnpublishedChanges && (
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden="true" />
              Unpublished changes
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          <ViewportSwitcher value={viewport} onChange={setViewport} />
          <button
            type="button"
            onClick={refresh}
            className="inline-flex min-h-9 items-center rounded-md border border-zinc-300 px-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:outline-none dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </header>

      <p className="sr-only" aria-live="polite">
        Showing your last saved draft at {width} pixels wide.
      </p>

      <div className="flex-1 overflow-auto p-4 sm:p-8">
        <div className="mx-auto" style={{ width }}>
          <div className="flex h-[calc(100dvh-8rem)] flex-col overflow-hidden rounded-xl border border-zinc-300 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-950">
            <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 px-3 py-1.5 dark:border-zinc-800">
              <span className="text-xs text-zinc-500 tabular-nums dark:text-zinc-400">
                {width} px
              </span>
              <span className="text-xs text-zinc-400 dark:text-zinc-500">Last saved draft</span>
            </div>
            <iframe
              ref={frameRef}
              title="Draft preview"
              src={src}
              onLoad={() => setLoading(false)}
              className="h-full w-full flex-1 bg-white dark:bg-zinc-950"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function ViewportSwitcher({
  value,
  onChange,
}: {
  value: ViewportId;
  onChange: (id: ViewportId) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Preview width"
      className="flex items-center gap-1 rounded-md border border-zinc-300 p-0.5 dark:border-zinc-700"
    >
      {VIEWPORTS.map((v) => {
        const active = v.id === value;
        return (
          <button
            key={v.id}
            type="button"
            onClick={() => onChange(v.id)}
            aria-pressed={active}
            className={`inline-flex min-h-8 items-center gap-1.5 rounded-sm px-2.5 text-sm font-medium transition focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:outline-none ${
              active
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
            }`}
          >
            <ViewportGlyph id={v.id} />
            {v.label}
          </button>
        );
      })}
    </div>
  );
}

// Simple proportional glyphs (not device mockups) that reinforce the width each
// control selects.
function ViewportGlyph({ id }: { id: ViewportId }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.5 } as const;
  if (id === "desktop") {
    return (
      <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
        <rect x="1.5" y="2.5" width="13" height="8" rx="1" {...common} />
        <path d="M6 13.5h4" {...common} strokeLinecap="round" />
      </svg>
    );
  }
  if (id === "tablet") {
    return (
      <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
        <rect x="3.5" y="1.5" width="9" height="13" rx="1.5" {...common} />
      </svg>
    );
  }
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
      <rect x="5" y="1.5" width="6" height="13" rx="1.5" {...common} />
    </svg>
  );
}

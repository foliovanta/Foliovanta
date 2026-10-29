"use client";

import { useRef } from "react";

import { Button } from "@/components/ui/button";
import type { MediaAttachTarget, MediaPurpose } from "@/lib/api/portfolios-client";
import { ALLOWED_IMAGE_TYPES, MAX_UPLOAD_BYTES } from "@/lib/media/constants";
import { publicAssetUrl } from "@/lib/media/url";
import { type UploadState, useImageUpload } from "./use-image-upload";
import type { uploadFileToSignedUrl } from "./upload-put";

const ACCEPT = ALLOWED_IMAGE_TYPES.join(",");
const MAX_MB = Math.round(MAX_UPLOAD_BYTES / (1024 * 1024));

type Props = {
  label: string;
  shape: "circle" | "rect";
  purpose: MediaPurpose;
  portfolioId: string;
  target: MediaAttachTarget;
  currentAssetId: string | null;
  getRevision: () => string;
  onAttached: (revision: string, assetId: string | null) => void;
  onConflict?: () => void;
  putImpl?: typeof uploadFileToSignedUrl; // test seam
};

export function ImageUploadField(props: Props) {
  const { label, shape, currentAssetId } = props;
  const inputRef = useRef<HTMLInputElement>(null);
  const { state, start, remove, cancel } = useImageUpload({
    portfolioId: props.portfolioId,
    purpose: props.purpose,
    target: props.target,
    getRevision: props.getRevision,
    onAttached: props.onAttached,
    ...(props.onConflict ? { onConflict: props.onConflict } : {}),
    ...(props.putImpl ? { putImpl: props.putImpl } : {}),
  });

  const busy =
    state.kind === "uploading" || state.kind === "verifying" || state.kind === "attaching";
  const hasImage = Boolean(currentAssetId);
  const circle = shape === "circle";

  const onFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) void start(file);
    event.target.value = ""; // allow re-selecting the same file
  };

  return (
    <div className="flex flex-col gap-3">
      <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{label}</span>

      <div className="flex items-start gap-4">
        <div
          className={`shrink-0 overflow-hidden border border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 ${
            circle ? "h-20 w-20 rounded-full" : "aspect-video w-40 rounded-md"
          }`}
        >
          {hasImage ? (
            // eslint-disable-next-line @next/next/no-img-element -- proxy-served, dimensions unknown
            <img
              src={publicAssetUrl(currentAssetId!)}
              alt={`Current ${label.toLowerCase()}`}
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-xs text-zinc-400">
              {circle ? "No photo" : "No cover"}
            </span>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-2">
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            onChange={onFile}
            aria-label={
              hasImage ? `Replace ${label.toLowerCase()}` : `Upload ${label.toLowerCase()}`
            }
            className="sr-only"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={() => inputRef.current?.click()} disabled={busy}>
              {hasImage ? "Replace" : "Upload image"}
            </Button>
            {hasImage && !busy && (
              <Button variant="ghost" onClick={() => void remove()}>
                Remove
              </Button>
            )}
            {state.kind === "uploading" && (
              <Button variant="ghost" onClick={cancel}>
                Cancel
              </Button>
            )}
          </div>

          <StatusLine state={state} />

          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            JPEG, PNG, or WebP, up to {MAX_MB} MB.
          </p>
        </div>
      </div>
    </div>
  );
}

function StatusLine({ state }: { state: UploadState }) {
  if (state.kind === "uploading") {
    return (
      <div className="flex flex-col gap-1">
        <div
          role="progressbar"
          aria-valuenow={state.progress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Upload progress"
          className="h-1.5 w-40 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700"
        >
          <div
            className="h-full bg-indigo-600 transition-[width]"
            style={{ width: `${state.progress}%` }}
          />
        </div>
        <span className="text-xs text-zinc-500 tabular-nums dark:text-zinc-400">
          Uploading {state.progress}%
        </span>
      </div>
    );
  }
  if (state.kind === "verifying") {
    return <span className="text-xs text-zinc-500 dark:text-zinc-400">Checking image…</span>;
  }
  if (state.kind === "attaching") {
    return <span className="text-xs text-zinc-500 dark:text-zinc-400">Saving…</span>;
  }
  if (state.kind === "error") {
    return (
      <p role="alert" className="text-sm text-red-600 dark:text-red-400">
        {state.message}
      </p>
    );
  }
  if (state.kind === "conflict") {
    return (
      <p role="alert" className="text-sm text-amber-600 dark:text-amber-400">
        This portfolio changed somewhere else. Reload the latest, then try again.
      </p>
    );
  }
  return null;
}

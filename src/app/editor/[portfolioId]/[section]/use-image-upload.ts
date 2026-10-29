"use client";

import { useRef, useState } from "react";

import {
  type ApiError,
  type MediaAttachTarget,
  type MediaPurpose,
  attachMedia,
  completeMediaUpload,
  initiateMediaUpload,
} from "@/lib/api/portfolios-client";
import { ALLOWED_IMAGE_TYPES, MAX_UPLOAD_BYTES } from "@/lib/media/constants";
import { type UploadHandle, UploadAbortedError, uploadFileToSignedUrl } from "./upload-put";

export type UploadState =
  | { kind: "idle" }
  | { kind: "uploading"; progress: number }
  | { kind: "verifying" }
  | { kind: "attaching" }
  | { kind: "error"; message: string }
  | { kind: "conflict" };

const MAX_MB = Math.round(MAX_UPLOAD_BYTES / (1024 * 1024));

function messageForError(error: ApiError): string {
  switch (error.code) {
    case "STORAGE_UNAVAILABLE":
      return "Image uploads are temporarily unavailable. Try again later.";
    case "QUOTA_EXCEEDED":
      return "You've reached the image limit for this portfolio.";
    case "RATE_LIMITED":
      return "Too many uploads just now. Wait a moment and try again.";
    case "VERIFICATION_FAILED":
      return "That image couldn't be processed. Try a different JPEG, PNG, or WebP.";
    case "INVALID_TYPE":
      return "Choose a JPEG, PNG, or WebP image.";
    case "INVALID_SIZE":
      return `Image must be under ${MAX_MB} MB.`;
    case "NETWORK_ERROR":
      return "Network error. Check your connection and try again.";
    default:
      return error.message || "Upload failed. Try again.";
  }
}

type Options = {
  portfolioId: string;
  purpose: MediaPurpose;
  target: MediaAttachTarget;
  // Read fresh at attach time so the latest draft revision is always used.
  getRevision: () => string;
  onAttached: (revision: string, assetId: string | null) => void;
  onConflict?: () => void;
  // Injectable for tests; defaults to the real signed-URL PUT.
  putImpl?: typeof uploadFileToSignedUrl;
};

export function useImageUpload({
  portfolioId,
  purpose,
  target,
  getRevision,
  onAttached,
  onConflict,
  putImpl = uploadFileToSignedUrl,
}: Options) {
  const [state, setState] = useState<UploadState>({ kind: "idle" });
  const handleRef = useRef<UploadHandle | null>(null);
  const activeRef = useRef(false); // guards against duplicate submissions

  const fail = (error: ApiError) => setState({ kind: "error", message: messageForError(error) });

  const start = async (file: File) => {
    if (activeRef.current) return; // one upload at a time
    if (!(ALLOWED_IMAGE_TYPES as readonly string[]).includes(file.type)) {
      setState({ kind: "error", message: "Choose a JPEG, PNG, or WebP image." });
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setState({ kind: "error", message: `Image must be under ${MAX_MB} MB.` });
      return;
    }

    activeRef.current = true;
    try {
      setState({ kind: "uploading", progress: 0 });
      const init = await initiateMediaUpload(portfolioId, {
        purpose,
        contentType: file.type,
        byteSize: file.size,
      });
      if (!init.ok) return fail(init.error);

      await putImpl(
        init.data.upload,
        file,
        (progress) => setState({ kind: "uploading", progress }),
        handleRef,
      );

      setState({ kind: "verifying" });
      const completed = await completeMediaUpload(portfolioId, init.data.assetId);
      if (!completed.ok) return fail(completed.error);

      // Upload success ≠ attached: attach is a separate authoritative step.
      setState({ kind: "attaching" });
      const attached = await attachMedia(portfolioId, {
        expectedRevision: getRevision(),
        target,
        assetId: init.data.assetId,
      });
      if (!attached.ok) {
        if (attached.error.status === 409 && attached.error.code === "REVISION_CONFLICT") {
          setState({ kind: "conflict" });
          onConflict?.();
        } else {
          fail(attached.error);
        }
        return;
      }

      onAttached(attached.data.revision, init.data.assetId);
      setState({ kind: "idle" });
    } catch (error) {
      // An aborted upload returns cleanly to idle; anything else is recoverable.
      setState(
        error instanceof UploadAbortedError
          ? { kind: "idle" }
          : { kind: "error", message: "Upload failed. Try again." },
      );
    } finally {
      activeRef.current = false;
      handleRef.current = null;
    }
  };

  const remove = async () => {
    if (activeRef.current) return;
    activeRef.current = true;
    setState({ kind: "attaching" });
    const result = await attachMedia(portfolioId, {
      expectedRevision: getRevision(),
      target,
      assetId: null,
    });
    activeRef.current = false;
    if (result.ok) {
      onAttached(result.data.revision, null);
      setState({ kind: "idle" });
    } else if (result.error.status === 409 && result.error.code === "REVISION_CONFLICT") {
      setState({ kind: "conflict" });
      onConflict?.();
    } else {
      fail(result.error);
    }
  };

  const cancel = () => handleRef.current?.abort();
  const reset = () => setState({ kind: "idle" });

  return { state, start, remove, cancel, reset };
}

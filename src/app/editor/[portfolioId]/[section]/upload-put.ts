"use client";

import type { MediaUploadAuth } from "@/lib/api/portfolios-client";

export class UploadAbortedError extends Error {
  constructor() {
    super("Upload aborted");
    this.name = "UploadAbortedError";
  }
}

export class UploadHttpError extends Error {
  constructor(readonly status: number) {
    super(`Upload failed with status ${status}`);
    this.name = "UploadHttpError";
  }
}

export type UploadHandle = { abort: () => void };

/**
 * PUTs the file bytes directly to the presigned storage URL with the exact
 * signed headers. Uses XHR for real upload progress and a safe abort. The
 * presigned URL is used once and never persisted. Resolves on a 2xx; rejects
 * with UploadAbortedError / UploadHttpError / a network Error otherwise.
 */
export function uploadFileToSignedUrl(
  auth: MediaUploadAuth,
  file: File,
  onProgress: (percent: number) => void,
  handleRef?: { current: UploadHandle | null },
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    if (handleRef) handleRef.current = { abort: () => xhr.abort() };
    xhr.open(auth.method, auth.url, true);
    for (const [key, value] of Object.entries(auth.headers)) {
      xhr.setRequestHeader(key, value);
    }
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new UploadHttpError(xhr.status));
    };
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.onabort = () => reject(new UploadAbortedError());
    xhr.send(file);
  });
}

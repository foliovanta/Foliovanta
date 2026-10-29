import "server-only";

import { createR2Provider } from "@/lib/media/r2-storage";

// Provider-agnostic object-storage interface. The MVP targets Cloudflare R2 via
// its S3-compatible API (so the same adapter maps to AWS S3 with only config
// changes — low lock-in). No adapter is implemented in Step 1: without
// credentials there is nothing to talk to, and shipping a fake would be worse
// than an explicit "not configured" error.

export type SignedUpload = {
  url: string;
  method: "PUT";
  headers: Record<string, string>;
  expiresInSeconds: number;
};

export interface StorageProvider {
  readonly name: "R2";
  /** Short-lived authorization for a single direct browser PUT to `key`. */
  createSignedUpload(input: {
    key: string;
    contentType: string;
    maxBytes: number;
  }): Promise<SignedUpload>;
  /** Metadata of a stored object, or null if it does not exist. */
  headObject(key: string): Promise<{ byteSize: number; contentType: string | null } | null>;
  /** The stored bytes, for server-side verification. */
  getObjectBytes(key: string): Promise<Uint8Array>;
  /** Stores (e.g. a normalized/processed) object. */
  putObject(input: { key: string; body: Uint8Array; contentType: string }): Promise<void>;
  deleteObject(key: string): Promise<void>;
}

export type MediaStorageEnv = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
};

export class StorageNotConfiguredError extends Error {
  constructor() {
    super(
      "Media storage is not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, " +
        "R2_SECRET_ACCESS_KEY and R2_BUCKET (see docs/decisions/M3-4-MEDIA-STORAGE.md).",
    );
    this.name = "StorageNotConfiguredError";
  }
}

/** Reads R2 credentials from the environment, or null if any are missing. */
export function readMediaStorageEnv(): MediaStorageEnv | null {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET;
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    return null;
  }
  return { accountId, accessKeyId, secretAccessKey, bucket };
}

export function isMediaStorageConfigured(): boolean {
  return readMediaStorageEnv() !== null;
}

/**
 * Resolves the configured storage provider (R2). Throws `StorageNotConfiguredError`
 * when credentials are absent — callers must not fall back to insecure behavior.
 */
export function getStorageProvider(): StorageProvider {
  const env = readMediaStorageEnv();
  if (!env) {
    throw new StorageNotConfiguredError();
  }
  return createR2Provider(env);
}

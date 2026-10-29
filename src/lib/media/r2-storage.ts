import "server-only";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { MAX_UPLOAD_BYTES } from "@/lib/media/constants";
import type { MediaStorageEnv, StorageProvider } from "@/lib/media/storage";

const SIGNED_UPLOAD_TTL_SECONDS = 120;

// Injectable so the adapter can be unit-tested without a live bucket. `send` and
// `sign` are the only AWS surfaces used.
export type R2Deps = {
  send: (command: unknown) => Promise<unknown>;
  sign: (command: unknown, options: { expiresIn: number }) => Promise<string>;
};

type HeadResult = { ContentLength?: number; ContentType?: string };
type GetResult = { Body?: { transformToByteArray: () => Promise<Uint8Array> } };

function isNotFound(error: unknown): boolean {
  const e = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return e?.name === "NotFound" || e?.name === "NoSuchKey" || e?.$metadata?.httpStatusCode === 404;
}

/**
 * Cloudflare R2 storage adapter (S3-compatible). Credentials stay server-side;
 * the only thing handed to a browser is a short-lived presigned PUT URL.
 */
export function createR2Provider(env: MediaStorageEnv, deps?: R2Deps): StorageProvider {
  const real = deps
    ? undefined
    : new S3Client({
        region: "auto",
        endpoint: `https://${env.accountId}.r2.cloudflarestorage.com`,
        credentials: { accessKeyId: env.accessKeyId, secretAccessKey: env.secretAccessKey },
        // R2 compatibility: recent AWS SDK versions default to adding a CRC32
        // integrity checksum ("WHEN_SUPPORTED"), which signs an
        // x-amz-checksum/x-amz-sdk-checksum-algorithm header that a plain browser
        // PUT to a presigned R2 URL never sends — R2 then rejects it with 403
        // AccessDenied. Only checksum when an operation actually requires it.
        requestChecksumCalculation: "WHEN_REQUIRED",
        responseChecksumValidation: "WHEN_REQUIRED",
        // Bound every call: a hung socket can't block the request path, and a
        // transient failure is retried a bounded number of times.
        maxAttempts: 3,
        requestHandler: { connectionTimeout: 5_000, requestTimeout: 20_000 },
      });
  const send: (command: unknown) => Promise<unknown> = deps
    ? deps.send
    : (command) => (real as S3Client).send(command as never);
  const sign: (command: unknown, options: { expiresIn: number }) => Promise<string> = deps
    ? deps.sign
    : (command, options) => getSignedUrl(real as S3Client, command as never, options);
  const bucket = env.bucket;

  return {
    name: "R2",
    async createSignedUpload({ key, contentType, maxBytes }) {
      // Binding ContentType + ContentLength means the browser must PUT exactly
      // this type and byte length — a mismatched upload is rejected by R2.
      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: contentType,
        ContentLength: maxBytes,
      });
      const url = await sign(command, { expiresIn: SIGNED_UPLOAD_TTL_SECONDS });
      // Never log `url` — it carries the signature.
      return {
        url,
        method: "PUT",
        headers: { "Content-Type": contentType },
        expiresInSeconds: SIGNED_UPLOAD_TTL_SECONDS,
      };
    },

    async headObject(key) {
      try {
        const result = (await send(
          new HeadObjectCommand({ Bucket: bucket, Key: key }),
        )) as HeadResult;
        return { byteSize: result.ContentLength ?? 0, contentType: result.ContentType ?? null };
      } catch (error) {
        if (isNotFound(error)) return null;
        throw error;
      }
    },

    async getObjectBytes(key) {
      const result = (await send(new GetObjectCommand({ Bucket: bucket, Key: key }))) as GetResult;
      if (!result.Body) {
        throw new Error("Object body is empty");
      }
      const bytes = await result.Body.transformToByteArray();
      // Defense in depth: the caller HEADs for size first, but never hold more
      // than the ceiling in memory.
      if (bytes.byteLength > MAX_UPLOAD_BYTES) {
        throw new Error("Stored object exceeds the maximum allowed size");
      }
      return bytes;
    },

    async putObject({ key, body, contentType }) {
      await send(
        new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }),
      );
    },

    async deleteObject(key) {
      await send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },
  };
}

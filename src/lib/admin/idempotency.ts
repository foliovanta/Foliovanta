import "server-only";

import { createHash } from "node:crypto";

/** SHA-256 of a canonical payload, for the moderation_commands idempotency ledger. */
export function commandFingerprint(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

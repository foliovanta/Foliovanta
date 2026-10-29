import "server-only";

// Security deployment mode — the single switch that decides whether security
// controls (distributed rate limiting, Turnstile) are STRICTLY required.
//
// It is derived only from server environment, never from a request field, so no
// attacker-controlled input can select a weaker mode:
//   - SECURITY_MODE=strict|relaxed is an explicit override.
//   - Otherwise APP_ENV in {production, staging} → strict (preview/staging must
//     behave like production for security acceptance), and NODE_ENV=production
//     → strict. Everything else (local dev, tests) → relaxed.
//
// strict:  no in-memory rate-limit fallback for write/security categories;
//          missing Upstash → fail closed; anonymous reports require Turnstile.
// relaxed: in-memory rate limiting allowed; Turnstile optional (dev).

export type SecurityMode = "strict" | "relaxed";

export function securityMode(): SecurityMode {
  const override = process.env.SECURITY_MODE;
  if (override === "strict" || override === "relaxed") return override;
  const appEnv = process.env.APP_ENV;
  if (appEnv === "production" || appEnv === "staging") return "strict";
  if (process.env.NODE_ENV === "production") return "strict";
  return "relaxed";
}

export function isStrictSecurity(): boolean {
  return securityMode() === "strict";
}

/** Short environment tag used to namespace shared rate-limit keys so staging and
 * production (which may share a provider account) never collide. */
export function deploymentNamespace(): string {
  return process.env.APP_ENV ?? process.env.NODE_ENV ?? "local";
}

import "server-only";

import { deploymentNamespace, isStrictSecurity } from "@/lib/env/security";
import { FIXED_WINDOW_LUA } from "@/lib/admin/rate-limit-lua";

// Rate limiting for admin endpoints and public intake.
//
// Reads FAIL OPEN on a store outage (availability of read oversight is
// preferred). Everything that writes FAILS CLOSED (a privileged change or a
// spam-prone write must never slip through an unavailable limiter). Buckets are
// per-identity + per-category + per-environment, so one actor can never lock out
// others and staging/production never collide.
//
// Production (strict security mode) requires a SHARED cross-instance store
// (Upstash). In strict mode there is NO in-memory fallback: if Upstash is not
// configured, write categories fail closed. In relaxed mode (local/test) an
// in-memory per-instance store is used. `isRateLimitProductionReady()` is true
// only when a shared store is resolved.

export type RateLimitResult = { allowed: boolean; remaining: number; resetAt: number };

export interface RateLimitStore {
  // Register one hit against `key` in a `windowMs` fixed window capped at `max`.
  hit(key: string, windowMs: number, max: number): Promise<RateLimitResult>;
  readonly shared: boolean; // true only for a cross-instance backing service
}

// Per-instance fixed-window store. Not shared across instances.
export class InMemoryRateLimitStore implements RateLimitStore {
  readonly shared = false;
  private windows = new Map<string, { count: number; resetAt: number }>();

  async hit(key: string, windowMs: number, max: number): Promise<RateLimitResult> {
    const now = Date.now();
    const existing = this.windows.get(key);
    if (!existing || existing.resetAt <= now) {
      const resetAt = now + windowMs;
      this.windows.set(key, { count: 1, resetAt });
      if (this.windows.size > 10_000) {
        for (const [k, w] of this.windows) if (w.resetAt <= now) this.windows.delete(k);
      }
      return { allowed: true, remaining: max - 1, resetAt };
    }
    existing.count += 1;
    return {
      allowed: existing.count <= max,
      remaining: Math.max(0, max - existing.count),
      resetAt: existing.resetAt,
    };
  }
}

/**
 * Shared Upstash Redis store over the REST API (no SDK dependency). Fixed
 * window via an atomic Lua EVAL. The token is sent only in the Authorization
 * header and never logged or placed in a key.
 */
export class UpstashRateLimitStore implements RateLimitStore {
  readonly shared = true;
  constructor(
    private readonly url: string,
    private readonly token: string,
  ) {}

  async hit(key: string, windowMs: number, max: number): Promise<RateLimitResult> {
    const res = await fetch(this.url, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(["EVAL", FIXED_WINDOW_LUA, "1", key, String(windowMs)]),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`upstash rate-limit store error: ${res.status}`);
    const data = (await res.json()) as { result?: unknown; error?: string };
    if (!data || data.error || !Array.isArray(data.result)) {
      throw new Error("upstash rate-limit store returned an error");
    }
    const count = Number(data.result[0] ?? 0);
    const pttl = Number(data.result[1] ?? windowMs);
    return {
      allowed: count <= max,
      remaining: Math.max(0, max - count),
      resetAt: Date.now() + (pttl > 0 ? pttl : windowMs),
    };
  }
}

let cachedStore: RateLimitStore | null | undefined;

/**
 * The shared rate-limit store, or null when none is available. In STRICT mode
 * only the Upstash store is ever returned (no in-memory fallback), so missing
 * configuration surfaces as "unavailable" and write categories fail closed. In
 * relaxed mode (local/test) an in-memory store is used when Upstash is absent.
 */
export function resolveAdminRateLimitStore(): RateLimitStore | null {
  if (cachedStore !== undefined) return cachedStore;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    cachedStore = new UpstashRateLimitStore(url, token);
  } else {
    cachedStore = isStrictSecurity() ? null : new InMemoryRateLimitStore();
  }
  return cachedStore;
}

// Test-only: reset the memoized store between cases.
export function resetRateLimitStoreCache(): void {
  cachedStore = undefined;
}

export function isRateLimitProductionReady(store = resolveAdminRateLimitStore()): boolean {
  return store?.shared === true;
}

export type RateCategory = "read" | "mutation" | "feedback" | "report";

// Reads: generous, fail-open. Everything that writes: fail-closed. Public abuse
// reports get the strictest budget over a longer window (anonymous spam guard).
const CATEGORY: Record<RateCategory, { windowMs: number; max: number; failOpen: boolean }> = {
  read: { windowMs: 60_000, max: 120, failOpen: true },
  mutation: { windowMs: 60_000, max: 20, failOpen: false },
  feedback: { windowMs: 60_000, max: 10, failOpen: false },
  report: { windowMs: 600_000, max: 5, failOpen: false },
};

export type RateLimitDecision =
  | { allowed: true }
  | { allowed: false; reason: "RATE_LIMITED"; retryAfterSeconds: number }
  | { allowed: false; reason: "UNAVAILABLE" };

/**
 * Enforce the rate limit for `identity` in a `category`. Pass `store` to inject a
 * fake in tests; pass `null` to simulate no configured store. When omitted the
 * configured store is resolved (which may be null in strict mode without
 * Upstash). Keys are namespaced per environment + category, so budgets are
 * independent per identity with no cross-environment or cross-actor interference.
 *
 * Unavailable store (null) or a store error applies the category's fail policy:
 * reads fail OPEN (allow), writes fail CLOSED (UNAVAILABLE → 503). This never
 * bypasses authorization or moderation, which are enforced separately.
 */
export async function enforceRateLimit(
  identity: string,
  category: RateCategory,
  store: RateLimitStore | null = resolveAdminRateLimitStore(),
): Promise<RateLimitDecision> {
  const config = CATEGORY[category];

  if (!store) {
    // No shared store in strict mode: cannot enforce. Honor the fail policy.
    console.warn("Rate limiter unavailable (no shared store)", {
      category,
      failMode: config.failOpen ? "open" : "closed",
      env: deploymentNamespace(),
    });
    return config.failOpen ? { allowed: true } : { allowed: false, reason: "UNAVAILABLE" };
  }

  const key = `ratelimit:${deploymentNamespace()}:${category}:${identity}`;
  try {
    const result = await store.hit(key, config.windowMs, config.max);
    if (result.allowed) return { allowed: true };
    return {
      allowed: false,
      reason: "RATE_LIMITED",
      retryAfterSeconds: Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000)),
    };
  } catch (error) {
    console.warn("Rate limiter store error", {
      category,
      failMode: config.failOpen ? "open" : "closed",
      env: deploymentNamespace(),
      error: error instanceof Error ? error.message : "unknown",
    });
    return config.failOpen ? { allowed: true } : { allowed: false, reason: "UNAVAILABLE" };
  }
}

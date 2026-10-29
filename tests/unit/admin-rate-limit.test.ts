// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import {
  InMemoryRateLimitStore,
  type RateLimitStore,
  UpstashRateLimitStore,
  enforceRateLimit,
  isRateLimitProductionReady,
} from "@/lib/admin/rate-limit";

describe("InMemoryRateLimitStore", () => {
  it("allows up to max then blocks within the window", async () => {
    const store = new InMemoryRateLimitStore();
    const r1 = await store.hit("k", 60_000, 2);
    const r2 = await store.hit("k", 60_000, 2);
    const r3 = await store.hit("k", 60_000, 2);
    expect([r1.allowed, r2.allowed, r3.allowed]).toEqual([true, true, false]);
  });

  it("is reported as NOT production-ready (per-instance)", () => {
    expect(isRateLimitProductionReady(new InMemoryRateLimitStore())).toBe(false);
  });

  it("the Upstash store is production-ready (shared)", () => {
    expect(isRateLimitProductionReady(new UpstashRateLimitStore("https://x", "t"))).toBe(true);
  });
});

describe("enforceRateLimit", () => {
  it("permits an allowed read", async () => {
    const store = new InMemoryRateLimitStore();
    expect(await enforceRateLimit("u1", "read", store)).toEqual({ allowed: true });
  });

  it("blocks over-limit with RATE_LIMITED + positive retry-after", async () => {
    const store = new InMemoryRateLimitStore();
    // mutation cap is 20; exhaust it
    for (let i = 0; i < 20; i++) await enforceRateLimit("u2", "mutation", store);
    const decision = await enforceRateLimit("u2", "mutation", store);
    expect(decision.allowed).toBe(false);
    if (!decision.allowed && decision.reason === "RATE_LIMITED") {
      expect(decision.retryAfterSeconds).toBeGreaterThan(0);
    } else {
      throw new Error("expected RATE_LIMITED");
    }
  });

  it("keeps read and mutation budgets independent (separate buckets)", async () => {
    const store = new InMemoryRateLimitStore();
    for (let i = 0; i < 20; i++) await enforceRateLimit("u3", "mutation", store);
    // Mutation bucket is now exhausted, but reads are unaffected.
    expect(await enforceRateLimit("u3", "read", store)).toEqual({ allowed: true });
  });

  it("reads FAIL OPEN on a store error", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const store: RateLimitStore = { shared: true, hit: () => Promise.reject(new Error("down")) };
    expect(await enforceRateLimit("u4", "read", store)).toEqual({ allowed: true });
    warn.mockRestore();
  });

  it("mutations FAIL CLOSED on a store error (UNAVAILABLE)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const store: RateLimitStore = { shared: true, hit: () => Promise.reject(new Error("down")) };
    expect(await enforceRateLimit("u5", "mutation", store)).toEqual({
      allowed: false,
      reason: "UNAVAILABLE",
    });
    warn.mockRestore();
  });
});

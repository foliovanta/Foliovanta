// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  InMemoryRateLimitStore,
  UpstashRateLimitStore,
  enforceRateLimit,
  isRateLimitProductionReady,
  resetRateLimitStoreCache,
  resolveAdminRateLimitStore,
} from "@/lib/admin/rate-limit";
import { securityMode } from "@/lib/env/security";

const ENV = { ...process.env };
afterEach(() => {
  process.env = { ...ENV };
  resetRateLimitStoreCache();
  vi.restoreAllMocks();
});

describe("UpstashRateLimitStore (atomic Lua)", () => {
  it("sends a single atomic EVAL and derives reset from PTTL", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ result: [1, 55000] }) });
    globalThis.fetch = fetchMock as never;
    const store = new UpstashRateLimitStore("https://redis.example", "tok");
    const r = await store.hit("k", 60000, 5);
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(4);
    expect(r.resetAt).toBeGreaterThan(Date.now());
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body as string) as string[];
    expect(body[0]).toBe("EVAL");
    expect(body[1]).toContain("INCR");
    expect(body[1]).toContain("PEXPIRE");
    expect(body).toContain("k");
    // The token is only in the Authorization header, never the body.
    expect(JSON.stringify(body)).not.toContain("tok");
  });

  it("blocks once the count exceeds max", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ result: [6, 40000] }) }) as never;
    const store = new UpstashRateLimitStore("https://r", "t");
    expect((await store.hit("k", 60000, 5)).allowed).toBe(false);
  });

  it("throws on provider error (→ caller applies fail policy)", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 }) as never;
    const store = new UpstashRateLimitStore("https://r", "t");
    await expect(store.hit("k", 1000, 1)).rejects.toThrow();
  });
});

describe("store resolution by security mode", () => {
  it("relaxed + no Upstash → in-memory (not production-ready)", () => {
    process.env.SECURITY_MODE = "relaxed";
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    resetRateLimitStoreCache();
    const store = resolveAdminRateLimitStore();
    expect(store).toBeInstanceOf(InMemoryRateLimitStore);
    expect(isRateLimitProductionReady(store)).toBe(false);
  });

  it("STRICT + no Upstash → NO store (never falls back to memory)", () => {
    process.env.SECURITY_MODE = "strict";
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    resetRateLimitStoreCache();
    expect(resolveAdminRateLimitStore()).toBeNull();
    expect(isRateLimitProductionReady(null)).toBe(false);
  });

  it("Upstash env present → shared store, production-ready", () => {
    process.env.SECURITY_MODE = "strict";
    process.env.UPSTASH_REDIS_REST_URL = "https://r";
    process.env.UPSTASH_REDIS_REST_TOKEN = "t";
    resetRateLimitStoreCache();
    const store = resolveAdminRateLimitStore();
    expect(store).toBeInstanceOf(UpstashRateLimitStore);
    expect(isRateLimitProductionReady(store)).toBe(true);
  });

  it("securityMode is strict for production/staging and not request-selectable", () => {
    process.env.SECURITY_MODE = "";
    process.env.APP_ENV = "production";
    expect(securityMode()).toBe("strict");
    process.env.APP_ENV = "staging";
    expect(securityMode()).toBe("strict");
    process.env.APP_ENV = "development";
    (process.env as Record<string, string>).NODE_ENV = "development";
    expect(securityMode()).toBe("relaxed");
  });
});

describe("fail policy when no shared store is available (strict misconfig)", () => {
  it("reads fail OPEN, writes fail CLOSED", async () => {
    expect(await enforceRateLimit("u", "read", null)).toEqual({ allowed: true });
    expect(await enforceRateLimit("u", "mutation", null)).toEqual({ allowed: false, reason: "UNAVAILABLE" });
    expect(await enforceRateLimit("u", "feedback", null)).toEqual({ allowed: false, reason: "UNAVAILABLE" });
    expect(await enforceRateLimit("u", "report", null)).toEqual({ allowed: false, reason: "UNAVAILABLE" });
  });
});

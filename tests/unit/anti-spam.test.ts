// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

import { anonymousNetworkKey, verifyTurnstile } from "@/lib/trust/anti-spam";

function reqWith(ip: string): Request {
  return new Request("http://t/api/reports", { headers: { "x-forwarded-for": ip } });
}

function reqWithHeaders(headers: Record<string, string>): Request {
  return new Request("http://t/api/reports", { headers });
}

describe("anonymousNetworkKey", () => {
  it("is stable per IP, differs across IPs, and never contains the raw IP", () => {
    const a1 = anonymousNetworkKey(reqWith("203.0.113.9, 10.0.0.1"));
    const a2 = anonymousNetworkKey(reqWith("203.0.113.9"));
    const b = anonymousNetworkKey(reqWith("198.51.100.2"));
    expect(a1).toBe(a2); // only the first hop matters, deterministic
    expect(a1).not.toBe(b);
    expect(a1).not.toContain("203.0.113.9");
    expect(a1.startsWith("anon:")).toBe(true);
  });

  it("prefers x-real-ip over a client-spoofed x-forwarded-for", () => {
    // Trusted edge sets x-real-ip; attacker rotates XFF to dodge the limit.
    const a = anonymousNetworkKey(reqWithHeaders({ "x-real-ip": "203.0.113.9", "x-forwarded-for": "1.1.1.1" }));
    const b = anonymousNetworkKey(reqWithHeaders({ "x-real-ip": "203.0.113.9", "x-forwarded-for": "2.2.2.2" }));
    expect(a).toBe(b); // same bucket despite different spoofed XFF
  });

  it("aggregates IPv6 to its /64 (same /64 shares a bucket)", () => {
    const a = anonymousNetworkKey(reqWithHeaders({ "x-real-ip": "2001:db8:abcd:1234:1111:2222:3333:4444" }));
    const b = anonymousNetworkKey(reqWithHeaders({ "x-real-ip": "2001:db8:abcd:1234:9999:8888:7777:6666" }));
    const c = anonymousNetworkKey(reqWithHeaders({ "x-real-ip": "2001:db8:abcd:9999:1111:2222:3333:4444" }));
    expect(a).toBe(b); // same /64
    expect(a).not.toBe(c); // different /64
  });
});

describe("verifyTurnstile", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete process.env.TURNSTILE_SECRET_KEY;
    vi.restoreAllMocks();
  });

  it("is a no-op pass when no secret is configured", async () => {
    delete process.env.TURNSTILE_SECRET_KEY;
    expect(await verifyTurnstile("anything")).toEqual({ configured: false, ok: true });
  });

  it("fails closed when configured but no token is supplied", async () => {
    process.env.TURNSTILE_SECRET_KEY = "secret";
    expect(await verifyTurnstile(undefined)).toMatchObject({ configured: true, ok: false });
  });

  it("passes when Cloudflare confirms success", async () => {
    process.env.TURNSTILE_SECRET_KEY = "secret";
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true }) }) as never;
    expect(await verifyTurnstile("token")).toEqual({ configured: true, ok: true });
  });

  it("fails closed when Cloudflare rejects or is unreachable, surfacing error codes", async () => {
    process.env.TURNSTILE_SECRET_KEY = "secret";
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: false, "error-codes": ["timeout-or-duplicate"] }) }) as never;
    const rejected = await verifyTurnstile("token");
    expect(rejected.ok).toBe(false);
    expect(rejected.errorCodes).toContain("timeout-or-duplicate"); // replay/expiry path
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("down")) as never;
    const unreachable = await verifyTurnstile("token");
    expect(unreachable).toMatchObject({ configured: true, ok: false, errorCodes: ["provider-unreachable"] });
  });

  it("rejects a token solved for a different hostname when a hostname is pinned", async () => {
    process.env.TURNSTILE_SECRET_KEY = "secret";
    process.env.TURNSTILE_EXPECTED_HOSTNAME = "foliovanta.com";
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, hostname: "evil.example" }) }) as never;
    const r = await verifyTurnstile("token");
    expect(r.ok).toBe(false);
    expect(r.errorCodes).toContain("hostname-mismatch");
    delete process.env.TURNSTILE_EXPECTED_HOSTNAME;
  });
});

import "server-only";

import { createHash } from "node:crypto";

// Anti-spam helpers for public intake. Raw IPs are NEVER stored in the DB or
// logged — a coarse, salted client-network value is only hashed into a transient
// rate-limit key. IP-based limiting is BEST-EFFORT and trustworthy only behind a
// trusted proxy (Vercel) that sets the client-IP headers; Cloudflare Turnstile is
// the authoritative anonymous anti-spam control (see docs/decisions/M6-5-2-...).

const SALT = process.env.ANTISPAM_SALT ?? "foliovanta-antispam-v1";

/**
 * The connecting client's IP, normalized. Prefers `x-real-ip` (set by Vercel and
 * not client-overridable at the edge) over the first `x-forwarded-for` hop, which
 * a client can prepend to. IPv6 is aggregated to its /64 so a single allocation
 * can't trivially rotate the low bits; IPv4 is used whole. Behind an UNtrusted
 * proxy these headers are spoofable — Turnstile, not this, is then the real guard.
 */
function clientNetwork(request: Request): string {
  const realIp = request.headers.get("x-real-ip")?.trim();
  const xff = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = realIp || xff || "unknown";
  if (ip.includes(":")) {
    // IPv6 → first four hextets (/64).
    const groups = ip.split(":").filter((g) => g.length > 0);
    return groups.slice(0, 4).join(":") || ip;
  }
  return ip;
}

export function anonymousNetworkKey(request: Request): string {
  const hash = createHash("sha256").update(`${SALT}:${clientNetwork(request)}`).digest("hex");
  return `anon:${hash.slice(0, 32)}`;
}

export type TurnstileResult = { configured: boolean; ok: boolean; errorCodes?: string[] };

export function isTurnstileConfigured(): boolean {
  return Boolean(process.env.TURNSTILE_SECRET_KEY);
}

/**
 * Server-side Cloudflare Turnstile verification against the official siteverify
 * endpoint. Returns { configured:false, ok:true } ONLY when no secret is set
 * (dev / not provisioned) — callers in strict mode must treat "not configured"
 * as a failure for anonymous intake, never as a pass. When configured, a
 * missing/invalid/failed/replayed/expired token or a provider/network error all
 * fail closed (ok:false). Optionally enforces the expected hostname. Never logs
 * or returns the token; only Cloudflare's error codes are surfaced for logging.
 */
export async function verifyTurnstile(
  token: string | undefined,
  remoteIp?: string,
): Promise<TurnstileResult> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return { configured: false, ok: true };
  if (!token) return { configured: true, ok: false, errorCodes: ["missing-input-response"] };

  try {
    const body = new URLSearchParams({ secret, response: token });
    if (remoteIp) body.set("remoteip", remoteIp);
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      cache: "no-store",
    });
    if (!res.ok) return { configured: true, ok: false, errorCodes: [`http-${res.status}`] };
    const data = (await res.json()) as {
      success?: boolean;
      hostname?: string;
      "error-codes"?: string[];
    };
    const errorCodes = Array.isArray(data["error-codes"]) ? data["error-codes"] : [];
    if (data.success !== true) return { configured: true, ok: false, errorCodes };

    // Optional hostname binding: reject a token solved for a different site.
    const expectedHostname = process.env.TURNSTILE_EXPECTED_HOSTNAME;
    if (expectedHostname && data.hostname && data.hostname !== expectedHostname) {
      return { configured: true, ok: false, errorCodes: ["hostname-mismatch"] };
    }
    return { configured: true, ok: true };
  } catch {
    // Configured but unreachable → fail closed for public intake.
    return { configured: true, ok: false, errorCodes: ["provider-unreachable"] };
  }
}

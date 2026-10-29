/**
 * Opt-in LIVE verification of the shared Upstash rate-limit store. Runs the EXACT
 * atomic Lua the app runs (imported from rate-limit-lua.ts) against a REAL Upstash
 * database: proves connectivity, atomic counter + expiry, threshold enforcement,
 * and identity isolation.
 *
 * NOT a unit test — real network calls. BLOCKED until credentials are set; never
 * prints secrets. Uses a unique namespaced key per run (bounded requests); never
 * flushes the database.
 *
 *   UPSTASH_REDIS_REST_URL=... UPSTASH_REDIS_REST_TOKEN=... \
 *     pnpm tsx scripts/security/verify-upstash.ts
 */
import { randomUUID } from "node:crypto";

import { FIXED_WINDOW_LUA } from "../../src/lib/admin/rate-limit-lua";

function fail(msg: string): never {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;
if (!url || !token) {
  fail("UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN not set — live verification BLOCKED.");
}

async function hit(key: string, windowMs: number): Promise<{ count: number; pttl: number }> {
  const res = await fetch(url as string, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(["EVAL", FIXED_WINDOW_LUA, "1", key, String(windowMs)]),
    cache: "no-store",
  });
  if (!res.ok) fail(`provider HTTP ${res.status}`);
  const data = (await res.json()) as { result?: [number, number]; error?: string };
  if (data.error || !Array.isArray(data.result)) fail("provider returned an error");
  return { count: Number(data.result![0]), pttl: Number(data.result![1]) };
}

async function main() {
  const key = `verify:${randomUUID()}`;
  const other = `verify:${randomUUID()}`;
  const windowMs = 5_000;
  const max = 3;

  let allowed = 0;
  let firstPttl = 0;
  for (let i = 0; i < max + 1; i++) {
    const r = await hit(key, windowMs);
    if (i === 0) firstPttl = r.pttl;
    if (r.count <= max) allowed++;
  }
  if (allowed !== max) fail(`expected ${max} allowed, got ${allowed}`);
  if (firstPttl <= 0) fail("expiry not applied (PTTL ≤ 0 on first hit)");

  const iso = await hit(other, windowMs);
  if (iso.count !== 1) fail("identity isolation broken (independent key not fresh)");

  console.log("✓ Upstash live verification passed:");
  console.log("  - connectivity OK");
  console.log(`  - atomic counter + expiry OK (PTTL ~${Math.round(firstPttl / 1000)}s on first hit)`);
  console.log(`  - threshold enforced at ${max}`);
  console.log("  - identity isolation OK");
  console.log("  NOTE: run from two separate processes to confirm cross-instance sharing.");
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));

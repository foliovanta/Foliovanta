/**
 * Opt-in LIVE verification of Cloudflare Turnstile server-side verification.
 * Calls the real siteverify endpoint (mirrors src/lib/trust/anti-spam.ts) and
 * proves connectivity + that invalid tokens are rejected.
 *
 * BLOCKED until TURNSTILE_SECRET_KEY is set; never prints the secret or a token.
 * A VALID-token check needs a real browser-solved token (staging checklist);
 * this proves connectivity + rejection, which is checkable without a browser.
 *
 *   TURNSTILE_SECRET_KEY=... pnpm tsx scripts/security/verify-turnstile.ts [token]
 */
function fail(msg: string): never {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

const secret = process.env.TURNSTILE_SECRET_KEY;
if (!secret) fail("TURNSTILE_SECRET_KEY not set — live verification BLOCKED.");

async function siteverify(token: string): Promise<{ success: boolean; errorCodes: string[] }> {
  const body = new URLSearchParams({ secret: secret as string, response: token });
  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  if (!res.ok) fail(`provider HTTP ${res.status}`);
  const data = (await res.json()) as { success?: boolean; "error-codes"?: string[] };
  return { success: data.success === true, errorCodes: data["error-codes"] ?? [] };
}

async function main() {
  const invalid = await siteverify("this-is-not-a-valid-token");
  if (invalid.success) fail("provider accepted an invalid token — unexpected");
  console.log(`✓ invalid token rejected (error-codes: ${invalid.errorCodes.join(",") || "none"})`);

  const token = process.argv[2];
  if (token) {
    const valid = await siteverify(token);
    console.log(valid.success ? "✓ supplied real token accepted" : `✗ supplied token rejected (${valid.errorCodes.join(",")})`);
  } else {
    console.log("• supply a browser-solved token as argv[1] to verify acceptance.");
  }
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));

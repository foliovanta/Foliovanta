import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";

import { resolveMediaAccess } from "@/lib/media/delivery";
import { StorageNotConfiguredError, getStorageProvider } from "@/lib/media/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Uniform 404 for every denial — never reveals whether an asset exists.
function notFound() {
  return new NextResponse(null, { status: 404 });
}

/**
 * Controlled media delivery. The storage key is never exposed; bytes are proxied
 * only after an owner-or-public authorization check (see resolveMediaAccess).
 * Public responses are cacheable; private (owner/draft) responses are no-store.
 */
export async function GET(_request: Request, context: { params: Promise<{ assetId: string }> }) {
  const { assetId } = await context.params;
  if (!z.uuid().safeParse(assetId).success) {
    return notFound();
  }

  // Public requests are allowed (userId null); owners get private access.
  const { userId } = await auth();
  const access = await resolveMediaAccess(assetId, userId ?? null);
  if (!access) {
    return notFound();
  }

  let bytes: Uint8Array;
  try {
    bytes = await getStorageProvider().getObjectBytes(access.storageKey);
  } catch (error) {
    if (error instanceof StorageNotConfiguredError) {
      return new NextResponse(null, { status: 503 });
    }
    console.error("Media delivery failed to read object");
    return notFound();
  }

  // Conservative MVP policy: no caching for either visibility. This guarantees
  // immediate revocation (a later request after unpublish/suspension re-hits this
  // proxy and 404s) at the cost of per-request origin fetches. A bounded-stale
  // public cache (with purge-on-revocation) is a later, verified step.
  const cacheControl = access.visibility === "public" ? "public, no-store" : "private, no-store";

  return new NextResponse(Buffer.from(bytes), {
    status: 200,
    headers: {
      "Content-Type": access.contentType,
      "Cache-Control": cacheControl,
      "X-Content-Type-Options": "nosniff",
    },
  });
}

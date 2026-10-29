import { NextResponse } from "next/server";

import { cleanupMediaAssets } from "@/lib/media/cleanup";
import { StorageNotConfiguredError } from "@/lib/media/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Internal media cleanup trigger. Disabled (404) unless MEDIA_CLEANUP_SECRET is
 * set, and then only runs for a request carrying the matching secret header — so
 * it is never scheduled or reachable in production without explicit config.
 * Wire a Vercel Cron to POST here with the header to run it on a schedule.
 */
export async function POST(request: Request) {
  const secret = process.env.MEDIA_CLEANUP_SECRET;
  if (!secret) {
    return new NextResponse(null, { status: 404 });
  }
  if (request.headers.get("x-cleanup-secret") !== secret) {
    return new NextResponse(null, { status: 401 });
  }

  try {
    const result = await cleanupMediaAssets();
    return NextResponse.json(
      { data: result },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof StorageNotConfiguredError) {
      return new NextResponse(null, { status: 503 });
    }
    console.error("Media cleanup failed", error);
    return new NextResponse(null, { status: 500 });
  }
}

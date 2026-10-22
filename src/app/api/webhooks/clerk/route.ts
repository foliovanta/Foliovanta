import { Webhook } from "svix";
import { NextResponse } from "next/server";

import { synchronizeClerkWebhook } from "@/lib/auth/clerk-webhook-sync";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const secret = process.env.CLERK_WEBHOOK_SIGNING_SECRET;

  if (!secret) {
    console.error("Clerk webhook signing secret is missing");

    return NextResponse.json({ error: "Webhook configuration unavailable" }, { status: 503 });
  }

  const svixId = request.headers.get("svix-id");
  const svixTimestamp = request.headers.get("svix-timestamp");
  const svixSignature = request.headers.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: "Missing webhook signature headers" }, { status: 400 });
  }

  let payload: unknown;

  try {
    const rawBody = await request.text();

    new Webhook(secret).verify(rawBody, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    });

    payload = JSON.parse(rawBody) as unknown;
  } catch {
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 400 });
  }

  try {
    console.info("Verified Clerk webhook payload shape", {
      isArray: Array.isArray(payload),
      valueType: typeof payload,
      keys: typeof payload === "object" && payload !== null ? Object.keys(payload) : [],
    });
    const result = await synchronizeClerkWebhook(payload, svixId);

    return NextResponse.json({ received: true, result }, { status: 200 });
  } catch (error) {
    // Do not log the raw webhook payload or sensitive user fields.
    console.error("Clerk webhook synchronization failed", error);

    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}

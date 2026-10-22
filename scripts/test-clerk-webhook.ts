import { config } from "dotenv";
import { Webhook } from "svix";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

config({ path: ".env.local" });

const ENDPOINT = "http://localhost:3000/api/webhooks/clerk";

const secret = process.env.CLERK_WEBHOOK_SIGNING_SECRET;
if (!secret) {
  throw new Error("CLERK_WEBHOOK_SIGNING_SECRET is missing");
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required");
}

// Never run the destructive suite against a production database.
if (process.env.APP_ENV === "production" || process.env.NODE_ENV === "production") {
  throw new Error("Refusing to run webhook integration tests against a production environment");
}

const webhook = new Webhook(secret);
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

// Records this run created, cleaned up in finally. Never truncate tables.
const createdUserIds = new Set<string>();
const createdEventIds = new Set<string>();

type ClerkData = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  image_url?: string | null;
  primary_email_address_id?: string | null;
  email_addresses?: Array<{ id: string; email_address: string }>;
};

type EventType = "user.created" | "user.updated" | "user.deleted";

function userData(fields: {
  id: string;
  name?: string;
  email?: string;
  avatar?: string | null;
}): ClerkData {
  const [first_name, ...rest] = (fields.name ?? "").split(" ");
  return {
    id: fields.id,
    first_name: first_name || null,
    last_name: rest.join(" ") || null,
    image_url: fields.avatar ?? null,
    primary_email_address_id: fields.email ? "email_primary" : null,
    email_addresses: fields.email ? [{ id: "email_primary", email_address: fields.email }] : [],
  };
}

/**
 * Sign and POST a webhook. `createdAtMs` is the in-payload event ordering
 * timestamp; the svix header timestamp is always "now" so the signature stays
 * inside Svix's clock-skew tolerance regardless of the event ordering value.
 */
async function sendEvent(args: {
  type: EventType;
  svixId: string;
  createdAtMs: number;
  data: ClerkData;
  tamper?: boolean;
  omitHeaders?: boolean;
}): Promise<{ status: number; body: Record<string, unknown> }> {
  createdUserIds.add(args.data.id);
  createdEventIds.add(args.svixId);

  const payload = JSON.stringify({
    type: args.type,
    object: "event",
    timestamp: args.createdAtMs,
    instance_id: "ins_test",
    data: args.data,
  });

  const signedAt = new Date();
  const signature = webhook.sign(args.svixId, signedAt, payload);

  const headers: Record<string, string> = args.omitHeaders
    ? { "Content-Type": "application/json" }
    : {
        "Content-Type": "application/json",
        "svix-id": args.svixId,
        "svix-timestamp": Math.floor(signedAt.getTime() / 1000).toString(),
        "svix-signature": signature,
      };

  // Posting a different body than the one signed exercises signature rejection.
  const body = args.tamper ? payload.replace(args.type, "user.deleted") : payload;

  const response = await fetch(ENDPOINT, { method: "POST", headers, body });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

function newIds() {
  return {
    userId: `user_local_test_${crypto.randomUUID()}`,
    svixId: `test-webhook-${crypto.randomUUID()}`,
  };
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function getUser(clerkUserId: string) {
  return prisma.user.findUnique({ where: { clerkUserId } });
}

async function eventCount(clerkUserId: string) {
  return prisma.clerkWebhookEvent.count({ where: { clerkUserId } });
}

// --- Scenarios -------------------------------------------------------------

async function scenarioCreate() {
  const { userId, svixId } = newIds();
  const base = Date.now();

  const res = await sendEvent({
    type: "user.created",
    svixId,
    createdAtMs: base,
    data: userData({
      id: userId,
      name: "Ada Lovelace",
      email: "ada@example.com",
      avatar: "https://img/ada.png",
    }),
  });

  assert(
    res.status === 200 && res.body.result === "processed",
    `expected processed, got ${res.status} ${JSON.stringify(res.body)}`,
  );

  const user = await getUser(userId);
  assert(user, "user.created did not create a user");
  assert(user.name === "Ada Lovelace", `name=${user.name}`);
  assert(user.email === "ada@example.com", `email=${user.email}`);
  assert(user.avatarUrl === "https://img/ada.png", `avatarUrl=${user.avatarUrl}`);
  assert(user.status === "ACTIVE", `status=${user.status}`);

  return { userId, svixId, base };
}

async function scenarioDuplicate(ctx: { userId: string; svixId: string; base: number }) {
  const before = await eventCount(ctx.userId);

  const res = await sendEvent({
    type: "user.created",
    svixId: ctx.svixId,
    createdAtMs: ctx.base,
    data: userData({
      id: ctx.userId,
      name: "Ada Lovelace",
      email: "ada@example.com",
      avatar: "https://img/ada.png",
    }),
  });

  assert(
    res.status === 200 && res.body.result === "duplicate",
    `expected duplicate, got ${res.status} ${JSON.stringify(res.body)}`,
  );

  const after = await eventCount(ctx.userId);
  assert(after === before, `replay created a new event record (${before} -> ${after})`);
}

async function scenarioNewerUpdate(ctx: { userId: string; base: number }) {
  const { svixId } = newIds();

  const res = await sendEvent({
    type: "user.updated",
    svixId,
    createdAtMs: ctx.base + 3000,
    data: userData({
      id: ctx.userId,
      name: "Ada King",
      email: "ada.king@example.com",
      avatar: "https://img/king.png",
    }),
  });

  assert(
    res.status === 200 && res.body.result === "processed",
    `expected processed, got ${res.status} ${JSON.stringify(res.body)}`,
  );

  const user = await getUser(ctx.userId);
  assert(user?.name === "Ada King", `name=${user?.name}`);
  assert(user?.email === "ada.king@example.com", `email=${user?.email}`);
  assert(user?.avatarUrl === "https://img/king.png", `avatarUrl=${user?.avatarUrl}`);
}

async function scenarioOlderIgnored(ctx: { userId: string; base: number }) {
  const { svixId } = newIds();

  const res = await sendEvent({
    type: "user.updated",
    svixId,
    createdAtMs: ctx.base + 1000, // older than the +3000 update already stored
    data: userData({
      id: ctx.userId,
      name: "STALE NAME",
      email: "stale@example.com",
      avatar: "https://img/stale.png",
    }),
  });

  assert(
    res.status === 200 && res.body.result === "ignored",
    `expected ignored, got ${res.status} ${JSON.stringify(res.body)}`,
  );

  const user = await getUser(ctx.userId);
  assert(user?.name === "Ada King", `older event overwrote name: ${user?.name}`);
  assert(user?.email === "ada.king@example.com", `older event overwrote email: ${user?.email}`);

  const event = await prisma.clerkWebhookEvent.findUnique({ where: { id: svixId } });
  assert(event?.eventStatus === "IGNORED", `ignored event status=${event?.eventStatus}`);
}

async function scenarioDeleted(ctx: { userId: string; base: number }) {
  const { svixId } = newIds();

  const res = await sendEvent({
    type: "user.deleted",
    svixId,
    createdAtMs: ctx.base + 5000,
    data: { id: ctx.userId },
  });

  assert(
    res.status === 200 && res.body.result === "processed",
    `expected processed, got ${res.status} ${JSON.stringify(res.body)}`,
  );

  const user = await getUser(ctx.userId);
  assert(user?.status === "DELETION_PENDING", `status=${user?.status}`);
  assert(user?.clerkDeletedAt != null, "clerkDeletedAt not set");
  assert(
    user?.name === null && user?.email === null && user?.avatarUrl === null,
    "personal profile fields not cleared",
  );
}

async function scenarioUpdateAfterDeleteIgnored(ctx: { userId: string; base: number }) {
  const { svixId } = newIds();

  const res = await sendEvent({
    type: "user.updated",
    svixId,
    createdAtMs: ctx.base + 7000, // newer than the delete, but the tombstone wins
    data: userData({
      id: ctx.userId,
      name: "Reactivated",
      email: "back@example.com",
      avatar: "https://img/back.png",
    }),
  });

  assert(
    res.status === 200 && res.body.result === "ignored",
    `expected ignored, got ${res.status} ${JSON.stringify(res.body)}`,
  );

  const user = await getUser(ctx.userId);
  assert(user?.status === "DELETION_PENDING", `user was reactivated: status=${user?.status}`);
  assert(user?.name === null && user?.email === null, "deleted user profile was repopulated");
}

async function scenarioConcurrentUpdates() {
  const { userId, svixId } = newIds();
  const base = Date.now();

  const created = await sendEvent({
    type: "user.created",
    svixId,
    createdAtMs: base,
    data: userData({ id: userId, name: "Concurrent Zero", email: "c0@example.com" }),
  });
  assert(created.body.result === "processed", "concurrent setup create failed");

  // Fire updates out of order; the newest event timestamp must win regardless.
  const updates = [1, 2, 3, 4, 5].map((n) =>
    sendEvent({
      type: "user.updated",
      svixId: `${svixId}-u${n}`,
      createdAtMs: base + n * 1000,
      data: userData({ id: userId, name: `Concurrent ${n}`, email: `c${n}@example.com` }),
    }),
  );
  const results = await Promise.all(updates);
  for (const r of results) {
    assert(
      r.status === 200 && (r.body.result === "processed" || r.body.result === "ignored"),
      `unexpected concurrent result ${JSON.stringify(r.body)}`,
    );
  }

  const user = await getUser(userId);
  assert(user?.name === "Concurrent 5", `newest did not win: name=${user?.name}`);
  assert(user?.email === "c5@example.com", `newest did not win: email=${user?.email}`);
}

async function scenarioMissingHeaders() {
  const { userId, svixId } = newIds();
  const res = await sendEvent({
    type: "user.created",
    svixId,
    createdAtMs: Date.now(),
    data: userData({ id: userId, name: "No Headers", email: "nh@example.com" }),
    omitHeaders: true,
  });
  assert(
    res.status === 400 && res.body.error === "Missing webhook signature headers",
    `expected missing-headers rejection, got ${res.status} ${JSON.stringify(res.body)}`,
  );

  const user = await getUser(userId);
  assert(user === null, "unsigned request created a user");
}

async function scenarioTamperedSignature() {
  const { userId, svixId } = newIds();
  const res = await sendEvent({
    type: "user.created",
    svixId,
    createdAtMs: Date.now(),
    data: userData({ id: userId, name: "Tampered", email: "tamper@example.com" }),
    tamper: true,
  });
  assert(
    res.status === 400 && res.body.error === "Invalid webhook signature",
    `expected invalid-signature rejection, got ${res.status} ${JSON.stringify(res.body)}`,
  );

  const user = await getUser(userId);
  assert(user === null, "tampered request created a user");
}

// --- Runner ----------------------------------------------------------------

async function main() {
  // Fail fast with a clear message if the dev server is not reachable.
  try {
    await fetch(ENDPOINT, { method: "POST" });
  } catch {
    throw new Error(`Cannot reach ${ENDPOINT}. Start the dev server (pnpm dev) first.`);
  }

  let passed = 0;
  let failed = 0;

  async function scenario(name: string, fn: () => Promise<void>) {
    try {
      await fn();
      passed += 1;
      console.log(`PASS  ${name}`);
    } catch (error) {
      failed += 1;
      console.error(`FAIL  ${name}`);
      console.error(`      ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Scenarios 1-6 share one user and build on each other, so run sequentially.
  let ctx: { userId: string; svixId: string; base: number } | null = null;
  await scenario("1. user.created creates user with name, email, avatar", async () => {
    ctx = await scenarioCreate();
  });
  if (ctx) {
    await scenario("2. replayed svix id returns duplicate, no new event record", () =>
      scenarioDuplicate(ctx!),
    );
    await scenario("3. newer user.updated updates the profile", () => scenarioNewerUpdate(ctx!));
    await scenario("4. older event is ignored and cannot overwrite newer data", () =>
      scenarioOlderIgnored(ctx!),
    );
    await scenario("5. user.deleted sets DELETION_PENDING and clears profile", () =>
      scenarioDeleted(ctx!),
    );
    await scenario("6. update after deletion is ignored and cannot reactivate", () =>
      scenarioUpdateAfterDeleteIgnored(ctx!),
    );
  } else {
    console.error("Skipping scenarios 2-6 because scenario 1 failed.");
    failed += 5;
  }

  await scenario(
    "7. concurrent updates preserve the newest event's data",
    scenarioConcurrentUpdates,
  );
  await scenario("8. missing svix headers are rejected (400)", scenarioMissingHeaders);
  await scenario(
    "9. tampered payload fails signature verification (400)",
    scenarioTamperedSignature,
  );

  console.log(`\nResult: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

main()
  .catch((error: unknown) => {
    console.error("Webhook test run aborted:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    // Clean up ONLY the records this run created.
    const userIds = [...createdUserIds];
    const eventIds = [...createdEventIds];
    try {
      if (eventIds.length) {
        await prisma.clerkWebhookEvent.deleteMany({
          where: { OR: [{ id: { in: eventIds } }, { clerkUserId: { in: userIds } }] },
        });
      }
      if (userIds.length) {
        await prisma.user.deleteMany({ where: { clerkUserId: { in: userIds } } });
      }
    } catch (cleanupError) {
      console.error("Cleanup failed:", cleanupError);
    } finally {
      await prisma.$disconnect();
    }
  });

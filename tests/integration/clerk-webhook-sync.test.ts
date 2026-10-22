import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { synchronizeClerkWebhook as Synchronize } from "@/lib/auth/clerk-webhook-sync";
import type { prisma as Prisma } from "@/lib/db/prisma";

import { assertSafeIntegrationDatabase, optedIn } from "./db-guard";

describe.skipIf(!optedIn)("clerk webhook synchronization (integration)", () => {
  let synchronizeClerkWebhook: typeof Synchronize;
  let prisma: typeof Prisma;

  const clerkUserIds: string[] = [];

  function newUserId() {
    const id = `test_${randomUUID()}`;
    clerkUserIds.push(id);
    return id;
  }

  // Mirrors Clerk's real event envelope: top-level `timestamp` (Unix ms),
  // `object`, `type`, `instance_id`, and the user in `data`.
  const userEvent = (
    type: "user.created" | "user.updated" | "user.deleted",
    id: string,
    timestamp: number,
    firstName: string | null = null,
  ) => ({
    object: "event",
    type,
    timestamp,
    instance_id: "ins_test",
    data: {
      id,
      first_name: firstName,
      last_name: null,
      image_url: null,
      primary_email_address_id: "e1",
      email_addresses: [{ id: "e1", email_address: `${id}@example.com` }],
    },
  });

  beforeAll(async () => {
    assertSafeIntegrationDatabase();
    ({ synchronizeClerkWebhook } = await import("@/lib/auth/clerk-webhook-sync"));
    ({ prisma } = await import("@/lib/db/prisma"));
  });

  afterAll(async () => {
    if (!prisma) return;
    if (clerkUserIds.length > 0) {
      await prisma.clerkWebhookEvent.deleteMany({ where: { clerkUserId: { in: clerkUserIds } } });
      await prisma.user.deleteMany({ where: { clerkUserId: { in: clerkUserIds } } });
    }
    await prisma.$disconnect();
  });

  it("creates an ACTIVE user from user.created", async () => {
    const id = newUserId();
    const base = Date.now();
    const result = await synchronizeClerkWebhook(
      userEvent("user.created", id, base, "Ada"),
      `evt_${randomUUID()}`,
    );
    expect(result).toBe("processed");

    const user = await prisma.user.findUnique({ where: { clerkUserId: id } });
    expect(user?.status).toBe("ACTIVE");
    expect(user?.name).toBe("Ada");
    expect(user?.email).toBe(`${id}@example.com`);
  });

  it("uses the top-level `timestamp` field from a real Clerk event envelope", async () => {
    const id = newUserId();
    const ts = 1_752_000_000_000; // fixed Unix ms
    // Full real-shape envelope (object/type/timestamp/instance_id/data), and a
    // misleading data.created_at that must NOT be used as the event timestamp.
    const event = {
      object: "event",
      type: "user.created" as const,
      timestamp: ts,
      instance_id: "ins_abc",
      data: {
        id,
        first_name: "Real",
        last_name: "User",
        image_url: null,
        created_at: 111, // decoy — ignored
        primary_email_address_id: "e1",
        email_addresses: [{ id: "e1", email_address: `${id}@example.com` }],
      },
    };

    expect(await synchronizeClerkWebhook(event, `evt_${randomUUID()}`)).toBe("processed");

    const user = await prisma.user.findUnique({ where: { clerkUserId: id } });
    expect(user?.name).toBe("Real User");
    expect(user?.clerkEventTimestamp?.getTime()).toBe(ts);
  });

  it("is idempotent for a duplicate delivery (same svix id)", async () => {
    const id = newUserId();
    const base = Date.now();
    const svixId = `evt_${randomUUID()}`;
    expect(
      await synchronizeClerkWebhook(userEvent("user.created", id, base, "Grace"), svixId),
    ).toBe("processed");
    expect(
      await synchronizeClerkWebhook(userEvent("user.created", id, base, "Grace"), svixId),
    ).toBe("duplicate");

    const events = await prisma.clerkWebhookEvent.count({ where: { clerkUserId: id } });
    expect(events).toBe(1);
  });

  it("ignores a stale (out-of-order) event and keeps newer data", async () => {
    const id = newUserId();
    const base = Date.now();
    await synchronizeClerkWebhook(
      userEvent("user.created", id, base, "Current"),
      `evt_${randomUUID()}`,
    );

    const stale = await synchronizeClerkWebhook(
      userEvent("user.updated", id, base - 10_000, "Older"),
      `evt_${randomUUID()}`,
    );
    expect(stale).toBe("ignored");

    const user = await prisma.user.findUnique({ where: { clerkUserId: id } });
    expect(user?.name).toBe("Current");
  });

  it("applies a newer user.updated", async () => {
    const id = newUserId();
    const base = Date.now();
    await synchronizeClerkWebhook(
      userEvent("user.created", id, base, "First"),
      `evt_${randomUUID()}`,
    );
    expect(
      await synchronizeClerkWebhook(
        userEvent("user.updated", id, base + 10_000, "Second"),
        `evt_${randomUUID()}`,
      ),
    ).toBe("processed");

    const user = await prisma.user.findUnique({ where: { clerkUserId: id } });
    expect(user?.name).toBe("Second");
  });

  it("tombstones on user.deleted and respects it against later stale events", async () => {
    const id = newUserId();
    const base = Date.now();
    await synchronizeClerkWebhook(
      userEvent("user.created", id, base, "Doomed"),
      `evt_${randomUUID()}`,
    );
    expect(
      await synchronizeClerkWebhook(
        userEvent("user.deleted", id, base + 10_000),
        `evt_${randomUUID()}`,
      ),
    ).toBe("processed");

    const deleted = await prisma.user.findUnique({ where: { clerkUserId: id } });
    expect(deleted?.status).toBe("DELETION_PENDING");
    expect(deleted?.clerkDeletedAt).not.toBeNull();
    expect(deleted?.name).toBeNull();

    // A later event must not resurrect a deleted account.
    const resurrect = await synchronizeClerkWebhook(
      userEvent("user.created", id, base + 20_000, "Back"),
      `evt_${randomUUID()}`,
    );
    expect(resurrect).toBe("ignored");

    const stillDeleted = await prisma.user.findUnique({ where: { clerkUserId: id } });
    expect(stillDeleted?.status).toBe("DELETION_PENDING");
  });
});

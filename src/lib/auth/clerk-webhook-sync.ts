import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";

type SupportedEventType = "user.created" | "user.updated" | "user.deleted";

type ClerkUserData = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  image_url?: string | null;
  primary_email_address_id?: string | null;
  email_addresses?: Array<{
    id: string;
    email_address: string;
  }>;
};

type ClerkEvent = {
  type: SupportedEventType;
  data: ClerkUserData;
  created_at: number;
};

export type SyncResult = "processed" | "duplicate" | "ignored";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseEvent(value: unknown): ClerkEvent | null {
  if (!isRecord(value)) return null;

  const type = value.type;
  const data = value.data;
  const createdAt = value.created_at;

  if (type !== "user.created" && type !== "user.updated" && type !== "user.deleted") {
    return null;
  }

  if (
    !isRecord(data) ||
    typeof data.id !== "string" ||
    !data.id ||
    typeof createdAt !== "number" ||
    !Number.isFinite(createdAt) ||
    createdAt <= 0
  ) {
    throw new Error("Invalid Clerk webhook event payload");
  }

  return {
    type,
    data: data as ClerkUserData,
    created_at: createdAt,
  };
}

function getUserProfile(data: ClerkUserData) {
  const name = [data.first_name, data.last_name].filter(Boolean).join(" ").trim();

  const email =
    data.email_addresses?.find((item) => item.id === data.primary_email_address_id)
      ?.email_address ?? null;

  return {
    name: name || null,
    email,
    avatarUrl: data.image_url ?? null,
  };
}

export async function synchronizeClerkWebhook(
  payload: unknown,
  eventId: string,
): Promise<SyncResult> {
  const event = parseEvent(payload);

  if (!event) {
    console.warn("Clerk webhook ignored: unsupported event", {
      type: isRecord(payload) ? payload.type : undefined,
    });

    return "ignored";
  }

  const clerkUserId = event.data.id;
  const eventTimestamp = new Date(event.created_at);

  if (Number.isNaN(eventTimestamp.getTime())) {
    throw new Error("Invalid Clerk webhook timestamp");
  }

  return prisma.$transaction(
    async (tx) => {
      // Serialize all webhook processing for this Clerk user.

      await tx.$queryRaw`
        SELECT pg_advisory_xact_lock(
            hashtextextended(${clerkUserId}, 0)
        ) IS NULL AS locked
    `;

      const existingEvent = await tx.clerkWebhookEvent.findUnique({
        where: { id: eventId },
        select: { id: true },
      });

      if (existingEvent) {
        return "duplicate";
      }

      const user = await tx.user.findUnique({
        where: { clerkUserId },
      });

      const stale = user?.clerkEventTimestamp && eventTimestamp <= user.clerkEventTimestamp;

      const deleted = Boolean(user?.clerkDeletedAt);

      console.info("Clerk webhook ordering check", {
        eventType: event.type,
        userExists: Boolean(user),
        stale: Boolean(stale),
        deleted,
      });

      if (stale || deleted) {
        await tx.clerkWebhookEvent.create({
          data: {
            id: eventId,
            clerkUserId,
            eventType: event.type,
            eventTimestamp,
            eventStatus: "IGNORED",
            processedAt: new Date(),
          },
        });

        return "ignored";
      }

      if (event.type === "user.deleted") {
        await tx.user.upsert({
          where: { clerkUserId },
          create: {
            clerkUserId,
            status: "DELETION_PENDING",
            clerkDeletedAt: eventTimestamp,
            clerkEventTimestamp: eventTimestamp,
          },
          update: {
            email: null,
            name: null,
            avatarUrl: null,
            status: "DELETION_PENDING",
            clerkDeletedAt: eventTimestamp,
            clerkEventTimestamp: eventTimestamp,
          },
        });
      } else {
        const profile = getUserProfile(event.data);

        await tx.user.upsert({
          where: { clerkUserId },
          create: {
            clerkUserId,
            ...profile,
            clerkEventTimestamp: eventTimestamp,
          },
          update: {
            ...profile,
            clerkEventTimestamp: eventTimestamp,
            // Never overwrite role, status, or deletion tombstones.
          },
        });
      }

      await tx.clerkWebhookEvent.create({
        data: {
          id: eventId,
          clerkUserId,
          eventType: event.type,
          eventTimestamp,
          eventStatus: "PROCESSED",
          processedAt: new Date(),
        },
      });

      return "processed";
    },
    {
      maxWait: 10_000,
      timeout: 20_000,
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
    },
  );
}

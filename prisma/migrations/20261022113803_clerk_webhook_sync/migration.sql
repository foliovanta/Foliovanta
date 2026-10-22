-- CreateEnum
CREATE TYPE "ClerkWebhookEventStatus" AS ENUM ('PROCESSING', 'PROCESSED', 'IGNORED');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "clerkDeletedAt" TIMESTAMP(3),
ADD COLUMN     "clerkEventTimestamp" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "clerk_webhook_events" (
    "id" TEXT NOT NULL,
    "clerkUserId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "eventStatus" "ClerkWebhookEventStatus" NOT NULL DEFAULT 'PROCESSING',
    "eventTimestamp" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "clerk_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "clerk_webhook_events_clerkUserId_eventTimestamp_idx" ON "clerk_webhook_events"("clerkUserId", "eventTimestamp");

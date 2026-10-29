-- M6.3: durable idempotency ledger for moderation commands.
-- Forward-only and non-destructive: adds one new table only.
-- (Prisma's auto-generated diff again tried to DROP users_public_slug_seq and
-- the publicSlug default — the known dbgenerated-sequence quirk. That
-- destructive block was removed by hand; the public-slug allocator is untouched.)

-- CreateTable
CREATE TABLE "moderation_commands" (
    "id" UUID NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "actorUserId" UUID NOT NULL,
    "operation" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "moderation_commands_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "moderation_commands_idempotencyKey_key" ON "moderation_commands"("idempotencyKey");

-- CreateIndex
CREATE INDEX "moderation_commands_targetType_targetId_idx" ON "moderation_commands"("targetType", "targetId");

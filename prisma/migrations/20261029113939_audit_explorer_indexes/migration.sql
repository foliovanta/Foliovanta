-- M6.5.1: additive indexes for the audit explorer.
-- Newest-first keyset list (createdAt, id) + correlation-id lookup. Non-destructive;
-- Prisma's spurious publicSlug sequence-drop drift was removed by hand (allocator untouched).

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_id_idx" ON "audit_logs"("createdAt", "id");

-- CreateIndex
CREATE INDEX "audit_logs_correlationId_idx" ON "audit_logs"("correlationId");

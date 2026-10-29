-- M6.1 follow-up: make audit_logs.actorUserId a bare UUID (no foreign key).
--
-- An audit record is a permanent historical fact. With a FK + ON DELETE SET
-- NULL, deleting an actor would UPDATE audit_logs — which the append-only
-- trigger (correctly) forbids, making users with audit history undeletable.
-- Dropping the FK preserves the actor id verbatim forever and lets the trigger
-- block every UPDATE/DELETE unconditionally. Forward-only and non-destructive:
-- only the constraint is removed; no column, row, or data changes.
--
-- (Prisma's auto-generated diff again tried to DROP users_public_slug_seq and
-- the publicSlug default — the known dbgenerated-sequence quirk. That
-- destructive block was removed by hand; the public-slug allocator is untouched.)

-- DropForeignKey
ALTER TABLE "audit_logs" DROP CONSTRAINT "audit_logs_actorUserId_fkey";

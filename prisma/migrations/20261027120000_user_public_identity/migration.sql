-- URL identity migration: numeric public slug + editable URL username on users.
-- Forward-only. Adds columns, backfills existing rows, then locks in constraints.

-- 1. Concurrency-safe, non-reusing allocator for the numeric public slug.
--    A sequence never hands out the same value twice and never rolls back a
--    consumed value, so ids are unique and never reused after soft deletion.
CREATE SEQUENCE "users_public_slug_seq" START WITH 10000;

-- 2. Add columns nullable/defaulted first so existing rows can be backfilled.
ALTER TABLE "users" ADD COLUMN "publicSlug" BIGINT;
ALTER TABLE "users" ADD COLUMN "username" TEXT NOT NULL DEFAULT 'portfolio';

-- 3. Allocate a distinct numeric slug to every existing user. A set-based
--    UPDATE calls nextval() once per row, so each row gets a unique value.
UPDATE "users" SET "publicSlug" = nextval('users_public_slug_seq') WHERE "publicSlug" IS NULL;

-- 4. Seed the initial username from the portfolio display name, then the
--    account name, then the default. Approximate normalization (lower, ASCII
--    alnum, single hyphens, trimmed, capped) — the field stays editable, so an
--    imperfect seed is acceptable. One portfolio per user in MVP.
UPDATE "users" u
SET "username" = seed.username
FROM (
  SELECT
    u2.id,
    COALESCE(
      NULLIF(
        TRIM(BOTH '-' FROM LEFT(
          REGEXP_REPLACE(LOWER(TRIM(pp."displayName")), '[^a-z0-9]+', '-', 'g'), 39)),
        ''),
      NULLIF(
        TRIM(BOTH '-' FROM LEFT(
          REGEXP_REPLACE(LOWER(TRIM(COALESCE(u2."name", ''))), '[^a-z0-9]+', '-', 'g'), 39)),
        ''),
      'portfolio'
    ) AS username
  FROM "users" u2
  LEFT JOIN "portfolios" p ON p."ownerId" = u2.id AND p."deletedAt" IS NULL
  LEFT JOIN "portfolio_profiles" pp ON pp."portfolioId" = p.id
) seed
WHERE u.id = seed.id;

-- 5. Lock in the constraints now that every row has a value.
ALTER TABLE "users" ALTER COLUMN "publicSlug" SET NOT NULL;
ALTER TABLE "users" ALTER COLUMN "publicSlug" SET DEFAULT nextval('users_public_slug_seq');
ALTER SEQUENCE "users_public_slug_seq" OWNED BY "users"."publicSlug";
CREATE UNIQUE INDEX "users_publicSlug_key" ON "users"("publicSlug");

-- 6. Enforce immutability at the database so ordinary application code (or a
--    stray UPDATE) can never change an assigned public slug.
CREATE OR REPLACE FUNCTION "users_public_slug_immutable"() RETURNS trigger AS $$
BEGIN
  IF NEW."publicSlug" IS DISTINCT FROM OLD."publicSlug" THEN
    RAISE EXCEPTION 'users.publicSlug is immutable and cannot be changed';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "users_public_slug_immutable"
  BEFORE UPDATE ON "users"
  FOR EACH ROW EXECUTE FUNCTION "users_public_slug_immutable"();

-- CreateTable
CREATE TABLE "portfolio_profiles" (
    "portfolioId" UUID NOT NULL,
    "displayName" TEXT NOT NULL DEFAULT '',
    "headline" TEXT,
    "bio" TEXT,
    "location" TEXT,
    "avatarAssetId" UUID,
    "emailPublic" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "portfolio_profiles_pkey" PRIMARY KEY ("portfolioId")
);

-- CreateTable
CREATE TABLE "portfolio_sections" (
    "id" UUID NOT NULL,
    "portfolioId" UUID NOT NULL,
    "sectionKey" TEXT NOT NULL,
    "isVisible" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "layoutVariant" TEXT,
    "config" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "portfolio_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" UUID NOT NULL,
    "portfolioId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "description" TEXT,
    "projectUrl" TEXT,
    "repositoryUrl" TEXT,
    "coverAssetId" UUID,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "experiences" (
    "id" UUID NOT NULL,
    "portfolioId" UUID NOT NULL,
    "organization" TEXT NOT NULL,
    "roleTitle" TEXT NOT NULL,
    "location" TEXT,
    "startDate" DATE,
    "endDate" DATE,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "experiences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "education" (
    "id" UUID NOT NULL,
    "portfolioId" UUID NOT NULL,
    "institution" TEXT NOT NULL,
    "degree" TEXT,
    "fieldOfStudy" TEXT,
    "startDate" DATE,
    "endDate" DATE,
    "description" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "education_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skills" (
    "id" UUID NOT NULL,
    "portfolioId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "proficiency" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "skills_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "portfolio_sections_portfolioId_position_idx" ON "portfolio_sections"("portfolioId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "portfolio_sections_portfolioId_sectionKey_key" ON "portfolio_sections"("portfolioId", "sectionKey");

-- CreateIndex
CREATE INDEX "projects_portfolioId_position_id_idx" ON "projects"("portfolioId", "position", "id");

-- CreateIndex
CREATE INDEX "experiences_portfolioId_position_id_idx" ON "experiences"("portfolioId", "position", "id");

-- CreateIndex
CREATE INDEX "education_portfolioId_position_id_idx" ON "education"("portfolioId", "position", "id");

-- CreateIndex
CREATE INDEX "skills_portfolioId_position_id_idx" ON "skills"("portfolioId", "position", "id");

-- AddForeignKey
ALTER TABLE "portfolio_profiles" ADD CONSTRAINT "portfolio_profiles_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "portfolios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolio_sections" ADD CONSTRAINT "portfolio_sections_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "portfolios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "portfolios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "experiences" ADD CONSTRAINT "experiences_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "portfolios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "education" ADD CONSTRAINT "education_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "portfolios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skills" ADD CONSTRAINT "skills_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "portfolios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Spec-required integrity constraints that Prisma cannot express in the schema
-- (BACKEND_SCHEMA.md §3.5 validation notes). New tables are empty, so these
-- apply cleanly.

-- Experience: end date must not precede start date.
ALTER TABLE "experiences" ADD CONSTRAINT "experiences_date_order_check"
    CHECK ("startDate" IS NULL OR "endDate" IS NULL OR "endDate" >= "startDate");

-- Experience: a current role cannot also carry an end date.
ALTER TABLE "experiences" ADD CONSTRAINT "experiences_current_no_end_check"
    CHECK (NOT ("isCurrent" AND "endDate" IS NOT NULL));

-- Education: end date must not precede start date.
ALTER TABLE "education" ADD CONSTRAINT "education_date_order_check"
    CHECK ("startDate" IS NULL OR "endDate" IS NULL OR "endDate" >= "startDate");

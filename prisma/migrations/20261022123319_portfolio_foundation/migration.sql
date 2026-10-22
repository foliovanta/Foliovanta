-- CreateEnum
CREATE TYPE "PortfolioPublicationStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'UNPUBLISHED');

-- CreateEnum
CREATE TYPE "PortfolioModerationStatus" AS ENUM ('CLEAR', 'UNDER_REVIEW', 'SUSPENDED');

-- CreateTable
CREATE TABLE "portfolios" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT,
    "publicationStatus" "PortfolioPublicationStatus" NOT NULL DEFAULT 'DRAFT',
    "moderationStatus" "PortfolioModerationStatus" NOT NULL DEFAULT 'CLEAR',
    "draftRevision" BIGINT NOT NULL DEFAULT 0,
    "nextVersionNumber" INTEGER NOT NULL DEFAULT 1,
    "lastDraftSavedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "portfolios_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "portfolios_slug_key" ON "portfolios"("slug");

-- CreateIndex
CREATE INDEX "portfolios_ownerId_idx" ON "portfolios"("ownerId");

-- CreateIndex
CREATE INDEX "portfolios_publicationStatus_moderationStatus_idx" ON "portfolios"("publicationStatus", "moderationStatus");

-- AddForeignKey
ALTER TABLE "portfolios" ADD CONSTRAINT "portfolios_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

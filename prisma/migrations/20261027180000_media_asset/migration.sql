-- Media storage foundation (M3.4 Step 1). Additive only: a new media_assets
-- table + enums. No changes to existing tables; draft content keeps referencing
-- assets by UUID as before.

-- CreateEnum
CREATE TYPE "MediaAssetPurpose" AS ENUM ('PROFILE_AVATAR', 'PROJECT_COVER');
CREATE TYPE "MediaAssetStatus" AS ENUM ('PENDING', 'READY', 'FAILED', 'DELETING');
CREATE TYPE "MediaStorageProvider" AS ENUM ('R2');

-- CreateTable
CREATE TABLE "media_assets" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "portfolioId" UUID NOT NULL,
    "purpose" "MediaAssetPurpose" NOT NULL,
    "status" "MediaAssetStatus" NOT NULL DEFAULT 'PENDING',
    "provider" "MediaStorageProvider" NOT NULL DEFAULT 'R2',
    "storageKey" TEXT NOT NULL,
    "contentType" TEXT,
    "byteSize" INTEGER,
    "width" INTEGER,
    "height" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "readyAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "media_assets_storageKey_key" ON "media_assets"("storageKey");
CREATE INDEX "media_assets_ownerId_idx" ON "media_assets"("ownerId");
CREATE INDEX "media_assets_portfolioId_status_idx" ON "media_assets"("portfolioId", "status");
CREATE INDEX "media_assets_status_idx" ON "media_assets"("status");

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "portfolios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

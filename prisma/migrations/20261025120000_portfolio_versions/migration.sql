-- AlterTable
ALTER TABLE "portfolios" ADD COLUMN     "activeVersionId" UUID;

-- CreateTable
CREATE TABLE "portfolio_versions" (
    "id" UUID NOT NULL,
    "portfolioId" UUID NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "schemaVersion" INTEGER NOT NULL,
    "sourceDraftRevision" BIGINT NOT NULL,
    "templateId" TEXT NOT NULL,
    "templateVersion" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "contentHash" TEXT NOT NULL,
    "publishedById" UUID NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portfolio_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "portfolio_versions_portfolioId_createdAt_idx" ON "portfolio_versions"("portfolioId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "portfolio_versions_portfolioId_versionNumber_key" ON "portfolio_versions"("portfolioId", "versionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "portfolio_versions_portfolioId_id_key" ON "portfolio_versions"("portfolioId", "id");

-- CreateIndex
CREATE INDEX "portfolios_id_activeVersionId_idx" ON "portfolios"("id", "activeVersionId");

-- AddForeignKey
ALTER TABLE "portfolios" ADD CONSTRAINT "portfolios_id_activeVersionId_fkey" FOREIGN KEY ("id", "activeVersionId") REFERENCES "portfolio_versions"("portfolioId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "portfolio_versions" ADD CONSTRAINT "portfolio_versions_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "portfolios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolio_versions" ADD CONSTRAINT "portfolio_versions_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

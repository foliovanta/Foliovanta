-- Persist the draft template selection on the portfolio. Defaults keep every
-- existing portfolio on Minimal; publishing captures these into the snapshot.
ALTER TABLE "portfolios" ADD COLUMN "templateKey" TEXT NOT NULL DEFAULT 'minimal';
ALTER TABLE "portfolios" ADD COLUMN "templateVersion" TEXT NOT NULL DEFAULT '1.0.0';

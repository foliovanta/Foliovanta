-- Draft design customization (validated DesignConfig JSON). Nullable so every
-- existing portfolio keeps template-default styling until the owner customizes.
ALTER TABLE "portfolios" ADD COLUMN "design" JSONB;

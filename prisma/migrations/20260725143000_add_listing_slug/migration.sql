-- AlterTable
ALTER TABLE "listings" ADD COLUMN IF NOT EXISTS "slug" TEXT NOT NULL DEFAULT '';

-- CreateIndex
CREATE INDEX IF NOT EXISTS "listings_slug_idx" ON "listings"("slug");

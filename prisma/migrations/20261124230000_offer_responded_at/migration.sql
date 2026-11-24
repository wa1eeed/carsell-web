-- AlterTable
ALTER TABLE "Offer" ADD COLUMN     "respondedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Offer_listingId_respondedAt_idx" ON "Offer"("listingId", "respondedAt");


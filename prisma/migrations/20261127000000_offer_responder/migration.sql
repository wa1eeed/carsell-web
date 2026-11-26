-- AlterTable
ALTER TABLE "Offer" ADD COLUMN     "respondedById" TEXT;

-- CreateIndex
CREATE INDEX "Offer_respondedById_respondedAt_idx" ON "Offer"("respondedById", "respondedAt");

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_respondedById_fkey" FOREIGN KEY ("respondedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


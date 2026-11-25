-- AlterEnum
ALTER TYPE "AuctionEventKind" ADD VALUE 'BID_CANCELLED';

-- AlterTable
ALTER TABLE "Bid" ADD COLUMN     "maxAmount" DECIMAL(12,2);

-- CreateTable
CREATE TABLE "CancelledBid" (
    "id" TEXT NOT NULL,
    "auctionId" TEXT NOT NULL,
    "bidderId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "isAuto" BOOLEAN NOT NULL DEFAULT false,
    "placedAt" TIMESTAMP(3) NOT NULL,
    "cancelledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelledById" TEXT NOT NULL,
    "reason" TEXT NOT NULL,

    CONSTRAINT "CancelledBid_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CancelledBid_auctionId_placedAt_idx" ON "CancelledBid"("auctionId", "placedAt");

-- AddForeignKey
ALTER TABLE "CancelledBid" ADD CONSTRAINT "CancelledBid_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES "Auction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CancelledBid" ADD CONSTRAINT "CancelledBid_bidderId_fkey" FOREIGN KEY ("bidderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CancelledBid" ADD CONSTRAINT "CancelledBid_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


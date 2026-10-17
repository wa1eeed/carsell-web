-- CreateEnum
CREATE TYPE "ViewingStatus" AS ENUM ('REQUESTED', 'CONFIRMED', 'DECLINED', 'CANCELLED', 'COMPLETED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ViewingPeriod" AS ENUM ('MORNING', 'NOON', 'AFTERNOON', 'EVENING');

-- CreateEnum
CREATE TYPE "ViewingParty" AS ENUM ('BUYER', 'SELLER');

-- CreateTable
CREATE TABLE "Viewing" (
    "id" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "status" "ViewingStatus" NOT NULL DEFAULT 'REQUESTED',
    "onDate" DATE NOT NULL,
    "period" "ViewingPeriod" NOT NULL,
    "buyerNote" TEXT,
    "meetingPoint" TEXT,
    "declineReason" TEXT,
    "cancelledBy" "ViewingParty",
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Viewing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Viewing_ref_key" ON "Viewing"("ref");

-- CreateIndex
CREATE INDEX "Viewing_sellerId_status_idx" ON "Viewing"("sellerId", "status");

-- CreateIndex
CREATE INDEX "Viewing_buyerId_status_idx" ON "Viewing"("buyerId", "status");

-- CreateIndex
CREATE INDEX "Viewing_status_onDate_idx" ON "Viewing"("status", "onDate");

-- CreateIndex
CREATE INDEX "Viewing_listingId_status_idx" ON "Viewing"("listingId", "status");

-- AddForeignKey
ALTER TABLE "Viewing" ADD CONSTRAINT "Viewing_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Viewing" ADD CONSTRAINT "Viewing_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Viewing" ADD CONSTRAINT "Viewing_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


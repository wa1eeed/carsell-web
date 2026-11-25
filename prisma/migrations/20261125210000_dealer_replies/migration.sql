
-- CreateTable
CREATE TABLE "DealerReply" (
    "id" TEXT NOT NULL,
    "dealerId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "DealerReply_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DealerReply_dealerId_sortOrder_idx" ON "DealerReply"("dealerId", "sortOrder");

-- AddForeignKey
ALTER TABLE "DealerReply" ADD CONSTRAINT "DealerReply_dealerId_fkey" FOREIGN KEY ("dealerId") REFERENCES "Dealer"("id") ON DELETE CASCADE ON UPDATE CASCADE;


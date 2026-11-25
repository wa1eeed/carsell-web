-- CreateTable
CREATE TABLE "DealerSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dealerId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DealerSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DealerSession_tokenHash_key" ON "DealerSession"("tokenHash");

-- CreateIndex
CREATE INDEX "DealerSession_userId_revokedAt_idx" ON "DealerSession"("userId", "revokedAt");

-- CreateIndex
CREATE INDEX "DealerSession_dealerId_idx" ON "DealerSession"("dealerId");

-- AddForeignKey
ALTER TABLE "DealerSession" ADD CONSTRAINT "DealerSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealerSession" ADD CONSTRAINT "DealerSession_dealerId_fkey" FOREIGN KEY ("dealerId") REFERENCES "Dealer"("id") ON DELETE CASCADE ON UPDATE CASCADE;


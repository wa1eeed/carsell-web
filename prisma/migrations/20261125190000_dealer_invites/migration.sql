-- CreateTable
CREATE TABLE "DealerInvite" (
    "id" TEXT NOT NULL,
    "dealerId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "role" "DealerRole" NOT NULL,
    "branchId" TEXT,
    "invitedById" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DealerInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DealerInvite_phone_acceptedAt_idx" ON "DealerInvite"("phone", "acceptedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DealerInvite_dealerId_phone_key" ON "DealerInvite"("dealerId", "phone");

-- AddForeignKey
ALTER TABLE "DealerInvite" ADD CONSTRAINT "DealerInvite_dealerId_fkey" FOREIGN KEY ("dealerId") REFERENCES "Dealer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealerInvite" ADD CONSTRAINT "DealerInvite_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealerInvite" ADD CONSTRAINT "DealerInvite_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


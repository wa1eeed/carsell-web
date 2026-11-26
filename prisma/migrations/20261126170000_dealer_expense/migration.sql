-- CreateEnum
CREATE TYPE "DealerExpenseKind" AS ENUM ('RENT', 'SALARIES', 'MARKETING', 'UTILITIES', 'GOVERNMENT', 'FACILITY', 'OTHER');

-- CreateTable
CREATE TABLE "DealerExpense" (
    "id" TEXT NOT NULL,
    "dealerId" TEXT NOT NULL,
    "branchId" TEXT,
    "kind" "DealerExpenseKind" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "note" TEXT,
    "spentAt" TIMESTAMP(3) NOT NULL,
    "recordedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DealerExpense_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DealerExpense_dealerId_spentAt_idx" ON "DealerExpense"("dealerId", "spentAt");

-- CreateIndex
CREATE INDEX "DealerExpense_branchId_spentAt_idx" ON "DealerExpense"("branchId", "spentAt");

-- AddForeignKey
ALTER TABLE "DealerExpense" ADD CONSTRAINT "DealerExpense_dealerId_fkey" FOREIGN KEY ("dealerId") REFERENCES "Dealer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealerExpense" ADD CONSTRAINT "DealerExpense_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealerExpense" ADD CONSTRAINT "DealerExpense_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


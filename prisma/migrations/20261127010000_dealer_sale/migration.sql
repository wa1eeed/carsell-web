-- CreateEnum
CREATE TYPE "DealerSaleChannel" AS ENUM ('COUNTER', 'MARKET');

-- CreateTable
CREATE TABLE "DealerSale" (
    "id" TEXT NOT NULL,
    "dealerId" TEXT NOT NULL,
    "branchId" TEXT,
    "vehicleId" TEXT NOT NULL,
    "channel" "DealerSaleChannel" NOT NULL,
    "soldById" TEXT,
    "price" DECIMAL(12,2) NOT NULL,
    "buyerName" TEXT,
    "invoiceId" TEXT,
    "orderId" TEXT,
    "soldAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DealerSale_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DealerSale_invoiceId_key" ON "DealerSale"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "DealerSale_orderId_key" ON "DealerSale"("orderId");

-- CreateIndex
CREATE INDEX "DealerSale_dealerId_soldAt_idx" ON "DealerSale"("dealerId", "soldAt");

-- CreateIndex
CREATE INDEX "DealerSale_branchId_soldAt_idx" ON "DealerSale"("branchId", "soldAt");

-- CreateIndex
CREATE INDEX "DealerSale_soldById_soldAt_idx" ON "DealerSale"("soldById", "soldAt");

-- AddForeignKey
ALTER TABLE "DealerSale" ADD CONSTRAINT "DealerSale_dealerId_fkey" FOREIGN KEY ("dealerId") REFERENCES "Dealer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealerSale" ADD CONSTRAINT "DealerSale_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealerSale" ADD CONSTRAINT "DealerSale_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealerSale" ADD CONSTRAINT "DealerSale_soldById_fkey" FOREIGN KEY ("soldById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


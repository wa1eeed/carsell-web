-- CreateEnum
CREATE TYPE "InstallmentStatus" AS ENUM ('ACTIVE', 'SETTLED', 'DEFAULTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InstallmentMethod" AS ENUM ('CASH', 'CARD', 'TRANSFER');

-- CreateTable
CREATE TABLE "InstallmentPlan" (
    "id" TEXT NOT NULL,
    "dealerId" TEXT NOT NULL,
    "branchId" TEXT,
    "vehicleId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "buyerName" TEXT NOT NULL,
    "buyerPhone" TEXT,
    "buyerVatNo" TEXT,
    "totalPrice" DECIMAL(12,2) NOT NULL,
    "downPayment" DECIMAL(12,2) NOT NULL,
    "months" INTEGER NOT NULL,
    "startsOn" TIMESTAMP(3) NOT NULL,
    "status" "InstallmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settledAt" TIMESTAMP(3),

    CONSTRAINT "InstallmentPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstallmentDue" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "dueOn" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "paidAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "settledAt" TIMESTAMP(3),

    CONSTRAINT "InstallmentDue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstallmentReceipt" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "dueId" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "method" "InstallmentMethod" NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "recordedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InstallmentReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InstallmentPlan_dealerId_status_idx" ON "InstallmentPlan"("dealerId", "status");

-- CreateIndex
CREATE INDEX "InstallmentPlan_branchId_status_idx" ON "InstallmentPlan"("branchId", "status");

-- CreateIndex
CREATE INDEX "InstallmentDue_planId_dueOn_idx" ON "InstallmentDue"("planId", "dueOn");

-- CreateIndex
CREATE UNIQUE INDEX "InstallmentDue_planId_sequence_key" ON "InstallmentDue"("planId", "sequence");

-- CreateIndex
CREATE INDEX "InstallmentReceipt_planId_receivedAt_idx" ON "InstallmentReceipt"("planId", "receivedAt");

-- AddForeignKey
ALTER TABLE "InstallmentPlan" ADD CONSTRAINT "InstallmentPlan_dealerId_fkey" FOREIGN KEY ("dealerId") REFERENCES "Dealer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallmentPlan" ADD CONSTRAINT "InstallmentPlan_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallmentPlan" ADD CONSTRAINT "InstallmentPlan_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallmentPlan" ADD CONSTRAINT "InstallmentPlan_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "TaxInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallmentPlan" ADD CONSTRAINT "InstallmentPlan_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallmentDue" ADD CONSTRAINT "InstallmentDue_planId_fkey" FOREIGN KEY ("planId") REFERENCES "InstallmentPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallmentReceipt" ADD CONSTRAINT "InstallmentReceipt_planId_fkey" FOREIGN KEY ("planId") REFERENCES "InstallmentPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallmentReceipt" ADD CONSTRAINT "InstallmentReceipt_dueId_fkey" FOREIGN KEY ("dueId") REFERENCES "InstallmentDue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallmentReceipt" ADD CONSTRAINT "InstallmentReceipt_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


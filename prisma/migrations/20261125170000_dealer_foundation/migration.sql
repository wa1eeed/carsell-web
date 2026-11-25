-- CreateEnum
CREATE TYPE "DealerRole" AS ENUM ('OWNER', 'MANAGER', 'SALES', 'ACCOUNTANT');

-- CreateEnum
CREATE TYPE "VehicleCostKind" AS ENUM ('PURCHASE', 'TRANSPORT', 'INSPECTION', 'MAINTENANCE', 'DETAILING', 'CUSTOMS', 'OTHER');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "branchId" TEXT,
ADD COLUMN     "dealerRole" "DealerRole";

-- AlterTable
ALTER TABLE "Vehicle" ADD COLUMN     "branchId" TEXT;

-- CreateTable
CREATE TABLE "Branch" (
    "id" TEXT NOT NULL,
    "dealerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "address" TEXT,
    "phone" TEXT,
    "managerId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Branch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VehicleCost" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "kind" "VehicleCostKind" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "note" TEXT,
    "incurredAt" TIMESTAMP(3) NOT NULL,
    "recordedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VehicleCost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Branch_dealerId_active_idx" ON "Branch"("dealerId", "active");

-- CreateIndex
CREATE INDEX "VehicleCost_vehicleId_incurredAt_idx" ON "VehicleCost"("vehicleId", "incurredAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Branch" ADD CONSTRAINT "Branch_dealerId_fkey" FOREIGN KEY ("dealerId") REFERENCES "Dealer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Branch" ADD CONSTRAINT "Branch_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleCost" ADD CONSTRAINT "VehicleCost_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleCost" ADD CONSTRAINT "VehicleCost_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ═══ سعرُ شراءٍ واحد للمركبة — محروسًا لا بالانضباط ═══
--
-- الهامشُ = سعرُ البيع − مجموعُ الكلفة. وسطرا شراءٍ لمركبةٍ واحدة
-- يضاعفان الكلفة فيُنتجان هامشًا سالبًا، **وتُحسب عليه ضريبةٌ**.
-- وفحصٌ في الدالّة يحرس مدخلًا واحدًا؛ والفهرسُ يحرس الجدول.
CREATE UNIQUE INDEX "VehicleCost_one_purchase_per_vehicle"
  ON "VehicleCost" ("vehicleId")
  WHERE "kind" = 'PURCHASE';

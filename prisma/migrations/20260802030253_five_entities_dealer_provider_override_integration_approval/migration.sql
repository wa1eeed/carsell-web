/*
  Warnings:

  - You are about to drop the column `releaseApprovedBy` on the `Escrow` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "DealerStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "ProviderType" AS ENUM ('INSPECTION', 'SHIPPING', 'INSURANCE', 'DETAILING', 'PHOTOGRAPHY', 'FINANCE', 'OTHER');

-- CreateEnum
CREATE TYPE "IntegrationCategory" AS ENUM ('IDENTITY', 'PAYMENT', 'GOVERNMENT', 'INFRASTRUCTURE');

-- CreateEnum
CREATE TYPE "IntegrationStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'DEGRADED');

-- CreateEnum
CREATE TYPE "ApprovalKind" AS ENUM ('ESCROW_RELEASE', 'KEY_ROTATION', 'COMMISSION_CHANGE', 'PLAN_CHANGE', 'USER_BAN');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'EXECUTED');

-- AlterTable
ALTER TABLE "Escrow" DROP COLUMN "releaseApprovedBy";

-- CreateTable
CREATE TABLE "Dealer" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "logoUrl" TEXT,
    "coverUrl" TEXT,
    "aboutAr" TEXT,
    "aboutEn" TEXT,
    "city" TEXT NOT NULL,
    "address" TEXT,
    "phone" TEXT,
    "hours" JSONB,
    "crNumber" TEXT,
    "vatNumber" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "ratingAvg" DECIMAL(3,2),
    "ratingCount" INTEGER NOT NULL DEFAULT 0,
    "status" "DealerStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Dealer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceProvider" (
    "id" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "logoUrl" TEXT,
    "type" "ProviderType" NOT NULL,
    "contactPhone" TEXT,
    "contactEmail" TEXT,
    "commissionPct" DECIMAL(5,2),
    "slaHours" INTEGER,
    "cities" TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ServiceProvider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EntitlementOverride" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "dealerId" TEXT,
    "entitlementKey" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EntitlementOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Integration" (
    "key" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "category" "IntegrationCategory" NOT NULL,
    "status" "IntegrationStatus" NOT NULL DEFAULT 'INACTIVE',
    "configPublic" JSONB,
    "secretsEncrypted" TEXT,
    "lastCheckAt" TIMESTAMP(3),
    "lastCheckOk" BOOLEAN,
    "failureBehavior" TEXT NOT NULL,

    CONSTRAINT "Integration_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "ApprovalRequest" (
    "id" TEXT NOT NULL,
    "kind" "ApprovalKind" NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "requestedBy" TEXT NOT NULL,
    "approvedBy" TEXT[],
    "requiredApprovals" INTEGER NOT NULL DEFAULT 2,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "executedAt" TIMESTAMP(3),

    CONSTRAINT "ApprovalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Dealer_slug_key" ON "Dealer"("slug");

-- CreateIndex
CREATE INDEX "Dealer_status_city_idx" ON "Dealer"("status", "city");

-- CreateIndex
CREATE INDEX "ServiceProvider_type_active_idx" ON "ServiceProvider"("type", "active");

-- CreateIndex
CREATE INDEX "EntitlementOverride_userId_entitlementKey_idx" ON "EntitlementOverride"("userId", "entitlementKey");

-- CreateIndex
CREATE INDEX "EntitlementOverride_dealerId_entitlementKey_idx" ON "EntitlementOverride"("dealerId", "entitlementKey");

-- CreateIndex
CREATE INDEX "Integration_category_status_idx" ON "Integration"("category", "status");

-- CreateIndex
CREATE INDEX "ApprovalRequest_status_kind_idx" ON "ApprovalRequest"("status", "kind");

-- CreateIndex
CREATE INDEX "ApprovalRequest_entityType_entityId_idx" ON "ApprovalRequest"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "Subscription_dealerId_status_idx" ON "Subscription"("dealerId", "status");

-- CreateIndex
CREATE INDEX "User_dealerId_idx" ON "User"("dealerId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_dealerId_fkey" FOREIGN KEY ("dealerId") REFERENCES "Dealer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_dealerId_fkey" FOREIGN KEY ("dealerId") REFERENCES "Dealer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "ServiceProvider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRequest" ADD CONSTRAINT "ServiceRequest_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "ServiceProvider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_dealerId_fkey" FOREIGN KEY ("dealerId") REFERENCES "Dealer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntitlementOverride" ADD CONSTRAINT "EntitlementOverride_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- رحلة الفحص ثلاثية الأطراف (قرار المالك ٢٠٢٦-١٠-١٤):
-- طلبُ المشتري يمرّ بالبائع، والسداد بعد قبوله، والتوزيع بصنف المزوّد.

ALTER TYPE "ServiceRequestStatus" ADD VALUE IF NOT EXISTS 'AWAITING_SELLER' BEFORE 'NEW';
ALTER TYPE "ServiceRequestStatus" ADD VALUE IF NOT EXISTS 'AWAITING_PAYMENT' BEFORE 'NEW';
ALTER TYPE "ServiceRequestStatus" ADD VALUE IF NOT EXISTS 'DECLINED' BEFORE 'NEW';

ALTER TABLE "ServiceRequest"
  ADD COLUMN "sellerId"      TEXT,
  ADD COLUMN "decisionDueAt" TIMESTAMP(3),
  ADD COLUMN "decidedAt"     TIMESTAMP(3),
  ADD COLUMN "declineReason" TEXT,
  ADD COLUMN "paymentId"     TEXT;

ALTER TABLE "ServiceRequest"
  ADD CONSTRAINT "ServiceRequest_sellerId_fkey"
  FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "ServiceRequest_sellerId_status_idx" ON "ServiceRequest"("sellerId", "status");

ALTER TABLE "Service" ADD COLUMN "providerType" "ProviderType";

-- والخدمات المزروعة يرث صنفُها من مزوّدها المفضَّل، فلا يبقى طابورٌ بلا صنف
UPDATE "Service" s
SET "providerType" = p."type"
FROM "ServiceProvider" p
WHERE s."providerId" = p."id" AND s."providerType" IS NULL;

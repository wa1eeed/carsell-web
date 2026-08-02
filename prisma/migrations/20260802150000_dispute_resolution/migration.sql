-- قرار النزاع: مبلغ التسوية، ومرجع الموافقة، وتاريخا الفتح والحسم.
ALTER TYPE "ApprovalKind" ADD VALUE IF NOT EXISTS 'DISPUTE_RESOLUTION';

ALTER TABLE "Dispute" ADD COLUMN IF NOT EXISTS "resolutionAmount" DECIMAL(12,2);
ALTER TABLE "Dispute" ADD COLUMN IF NOT EXISTS "resolvedAt" TIMESTAMP(3);
ALTER TABLE "Dispute" ADD COLUMN IF NOT EXISTS "approvalId" TEXT;
ALTER TABLE "Dispute" ADD COLUMN IF NOT EXISTS "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- الصفوف القائمة: تاريخ الفتح يُشتقّ من مهلة الردّ ناقص ٤٨ ساعة، وهو
-- أدقّ تقدير ممكن بأثر رجعي.
UPDATE "Dispute" SET "openedAt" = "slaDueAt" - INTERVAL '48 hours' WHERE "openedAt" IS NOT NULL;

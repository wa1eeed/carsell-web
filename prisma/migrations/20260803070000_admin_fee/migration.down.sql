-- استعادة الوعاء القديم **قبل** إسقاط الأعمدة — والصيغة القديمة
-- استنتاجية (١٥/١١٥ من الإجمالي) فتُستعاد حرفيًّا لا تقريبًا.
UPDATE "Order" o
SET "vatAmount" = ROUND(
  o."totalAmount"
    * COALESCE((SELECT p."vatPct" FROM "PlatformSetting" p WHERE p.id = 'default'), 15)
    / (100 + COALESCE((SELECT p."vatPct" FROM "PlatformSetting" p WHERE p.id = 'default'), 15)),
  2
);

-- نقض الترحيل. قيَم `SupplyType` لا تُحذف في PostgreSQL — والفواتير
-- الصادرة قد تشير إليها، وحذفُ قيمةٍ تشير إليها وثيقةٌ ليس نقضًا.
ALTER TABLE "Order"           DROP COLUMN IF EXISTS "transferAdminFee";
ALTER TABLE "PlatformSetting" DROP COLUMN IF EXISTS "transferAdminFee",
                              DROP COLUMN IF EXISTS "transferAdminFeeEnabled";
ALTER TABLE "ServiceRequest"  DROP COLUMN IF EXISTS "adminFee";
ALTER TABLE "Service"         DROP COLUMN IF EXISTS "adminFee",
                              DROP COLUMN IF EXISTS "adminFeeEnabled";

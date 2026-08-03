-- نقض الترحيل.
ALTER TABLE "Order"           DROP COLUMN IF EXISTS "processingFeeBearer",
                              DROP COLUMN IF EXISTS "processingFee";
ALTER TABLE "PlatformSetting" DROP COLUMN IF EXISTS "processingFeeFixed",
                              DROP COLUMN IF EXISTS "processingFeePct",
                              DROP COLUMN IF EXISTS "processingFeeBearer",
                              DROP COLUMN IF EXISTS "processingFeeEnabled";
DROP TYPE IF EXISTS "FeeBearer";

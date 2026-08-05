-- Postgres لا يحذف قيمةً من تعداد. والنقض يُعيد الصفوف إلى حالةٍ
-- قائمة قبل أن يُعاد بناء النوع — وإلّا بقيت صفوفٌ تشير إلى قيمةٍ
-- لا وجود لها.
UPDATE "Listing" SET "status" = 'SUSPENDED' WHERE "status" = 'PAUSED';

ALTER TYPE "ListingStatus" RENAME TO "ListingStatus_old";
CREATE TYPE "ListingStatus" AS ENUM (
  'DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'RESERVED', 'SOLD', 'SUSPENDED', 'EXPIRED'
);
ALTER TABLE "Listing"
  ALTER COLUMN "status" DROP DEFAULT,
  ALTER COLUMN "status" TYPE "ListingStatus" USING "status"::text::"ListingStatus",
  ALTER COLUMN "status" SET DEFAULT 'DRAFT';
DROP TYPE "ListingStatus_old";

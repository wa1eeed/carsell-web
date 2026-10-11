DROP INDEX IF EXISTS "ServiceRequest_scheduledAt_idx";
ALTER TABLE "ServiceRequest" DROP COLUMN IF EXISTS "city";
ALTER TABLE "ServiceRequest" DROP COLUMN IF EXISTS "scheduledAt";

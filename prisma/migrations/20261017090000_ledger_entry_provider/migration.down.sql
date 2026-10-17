DROP INDEX IF EXISTS "LedgerEntry_providerId_createdAt_idx";
ALTER TABLE "LedgerEntry" DROP COLUMN IF EXISTS "providerId";

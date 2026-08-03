-- نقض الترحيل.
ALTER TABLE "Listing" DROP COLUMN IF EXISTS "taxableSupply";
ALTER TABLE "User"    DROP COLUMN IF EXISTS "taxStatusSetAt",
                      DROP COLUMN IF EXISTS "vatNumber",
                      DROP COLUMN IF EXISTS "taxStatus";
DROP TYPE IF EXISTS "TaxStatus";

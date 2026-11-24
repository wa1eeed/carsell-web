DROP INDEX IF EXISTS "Offer_listingId_respondedAt_idx";
ALTER TABLE "Offer" DROP COLUMN IF EXISTS "respondedAt";

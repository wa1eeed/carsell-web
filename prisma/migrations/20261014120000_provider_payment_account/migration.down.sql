-- نقضٌ كامل. ولا مالَ يتحرّك على هذه الأعمدة بعد، فالرجوع بلا أثر.
DROP INDEX "ServiceProvider_accountRef_key";
ALTER TABLE "ServiceProvider"
  DROP COLUMN "accountRef",
  DROP COLUMN "payoutRef",
  DROP COLUMN "accountStatus",
  DROP COLUMN "accountNote",
  DROP COLUMN "accountSyncAt";
DROP TYPE "ProviderAccountStatus";

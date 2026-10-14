-- حساب دفع المزوّد لدى بوّابة المزوّدين (قرار المالك ٢٠٢٦-١٠-١٤)
CREATE TYPE "ProviderAccountStatus" AS ENUM (
  'NONE', 'PENDING', 'MISSING_DOCS', 'UNDER_REVIEW',
  'SEMI_ACTIVE', 'ACTIVE', 'HOLD', 'REJECTED', 'DISABLED'
);

ALTER TABLE "ServiceProvider"
  ADD COLUMN "accountRef"    TEXT,
  ADD COLUMN "payoutRef"     TEXT,
  ADD COLUMN "accountStatus" "ProviderAccountStatus" NOT NULL DEFAULT 'NONE',
  ADD COLUMN "accountNote"   TEXT,
  ADD COLUMN "accountSyncAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "ServiceProvider_accountRef_key" ON "ServiceProvider"("accountRef");

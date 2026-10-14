-- ═══ مصفوفةُ رسوم بوّابة المزوّدين + ملفُّ التسجيل ═══
--
-- قرار المالك: «الرسوم تُضبط من لوحة الأدمن ولا نضعها داخل الكود».
-- و`NULL` ليست صفرًا — ما لم يقرّره أحد لا يُرسَل إلى البوّابة.

CREATE TYPE "ProviderAccountKind" AS ENUM ('FREELANCER', 'ESTABLISHMENT', 'COMPANY', 'GOVERNMENT', 'CHARITY');
CREATE TYPE "AccountSignatory" AS ENUM ('OWNER', 'COMMERCIAL_CONTRACT', 'POWER_OF_ATTORNEY');

ALTER TABLE "PlatformSetting"
  ADD COLUMN "providerFeeMadaPct"         DECIMAL(6,3),
  ADD COLUMN "providerFeeMadaFixed"       DECIMAL(10,2),
  ADD COLUMN "providerFeeMadaCap"         DECIMAL(10,2),
  ADD COLUMN "providerFeeMadaRefundFixed" DECIMAL(10,2),
  ADD COLUMN "providerFeeCardPct"         DECIMAL(6,3),
  ADD COLUMN "providerFeeCardFixed"       DECIMAL(10,2),
  ADD COLUMN "providerFeeCardRefundFixed" DECIMAL(10,2),
  ADD COLUMN "providerFeeTaxInclusive"    BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "ServiceProvider"
  ADD COLUMN "accountKind"           "ProviderAccountKind",
  ADD COLUMN "accountSlug"           TEXT,
  ADD COLUMN "accountWebsite"        TEXT,
  ADD COLUMN "accountOwners"         INTEGER,
  ADD COLUMN "accountSignatory"      "AccountSignatory",
  ADD COLUMN "accountSignatoryCount" INTEGER,
  ADD COLUMN "accountLicence"        BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "accountFees"           JSONB;

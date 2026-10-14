-- نقضٌ يُتلف شروطًا تجاريّة: مصفوفةُ الرسوم ولقطتُها لدى كل شريك.
-- والحسابات المفتوحة تبقى عند البوّابة بشروطها، فالرجوع يُفقدنا
-- معرفةَ ما أُرسل لا أكثر — لكنّه يُفقدناها.
ALTER TABLE "ServiceProvider"
  DROP COLUMN "accountKind",
  DROP COLUMN "accountSlug",
  DROP COLUMN "accountWebsite",
  DROP COLUMN "accountOwners",
  DROP COLUMN "accountSignatory",
  DROP COLUMN "accountSignatoryCount",
  DROP COLUMN "accountLicence",
  DROP COLUMN "accountFees";

ALTER TABLE "PlatformSetting"
  DROP COLUMN "providerFeeMadaPct",
  DROP COLUMN "providerFeeMadaFixed",
  DROP COLUMN "providerFeeMadaCap",
  DROP COLUMN "providerFeeMadaRefundFixed",
  DROP COLUMN "providerFeeCardPct",
  DROP COLUMN "providerFeeCardFixed",
  DROP COLUMN "providerFeeCardRefundFixed",
  DROP COLUMN "providerFeeTaxInclusive";

DROP TYPE "AccountSignatory";
DROP TYPE "ProviderAccountKind";

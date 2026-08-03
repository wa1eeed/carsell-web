-- ═══ هامش الربح يتبع التسجيل الضريبيّ لا صفة المعرض ═══
--
-- فردٌ مسجَّل قد يستحقّه ولا صفّ معرضٍ له. والحقول تنتقل إلى `User`،
-- وتبقى على `Dealer` للتوافق حتى يُحذف قارئها الأخير.

ALTER TABLE "User"
  ADD COLUMN "marginSchemeApproved" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "marginSchemeRef" TEXT,
  ADD COLUMN "marginSchemeBy" TEXT,
  ADD COLUMN "marginSchemeAt" TIMESTAMP(3);

-- نقلُ الاعتمادات القائمة: ما مُنح للمعرض يسري على أعضائه، فهم يورّدون
-- باسمه. وتركُها خلفنا يُسقط اعتمادًا مُنح فعلًا فتُحتسب الضريبة كاملةً.
UPDATE "User" u
SET "marginSchemeApproved" = d."marginSchemeApproved",
    "marginSchemeRef"      = d."marginSchemeRef",
    "marginSchemeBy"       = d."marginSchemeBy",
    "marginSchemeAt"       = d."marginSchemeAt"
FROM "Dealer" d
WHERE u."dealerId" = d.id AND d."marginSchemeApproved" = true;

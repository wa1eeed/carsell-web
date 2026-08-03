-- ═══ الوضع الضريبيّ للمستخدم — يُسأل مرّة عند أوّل إجراء ═══
--
-- `taxStatus` يقبل NULL عمدًا: «لم يُسأل بعد» حالٌ ثالثة لا تُختزل في
-- «فرد». واختزالها يجعل التصنيف اختيارَنا، ونحن نُصدر عنه فواتير.

CREATE TYPE "TaxStatus" AS ENUM ('INDIVIDUAL', 'VAT_REGISTERED');

ALTER TABLE "User"
  ADD COLUMN "taxStatus" "TaxStatus",
  ADD COLUMN "vatNumber" TEXT,
  ADD COLUMN "taxStatusSetAt" TIMESTAMP(3);

-- استثناء الإعلان الواحد — NULL تعني «اتبع وضع البائع»
ALTER TABLE "Listing"
  ADD COLUMN "taxableSupply" BOOLEAN;

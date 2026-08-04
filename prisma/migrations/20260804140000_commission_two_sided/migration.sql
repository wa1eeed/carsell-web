-- ═══ العمولة طرفان مستقلّان ═══
--
-- كانت قاعدةً واحدة تُضاف إلى إجمالي المشتري **وتُخصم من صافي البائع
-- معًا**: عمولةٌ معلنة ٢٬٥٠٠ تأخذ ٥٬٠٠٠، ولا حقل يقول أيّهما قُصد.
--
-- والصفوف القائمة تُنقل إلى **البائع**، لأن `documents.ts` — وهو ما
-- يراه البائع في كشف تسويته — كان يخصم `commissionAmount` من صافيه.
-- والإضافة إلى المشتري كانت العطل، فلا تُخلَّد في البيانات.

CREATE TYPE "CommissionSide" AS ENUM ('BUYER', 'SELLER');

ALTER TABLE "CommissionRule"
  ADD COLUMN "side" "CommissionSide" NOT NULL DEFAULT 'SELLER',
  ADD COLUMN "enabled" BOOLEAN NOT NULL DEFAULT true;

DROP INDEX IF EXISTS "CommissionRule_scope_activeFrom_idx";
CREATE INDEX "CommissionRule_scope_side_activeFrom_idx"
  ON "CommissionRule" ("scope", "side", "activeFrom");

ALTER TABLE "Order"
  ADD COLUMN "buyerCommission"  DECIMAL(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN "sellerCommission" DECIMAL(12, 2) NOT NULL DEFAULT 0;

-- الطلبات القائمة: العمولة كانت تُخصم من البائع في كشف التسوية
UPDATE "Order" SET "sellerCommission" = "commissionAmount";

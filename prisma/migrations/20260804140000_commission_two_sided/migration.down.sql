-- النقض: العمودان مشتقّان — `commissionAmount` يبقى وهو مجموعهما،
-- فلا يُفقد مالٌ ولا معاملة بحذفهما. والقاعدة تعود طرفًا واحدًا كما كانت.
--
-- **ولا يُنقض بعد أن تُطبَّق عمولة على المشتري فعلًا**: عندها
-- `buyerCommission` يحمل ما لا يحمله غيره، وحذفه يمحو من دفع ماذا.

ALTER TABLE "Order"
  DROP COLUMN IF EXISTS "buyerCommission",
  DROP COLUMN IF EXISTS "sellerCommission";

DROP INDEX IF EXISTS "CommissionRule_scope_side_activeFrom_idx";
CREATE INDEX "CommissionRule_scope_activeFrom_idx"
  ON "CommissionRule" ("scope", "activeFrom");

ALTER TABLE "CommissionRule"
  DROP COLUMN IF EXISTS "side",
  DROP COLUMN IF EXISTS "enabled";

DROP TYPE IF EXISTS "CommissionSide";

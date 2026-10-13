-- نقضٌ كامل: العمود ثمّ النوع. والافتراضيّ `FIXED` هو السلوك السابق،
-- فالرجوع لا يغيّر حسابًا قائمًا.
ALTER TABLE "Service" DROP COLUMN "adminFeeMode";
DROP TYPE "ServiceFeeMode";

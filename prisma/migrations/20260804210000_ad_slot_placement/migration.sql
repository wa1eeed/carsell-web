-- A30: المقاس المقروء والموضع.
--
-- `width×height` لا يصفان نسبةً («١٦:٦») ولا بطاقةً («بطاقة سيارة»)،
-- فتُعرض مساحةٌ نسبتُها ١٦:٦ على أنها ١٦×٦ بكسل. و«الموضع» عمودٌ في
-- التصميم: مساحةٌ تُباع لمعلنٍ بلا موضعٍ مكتوب تُباع بلا وصف.
ALTER TABLE "AdSlot" ADD COLUMN "sizeLabel" TEXT NOT NULL DEFAULT '';
ALTER TABLE "AdSlot" ADD COLUMN "placement" TEXT NOT NULL DEFAULT '';

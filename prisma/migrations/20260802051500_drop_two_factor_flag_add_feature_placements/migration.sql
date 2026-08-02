-- twoFactorEnabled يُحذف: TOTP إلزامي لكل الأدوار، والحقيقة هي
-- totpEnrolledAt !== null. حقلٌ منفصل يوحي بالاختيارية وقد يُقرأ
-- لاحقًا كبوابة. لا فقدان بيانات: القيمة كانت مشتقّة لا مصدرًا.
ALTER TABLE "AdminUser" DROP COLUMN "twoFactorEnabled";

-- مواضع ظهور الميزة الأربعة (قرار A19 بند ٣).
-- الافتراضي مصفوفة فارغة، ثم تُملأ من الزرع — لا ميزة تظهر في
-- موضع لم يُقرَّر لها.
ALTER TABLE "Feature" ADD COLUMN "placements" TEXT[] DEFAULT ARRAY[]::TEXT[];
UPDATE "Feature" SET "placements" = ARRAY['trim_editor','search_filter','listing_page'];
ALTER TABLE "Feature" ALTER COLUMN "placements" DROP DEFAULT;
ALTER TABLE "Feature" ALTER COLUMN "placements" SET NOT NULL;

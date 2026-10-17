-- هويّةٌ ثابتة للسؤال — ولا ترشيحَ بلا هويّة.
--
-- قرار المالك (٢٠٢٦-١٠-١٧): «الوعدُ المكتوب يتغيّر حسب حالة العمولة —
-- إن فعّلناها يُزال الوعد … من الرئيسية ومن الأسئلة الشائعة».
--
-- والمطابقةُ بنصّ السؤال هشّة: يعدّله المشغّل من `/admin/faq` فينفكّ
-- الشرط صامتًا.
ALTER TABLE "FaqItem" ADD COLUMN IF NOT EXISTS "key" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "FaqItem_key_key" ON "FaqItem"("key");

-- **والبياناتُ المرجعية تصل القاعدةَ الحيّة بترحيل**: الملفّ يُطبَّق
-- على قاعدةٍ فارغة مرّةً، وشاشةُ الأدمن تعدّل ولا تُنشئ.
UPDATE "FaqItem" SET "key" = 'selling_commission'
 WHERE "key" IS NULL AND "questionAr" LIKE '%عمولة على البيع%';

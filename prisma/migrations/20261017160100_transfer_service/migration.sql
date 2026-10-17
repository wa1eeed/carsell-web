-- ═══ «نقل الملكية» كانت خدمةً تُعرض ولا تُطلب ═══
--
-- قِيس: `ownership_transfer` معروضةٌ في **الصفحة الرئيسية** بـ٣٥٠ ريالًا
-- و`isAutomated = false` و`providerType = NULL` — فـ`cityPool(null)`
-- تُعيد فراغًا و`requestService` تردّ `CITY_NOT_COVERED` **دائمًا**.
-- خدمةٌ بسعرٍ على سطحٍ عامّ لا تُشترى أبدًا.
--
-- **والبياناتُ المرجعية تصل القاعدةَ الحيّة بترحيل لا ببذرة**: الملفّ
-- `seed-data/services.json` يُطبَّق مرّةً على قاعدةٍ فارغة، وشاشةُ
-- الأدمن تعدّل ولا تُنشئ — فتصحيحٌ في الملفّ يصل بيئةً جديدة ولا يصل
-- بيئةً تعمل.
--
-- و`IS NULL` في الشرط: من بدّل الصنف يدًا لا نكتب فوقه.
UPDATE "Service"
   SET "providerType" = 'TRANSFER'
 WHERE "key" = 'ownership_transfer'
   AND "providerType" IS NULL;

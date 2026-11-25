-- أسماءُ الخدمات من التصميم — والبذرةُ لا تصل قاعدةً تعمل
--
-- `prisma/seed-data/services.json` يُطبَّق بـ`createMany` على قاعدةٍ
-- فارغة مرّةً واحدة، وشاشةُ A7 تعدّل ولا تُنشئ. فاسمٌ يُصحَّح في الملفّ
-- يصل بيئةً جديدة ولا يصل بيئةً تعمل.
--
-- والشرطُ على القيمة القديمة لا على المفتاح وحده: المشغّل يملك تعديل
-- الاسم من A7، وترحيلٌ يكتب فوقه يمحو عملَه بلا كلمة. فمن بدّله أحد
-- يبقى كما بدّله.
UPDATE "Service" SET "nameAr" = 'فحص فني معتمد',        "nameEn" = 'Certified inspection'
  WHERE "key" = 'inspection'         AND "nameAr" = 'فحص فني 210 نقطة';
UPDATE "Service" SET "nameAr" = 'نقل الملكية بالإنابة', "nameEn" = 'Ownership transfer by proxy'
  WHERE "key" = 'ownership_transfer' AND "nameAr" = 'نقل الملكية';
UPDATE "Service" SET "nameAr" = 'شحن بين المدن',        "nameEn" = 'Intercity shipping'
  WHERE "key" = 'shipping'           AND "nameAr" = 'شحن ونقل';
UPDATE "Service" SET "nameAr" = 'ترويج الإعلان',        "nameEn" = 'Listing promotion'
  WHERE "key" = 'featured_listing'   AND "nameAr" = 'تمييز الإعلان';

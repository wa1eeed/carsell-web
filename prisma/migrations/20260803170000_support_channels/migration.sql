-- قنوات الدعم: بيانٌ يعدّله المشغّل بلا نشر
ALTER TABLE "PlatformSetting" ADD COLUMN "supportWhatsapp" TEXT;
ALTER TABLE "PlatformSetting" ADD COLUMN "supportPhone"    TEXT;
ALTER TABLE "PlatformSetting" ADD COLUMN "supportEmail"    TEXT;

-- قيمٌ أوّلية للتجربة — تُعدَّل من الأدمن
UPDATE "PlatformSetting"
SET "supportWhatsapp" = '+966500000000',
    "supportEmail"    = 'support@carsell.one'
WHERE "id" = 'default';

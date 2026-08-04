-- النقض: أعمدة عرضٍ لا تمسّ مالًا ولا معاملة
ALTER TABLE "PlatformSetting" DROP COLUMN IF EXISTS "supportEmail";
ALTER TABLE "PlatformSetting" DROP COLUMN IF EXISTS "supportPhone";
ALTER TABLE "PlatformSetting" DROP COLUMN IF EXISTS "supportWhatsapp";

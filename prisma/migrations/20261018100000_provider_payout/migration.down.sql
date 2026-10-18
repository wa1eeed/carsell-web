DROP TABLE IF EXISTS "ProviderPayout";
ALTER TABLE "ServiceProvider" DROP COLUMN IF EXISTS "iban";
-- وقيمةُ التعداد تبقى: بوستجرس لا يحذف قيمةً من تعدادٍ قائم.

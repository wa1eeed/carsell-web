-- نقضٌ يُفقد لقطةَ الضريبة؛ والحسابان يبقيان في التعداد (PostgreSQL لا
-- يحذف قيمة تعدادٍ بأمان متى كُتبت في صفّ).
ALTER TABLE "ServiceRequest" DROP COLUMN "vatAmount";

-- نقضُ المدينة واسم المصرف وكلمة المرور.
--
-- وحذفُ `passwordHash` يُسقط كلَّ كلمةٍ وُضعت — فمن سجّل بها يعود إلى
-- الرمز لمرّة واحدة. ولا يضيع حساب: الرمز بابٌ قائمٌ للجميع.
ALTER TABLE "User" DROP COLUMN IF EXISTS "passwordHash";
ALTER TABLE "User" DROP COLUMN IF EXISTS "bankName";
ALTER TABLE "User" DROP COLUMN IF EXISTS "city";

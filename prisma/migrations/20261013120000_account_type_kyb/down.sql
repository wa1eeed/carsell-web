-- نقضُ نوع الحساب وحقول المنشأة.
--
-- والحذف يُسقط تصنيفَ من وثّق منشأةً — فيعود حسابُه فردًا موثَّقًا
-- برقم سجلٍّ لا يُقرأ. فالنقض يُشغَّل قبل أن يُوثَّق أوّل منشأة، أو
-- بعد تصدير الصفوف المعنيّة.
ALTER TABLE "User" DROP COLUMN IF EXISTS "crExpiresAt";
ALTER TABLE "User" DROP COLUMN IF EXISTS "crNumber";
ALTER TABLE "User" DROP COLUMN IF EXISTS "businessName";
ALTER TABLE "User" DROP COLUMN IF EXISTS "accountType";
DROP TYPE IF EXISTS "AccountType";

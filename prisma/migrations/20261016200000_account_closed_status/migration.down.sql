-- ولا تُنقض قيمةُ تعدادٍ في PostgreSQL إلّا بإعادة بناء النوع كلِّه،
-- وهو أخطر من بقائها. فيُنقض العمود وحده، وتبقى القيمة غير مستعملة.
ALTER TABLE "User" DROP COLUMN IF EXISTS "closedAt";

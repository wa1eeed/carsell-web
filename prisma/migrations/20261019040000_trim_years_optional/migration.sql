-- سنواتُ الفئة وصفٌ لا قيد — أختُ `20261019020000_model_years_optional`.
-- فئةٌ «قياسية» تصف الطراز كلَّه، وسنةٌ تُكتب لها تدّعي حدًّا لا وجود له.
ALTER TABLE "Trim" ALTER COLUMN "yearFrom" DROP NOT NULL;

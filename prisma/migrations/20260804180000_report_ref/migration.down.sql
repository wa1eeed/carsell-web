-- النقض: المرجع مشتقٌّ من ترتيب الإنشاء ويُعاد بناؤه، ولا يحمل بيانًا
-- لا يحمله الصفّ. والمعرّف الداخليّ يبقى مفتاحًا، فلا تُفقد علاقة.

DROP INDEX IF EXISTS "Report_ref_key";
ALTER TABLE "Report" DROP COLUMN IF EXISTS "ref";

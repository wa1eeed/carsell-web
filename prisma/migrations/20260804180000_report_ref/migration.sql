-- ═══ مرجعٌ للبلاغ ═══
--
-- التصميم (A17) يعرض `RPT-2026-0188`، والجدول بلا مرجع: المعرّف
-- الداخليّ cuid لا يُقتبَس في مكالمة ولا يُقرأ في شاشة.
--
-- والصفوف القائمة تأخذ مراجع بترتيب إنشائها — فلا يبقى صفٌّ بلا مرجع
-- ولا ينكسر القيد الفريد.

ALTER TABLE "Report" ADD COLUMN "ref" TEXT;

WITH numbered AS (
  SELECT "id", ROW_NUMBER() OVER (ORDER BY "createdAt", "id") AS seq
  FROM "Report"
)
UPDATE "Report" r
SET "ref" = 'RPT-' || TO_CHAR(r."createdAt", 'YYYY') || '-' || LPAD(n.seq::text, 4, '0')
FROM numbered n
WHERE r."id" = n."id";

ALTER TABLE "Report" ALTER COLUMN "ref" SET NOT NULL;
CREATE UNIQUE INDEX "Report_ref_key" ON "Report" ("ref");

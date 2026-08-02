-- رقم التقرير: يُقتبَس ويُبحث به، و`cuid` لا يُملى في مكالمة هاتف.
-- الجدول غير فارغ، فالعمود يُضاف قابلًا للفراغ ثم يُملأ ثم يُقيَّد —
-- إضافةُ عمود إلزامي مباشرةً تُسقط الترحيل.
ALTER TABLE "InspectionReport" ADD COLUMN IF NOT EXISTS "ref" TEXT;

-- دالة النافذة ممنوعة في UPDATE مباشرةً، فتُحسب في CTE ويُوصَل بها
WITH numbered AS (
  SELECT "id",
         'INS-' || to_char("inspectedAt", 'YYYY') || '-' ||
         lpad(CAST(row_number() OVER (ORDER BY "inspectedAt", "id") AS text), 5, '0') AS new_ref
  FROM "InspectionReport"
)
UPDATE "InspectionReport" r SET "ref" = n.new_ref FROM numbered n WHERE r."id" = n."id";

ALTER TABLE "InspectionReport" ALTER COLUMN "ref" SET NOT NULL;
CREATE UNIQUE INDEX "InspectionReport_ref_key" ON "InspectionReport"("ref");

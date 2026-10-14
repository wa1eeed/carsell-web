-- متى صار تقريرُ الفحص عامًّا على الإعلان (قرار المالك ٤).
-- و`NULL` تعني خاصًّا بدافعه — وتقريرُ البائع يُنشر لحظةَ صدوره.
ALTER TABLE "InspectionReport" ADD COLUMN "publishedAt" TIMESTAMP(3);

-- ═══ والقائم يُنشر بشرطه لا جملةً ═══
--
-- ما طلبه **مالكُ المركبة** عامٌّ كما كان؛ وما طلبه غيرُه يبقى خاصًّا.
-- ونشرُ الكلّ يُسرّب تقارير اشتراها مشترون، ونشرُ لا شيء يُخفي تقارير
-- بائعين كانت معروضةً — فالشرط هو الذي يحفظ الحالَين.
UPDATE "InspectionReport" r
SET "publishedAt" = r."inspectedAt"
FROM "ServiceRequest" s, "Vehicle" v
WHERE s.id = r."serviceRequestId"
  AND v.id = r."vehicleId"
  AND s."userId" = v."ownerId";

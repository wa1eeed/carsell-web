-- ═══ مميّزاتُ المركبة، وموضعُ ظهورها في استمارة البائع ═══
--
-- `ListingFeature` كان بلا كاتبٍ في المنتج: ٦٠ إعلانًا من ٦٢ تحمل
-- مميّزات، والستّون كلُّها مزروعة. والاستمارةُ لم تسأل البائع قطّ.
CREATE TABLE "VehicleFeature" (
  "vehicleId"  TEXT NOT NULL,
  "featureKey" TEXT NOT NULL,
  CONSTRAINT "VehicleFeature_pkey" PRIMARY KEY ("vehicleId", "featureKey")
);

ALTER TABLE "VehicleFeature"
  ADD CONSTRAINT "VehicleFeature_vehicleId_fkey"
  FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "VehicleFeature"
  ADD CONSTRAINT "VehicleFeature_featureKey_fkey"
  FOREIGN KEY ("featureKey") REFERENCES "Feature"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- والمركباتُ القائمة ترث مميّزات إعلاناتها، فلا يفقد بائعٌ ما سبق أن قيل عن سيارته.
INSERT INTO "VehicleFeature" ("vehicleId", "featureKey")
SELECT DISTINCT l."vehicleId", lf."featureKey"
FROM "ListingFeature" lf
JOIN "Listing" l ON l."id" = lf."listingId"
ON CONFLICT DO NOTHING;

-- ═══ وموضعُ ظهورٍ خامس: استمارةُ البائع ═══
--
-- المواضع الأربعة كلُّها للمشغّل أو للقارئ — ولا موضع يقول «اسأل
-- البائع عن هذه». فالقرارُ يُتَّخذ مرّةً في الكتالوج (قرار المالك
-- ٢٠٢٦-١٠-١٨: «في الكتالوج مرّة · والفئة تُرجّح») لا في ٣٦٠ فئة.
UPDATE "Feature"
SET "placements" = array_append("placements", 'sell_form')
WHERE NOT ('sell_form' = ANY("placements"));

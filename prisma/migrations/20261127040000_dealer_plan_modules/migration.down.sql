-- ═══ نقضُ منحِ الموديولز ═══
--
-- يُعيد الحال إلى ما كان: اشتراكاتٌ أنشأها هذا الترحيل تُحذف، ومنحُ
-- المفاتيح الستّة يُحذف، والعمودُ يسقط. ولا يلمس اشتراكًا أنشأه
-- المشغّل بيده بعده — فحدُّه الزمنيّ هو حدُّ الترحيل.
DELETE FROM "Subscription"
WHERE "dealerId" IS NOT NULL
  AND "startsAt" < TIMESTAMP '2026-11-28 00:00:00';

DELETE FROM "PlanEntitlement" WHERE "entitlementKey" LIKE 'dealer\_%';

ALTER TABLE "Plan" DROP COLUMN "audience";

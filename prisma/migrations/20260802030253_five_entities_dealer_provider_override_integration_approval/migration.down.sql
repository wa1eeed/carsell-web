-- نقض: الكيانات الخمسة.
--
-- **يمسّ المال**: `ApprovalRequest` يحمل موافقات الإفراج عن الضمان (قاعدة ١٢
-- في القسم ٧)، و`Subscription` يحمل اشتراكات المعارض.
--
-- الترتيب: المفاتيح الخارجية أوّلًا ثم الجداول — وإلا رُفض الحذف.
-- ونقض هذا الترحيل **يفقد** كل طلب موافقة قائم: صفقةٌ تنتظر موافقة عضوين
-- تعود إلى لا شيء. تحقّق من عدم وجود موافقات معلّقة قبل التنفيذ:
--
--   SELECT count(*) FROM "ApprovalRequest" WHERE "status" = 'PENDING';

ALTER TABLE IF EXISTS "Escrow" DROP CONSTRAINT IF EXISTS "Escrow_releaseApprovalId_fkey";

DROP TABLE IF EXISTS "ApprovalRequest";
DROP TABLE IF EXISTS "EntitlementOverride";
DROP TABLE IF EXISTS "Integration";
DROP TABLE IF EXISTS "ServiceProvider";
DROP TABLE IF EXISTS "Dealer";

DROP TYPE IF EXISTS "ApprovalStatus";
DROP TYPE IF EXISTS "IntegrationCategory";
DROP TYPE IF EXISTS "IntegrationStatus";
DROP TYPE IF EXISTS "ProviderType";
DROP TYPE IF EXISTS "DealerStatus";

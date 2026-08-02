-- نقض ترحيل الحملات وإشعارات الدفع.
-- الحذف بترتيب معكوس للاعتماديات، والأعمدة المضافة تُسقَط أخيرًا.

DROP TABLE IF EXISTS "DeviceToken";
DROP TABLE IF EXISTS "NotificationPreference";
DROP TABLE IF EXISTS "PushChannel";
DROP TABLE IF EXISTS "CampaignSend";
DROP TABLE IF EXISTS "Campaign";
DROP TABLE IF EXISTS "Segment";
DROP TYPE IF EXISTS "CampaignStatus";

ALTER TABLE "User"
  DROP COLUMN IF EXISTS "marketingConsentAt",
  DROP COLUMN IF EXISTS "marketingConsent";

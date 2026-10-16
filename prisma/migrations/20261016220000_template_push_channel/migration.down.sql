ALTER TABLE "NotificationTemplate"
  DROP CONSTRAINT IF EXISTS "NotificationTemplate_pushChannelKey_fkey";
ALTER TABLE "NotificationTemplate" DROP COLUMN IF EXISTS "pushChannelKey";

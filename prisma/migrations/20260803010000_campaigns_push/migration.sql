-- A9 وA10: الحملات والشرائح وإشعارات الدفع (المهمة ٢٦)
-- كل الأعمدة الجديدة لها قيَم افتراضية — فالجداول غير الفارغة تمرّ بلا توقّف.

ALTER TABLE "User"
  ADD COLUMN "marketingConsent" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "marketingConsentAt" TIMESTAMP(3);

CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'RUNNING', 'SENT', 'CANCELLED');

CREATE TABLE "Segment" (
  "id"        TEXT NOT NULL,
  "key"       TEXT NOT NULL,
  "nameAr"    TEXT NOT NULL,
  "rules"     JSONB NOT NULL,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Segment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Segment_key_key" ON "Segment"("key");

CREATE TABLE "Campaign" (
  "id"          TEXT NOT NULL,
  "nameAr"      TEXT NOT NULL,
  "channels"    TEXT[],
  "segmentId"   TEXT NOT NULL,
  "subjectAr"   TEXT,
  "bodyAr"      TEXT,
  "status"      "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
  "scheduledAt" TIMESTAMP(3),
  "sentAt"      TIMESTAMP(3),
  "createdBy"   TEXT NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Campaign_status_scheduledAt_idx" ON "Campaign"("status", "scheduledAt");
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_segmentId_fkey"
  FOREIGN KEY ("segmentId") REFERENCES "Segment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "CampaignSend" (
  "id"          TEXT NOT NULL,
  "campaignId"  TEXT NOT NULL,
  "userId"      TEXT NOT NULL,
  "channel"     TEXT NOT NULL,
  "sentAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "openedAt"    TIMESTAMP(3),
  "clickedAt"   TIMESTAMP(3),
  "convertedAt" TIMESTAMP(3),
  CONSTRAINT "CampaignSend_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CampaignSend_campaignId_userId_channel_key"
  ON "CampaignSend"("campaignId", "userId", "channel");
CREATE INDEX "CampaignSend_userId_sentAt_idx" ON "CampaignSend"("userId", "sentAt");
ALTER TABLE "CampaignSend" ADD CONSTRAINT "CampaignSend_campaignId_fkey"
  FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CampaignSend" ADD CONSTRAINT "CampaignSend_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "PushChannel" (
  "key"              TEXT NOT NULL,
  "nameAr"           TEXT NOT NULL,
  "userControllable" BOOLEAN NOT NULL DEFAULT true,
  "defaultOn"        BOOLEAN NOT NULL DEFAULT true,
  "sort"             INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "PushChannel_pkey" PRIMARY KEY ("key")
);

CREATE TABLE "NotificationPreference" (
  "userId"     TEXT NOT NULL,
  "channelKey" TEXT NOT NULL,
  "enabled"    BOOLEAN NOT NULL DEFAULT true,
  "updatedAt"  TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("userId", "channelKey")
);
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_channelKey_fkey"
  FOREIGN KEY ("channelKey") REFERENCES "PushChannel"("key") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "DeviceToken" (
  "id"         TEXT NOT NULL,
  "userId"     TEXT NOT NULL,
  "token"      TEXT NOT NULL,
  "platform"   TEXT NOT NULL,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DeviceToken_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DeviceToken_token_key" ON "DeviceToken"("token");
CREATE INDEX "DeviceToken_userId_idx" ON "DeviceToken"("userId");
ALTER TABLE "DeviceToken" ADD CONSTRAINT "DeviceToken_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

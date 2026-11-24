-- حالُ الحملة: نصٌّ حرّ صار تعدادًا.
--
-- أربعُ مفرداتٍ تباعدت لحقلٍ واحد: البذرة «active»، والمنتج «live»،
-- ولوحةُ المالية ترشّح «running» فتقرأ صفرًا أبدًا. والتطبيع أوّلًا
-- ثمّ التحويل — وإلّا سقط ALTER على قيمةٍ لا مقابل لها.

CREATE TYPE "AdCampaignStatus" AS ENUM ('SCHEDULED', 'LIVE', 'PAUSED', 'ENDED');

-- التطبيع: كلُّ ما كُتب سابقًا إلى مفردته الواحدة
UPDATE "AdCampaign" SET "status" = 'live'      WHERE lower("status") IN ('live', 'active', 'running');
UPDATE "AdCampaign" SET "status" = 'scheduled' WHERE lower("status") IN ('scheduled', 'pending');
UPDATE "AdCampaign" SET "status" = 'paused'    WHERE lower("status") IN ('paused', 'stopped');
UPDATE "AdCampaign" SET "status" = 'ended'     WHERE lower("status") IN ('ended', 'finished', 'expired');

-- وما لا يُعرف يُنسب إلى نافذته لا يُحذف: صفٌّ بحالٍ مجهولة أولى به
-- أن يُقرأ من تاريخيه من أن يختفي.
UPDATE "AdCampaign"
SET "status" = CASE
  WHEN "endsAt"   < NOW() THEN 'ended'
  WHEN "startsAt" > NOW() THEN 'scheduled'
  ELSE 'live'
END
WHERE "status" NOT IN ('live', 'scheduled', 'paused', 'ended');

ALTER TABLE "AdCampaign"
  ALTER COLUMN "status" DROP DEFAULT,
  ALTER COLUMN "status" TYPE "AdCampaignStatus" USING upper("status")::"AdCampaignStatus",
  ALTER COLUMN "status" SET DEFAULT 'SCHEDULED';

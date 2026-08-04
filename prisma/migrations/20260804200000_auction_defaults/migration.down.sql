-- النقض: الأعمدة افتراضيّاتٌ للمزادات **الجديدة**، وكل مزادٍ قائم
-- يحمل لقطته في صفّه (`bidIncrement` · `depositAmount` · `reservePrice`).
-- فحذفها لا يمسّ مزادًا جاريًا ولا مالًا محجوزًا — تعود القيَم ثوابت.

ALTER TABLE "PlatformSetting"
  DROP COLUMN IF EXISTS "auctionMaxExtensions",
  DROP COLUMN IF EXISTS "auctionDefaultDeposit",
  DROP COLUMN IF EXISTS "auctionMinIncrement",
  DROP COLUMN IF EXISTS "auctionWinnerPaymentHours",
  DROP COLUMN IF EXISTS "auctionHideReserve",
  DROP COLUMN IF EXISTS "auctionBuyNowBeforeReserve",
  DROP COLUMN IF EXISTS "auctionDurationsDays";

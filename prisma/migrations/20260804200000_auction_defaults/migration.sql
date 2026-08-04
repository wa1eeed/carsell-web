-- ═══ افتراضيّات المزاد (A32) ═══
--
-- **تُنسَخ لقطةً في كل مزاد وقت إنشائه** — فمزايدٌ بدأ على قاعدة لا
-- تتغيّر عليه القاعدة في منتصف المزاد. والتعديل يسري على الجديد وحده.
--
-- والقيَم الافتراضية هي ما كان مكتوبًا في التصميم، فلا يتغيّر سلوك
-- مزادٍ قائم بهذا الترحيل.

ALTER TABLE "PlatformSetting"
  ADD COLUMN "auctionMaxExtensions"       INTEGER NOT NULL DEFAULT 6,
  ADD COLUMN "auctionDefaultDeposit"      DECIMAL(10, 2) NOT NULL DEFAULT 5000,
  ADD COLUMN "auctionMinIncrement"        DECIMAL(10, 2) NOT NULL DEFAULT 500,
  ADD COLUMN "auctionWinnerPaymentHours"  INTEGER NOT NULL DEFAULT 48,
  ADD COLUMN "auctionHideReserve"         BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "auctionBuyNowBeforeReserve" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "auctionDurationsDays"       INTEGER[] NOT NULL DEFAULT ARRAY[1, 3, 7];

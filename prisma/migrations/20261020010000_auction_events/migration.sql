-- ═══ أحداثُ المزاد — والتمديد كان يقع ولا يُسجَّل ═══
--
-- `extendedCount` يَعُدّ التمديدات ولا يقول متى ولا بكم، فيقرأ الزائرُ
-- في السجلّ مزايدةً عند ٢١:٥٩ وإغلاقًا عند ٢٢:٠٥ ولا شيء يفسّر الفارق.
-- **والعدُّ ليس سجلًّا**: التصميم يرسم سطرًا بين المزايدات يقول «مُدّد
-- وقت الإغلاق ٥ دقائق»، ولا بيانات تحته.
--
-- ولا قيمةَ تعدادٍ بلا كاتب: الإلغاء قاعدةُ عملٍ لم تُقرَّر (من يملكه
-- وبأيّ سبب)، فلا تُعرَّف قيمتُه قبل أن تُقرَّر.

CREATE TYPE "AuctionEventKind" AS ENUM ('EXTENDED');

CREATE TABLE "AuctionEvent" (
    "id"        TEXT NOT NULL,
    "auctionId" TEXT NOT NULL,
    "kind"      "AuctionEventKind" NOT NULL,
    "seconds"   INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuctionEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AuctionEvent_auctionId_createdAt_idx" ON "AuctionEvent"("auctionId", "createdAt");

ALTER TABLE "AuctionEvent"
  ADD CONSTRAINT "AuctionEvent_auctionId_fkey"
  FOREIGN KEY ("auctionId") REFERENCES "Auction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

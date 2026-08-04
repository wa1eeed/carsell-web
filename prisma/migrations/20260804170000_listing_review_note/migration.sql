-- ═══ أثر قرار مراجعة الإعلان ═══
--
-- `reviewReason` وحده يقول **لماذا دخل** الطابور، ولا يقول **ماذا وقع
-- فيه**. فالإعلان المرجَع يعود مسودّةً بلا سببٍ مكتوب، ويجد البائع
-- عمله مردودًا ولا يعرف ماذا يُصلح — فيعيد نشره كما هو فيعود.

ALTER TABLE "Listing"
  ADD COLUMN "reviewQueuedAt" TIMESTAMP(3),
  ADD COLUMN "reviewNote" TEXT,
  ADD COLUMN "reviewedAt" TIMESTAMP(3),
  ADD COLUMN "reviewedBy" TEXT;

-- الصفوف القائمة في الطابور: لحظةُ الترحيل تقديرٌ أدقّ من فراغ
UPDATE "Listing" SET "reviewQueuedAt" = NOW() WHERE "status" = 'PENDING_REVIEW';

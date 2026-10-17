-- ═══ قيدُ المزوّد يحمل اسمه ═══
--
-- `PROVIDER_PAYABLE` كان يُقيَّد بلا صاحب: نعرف كم علينا للمزوّدين
-- مجموعين ولا نعرف لمن — فلا كشفَ حساب ولا رصيدَ لواحدٍ منهم.
-- و`userId` لا يصلح: موصوفٌ بأنه «البائع أو المشتري»، ووسمُ المزوّد
-- به يجعل جمعَ «ما على العميل» يعدّ دَينَ المزوّد معه.
ALTER TABLE "LedgerEntry" ADD COLUMN "providerId" TEXT;

CREATE INDEX "LedgerEntry_providerId_createdAt_idx"
  ON "LedgerEntry" ("providerId", "createdAt");

-- والقيودُ القائمة تُنسب بأثرٍ رجعيّ: مرجعُ الطلب مكتوبٌ في `note`،
-- وبه يُعرف المزوّد. وما لا يُعرف يبقى `NULL` ولا يُخمَّن.
UPDATE "LedgerEntry" AS le
SET "providerId" = sr."providerId"
FROM "ServiceRequest" AS sr
WHERE le."account" = 'PROVIDER_PAYABLE'
  AND le."providerId" IS NULL
  AND sr."ref" = le."note"
  AND sr."providerId" IS NOT NULL;

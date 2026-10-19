-- ═══ الويبهوك: ما وصل، وما ترتّب عليه ═══
--
-- الجدولُ يُكتب منذ بُني ولا يقرؤه شيء (البوابة ٦٤). وقياسُ المسار
-- أخرج ثلاثًا أسوأ من غياب الشاشة:
--   ١. `signatureOk` لا يساوي `false` أبدًا — المرفوضُ يُردّ ٤٠١ **قبل**
--      التخزين، فالعمودُ الذي وُضع لتسجيل الرفض لم يسجّل رفضًا قطّ.
--   ٢. نتيجةُ `applyState` تُهمَل — فويبهوكٌ متأخّر يُرفض انتقالُه
--      ويُكتب الصفُّ «معالَجًا» ولا أثرَ للرفض في مكان.
--   ٣. لا رابطَ إلى الدفعة — المرجعُ داخل JSON، فالسؤالُ «ماذا قالت
--      البوّابة عن هذه الدفعة؟» لم تكن القاعدة تجيبه.

-- و`RECEIVED` ليست زينة: الصفُّ يُكتب **قبل** المعالجة (حارس التكرار)،
-- فصفٌّ يبقى عليها يقول إنّنا متنا في منتصفها — أثرٌ لا يُرى بغير تسجيله.
CREATE TYPE "WebhookOutcome" AS ENUM ('RECEIVED', 'APPLIED', 'UNMAPPED', 'REFUSED', 'BAD_SIGNATURE');

ALTER TABLE "WebhookEvent"
  ADD COLUMN "paymentId" TEXT,
  ADD COLUMN "outcome" "WebhookOutcome" NOT NULL DEFAULT 'RECEIVED',
  ADD COLUMN "appliedStatus" "PaymentStatus",
  ADD COLUMN "note" TEXT,
  ADD COLUMN "repeats" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "WebhookEvent"
  ADD CONSTRAINT "WebhookEvent_paymentId_fkey"
  FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "WebhookEvent_paymentId_receivedAt_idx" ON "WebhookEvent"("paymentId", "receivedAt");
CREATE INDEX "WebhookEvent_outcome_receivedAt_idx" ON "WebhookEvent"("outcome", "receivedAt");

-- والقديمُ يُربط بما في حمولته — فصفٌّ قديم لا يبقى بلا دفعة لمجرّد
-- أنّ العمود وُلد بعده. والمرجعُ هو `data.id` كما يقرؤه المسار.
UPDATE "WebhookEvent" w
   SET "paymentId" = p."id"
  FROM "Payment" p
 WHERE p."holdRef" = w."payload" -> 'data' ->> 'id';

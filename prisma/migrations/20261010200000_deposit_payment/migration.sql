-- العربون يصير مالًا: صفّ `Deposit` يُربط بدفعته.
--
-- كان `holdDeposit` يكتب `HELD` ولا يمرّ ببوابة — فالمزايدة ليست
-- التزامًا، و`forfeitDeposit` تصادر رقمًا في جدولنا.
--
-- والعمود اختياريّ: العرابين القائمة بلا دفعة، وهي دفتريّة كما كانت،
-- ولا تُفتعل لها دفعةٌ بأثرٍ رجعيّ.
ALTER TABLE "Deposit" ADD COLUMN IF NOT EXISTS "paymentId" TEXT;

ALTER TABLE "Deposit"
  ADD CONSTRAINT "Deposit_paymentId_fkey"
  FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT;

CREATE UNIQUE INDEX IF NOT EXISTS "Deposit_paymentId_key" ON "Deposit"("paymentId");

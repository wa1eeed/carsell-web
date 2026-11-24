-- CreateEnum
CREATE TYPE "OrderCancelCategory" AS ENUM ('PAYMENT_TIMEOUT', 'NOT_AS_DESCRIBED', 'CHANGED_MIND', 'SELLER_DELAY', 'OTHER');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "cancelCategory" "OrderCancelCategory";


-- ═══ وما أُلغي قبل الحقل يُصنَّف بما يُعرف عنه ═══
--
-- `cancelReason` كان يحمل نوعين: مفتاحًا يكتبه النظام وكلامًا يكتبه
-- إنسان. فالمفتاحُ وحده يُصنَّف يقينًا، والباقي «أخرى» — ولا يُخمَّن
-- صنفٌ من نصٍّ حرّ.

UPDATE "Order" SET "cancelCategory" = 'PAYMENT_TIMEOUT'
WHERE "status" = 'CANCELLED' AND "cancelReason" = 'payment.timeout';

UPDATE "Order" SET "cancelCategory" = 'OTHER'
WHERE "status" = 'CANCELLED' AND "cancelCategory" IS NULL;

-- حقولُ إنجاز الطلب — صفٌّ لكل حقل، ومخطّطٌ لكل صنف في الشيفرة.
--
-- ستّةُ أصناف كانت تُنهي الطلب بلا حقلٍ واحد: ناقلٌ يضغط «أنهِ» فلا
-- نعلم رقم البوليصة، ومؤمِّنٌ ينتهي ولا رقمَ وثيقة.

-- AlterEnum
--
-- **ولا تُستعمل القيمةُ في هذا الترحيل**: بوستجرس يرفض استعمال قيمةِ
-- تعدادٍ جديدة في المعاملة التي أضافتها — فإسنادُها إلى الخدمة في
-- ترحيلٍ تاليه.
ALTER TYPE "ProviderType" ADD VALUE IF NOT EXISTS 'TRANSFER';

-- CreateTable
CREATE TABLE IF NOT EXISTS "ServiceCompletionField" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "valueText" TEXT,
    "valueNumber" DECIMAL(14,2),
    "valueDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceCompletionField_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ServiceCompletionField_requestId_key_key" ON "ServiceCompletionField"("requestId", "key");

-- AddForeignKey
ALTER TABLE "ServiceCompletionField" DROP CONSTRAINT IF EXISTS "ServiceCompletionField_requestId_fkey";
ALTER TABLE "ServiceCompletionField" ADD CONSTRAINT "ServiceCompletionField_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ServiceRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

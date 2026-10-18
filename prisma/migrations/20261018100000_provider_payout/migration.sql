-- ═══ صرفُ مستحقّات المزوّدين — ولم يكن له باب ═══
--
-- `PROVIDER_PAYABLE` يُقيَّد عند كل خدمةٍ تُنجَز **ولا شيء يخصمه**:
-- الفاحصُ يفحص ونُقيّد له دَينًا، ولا مسارَ في المنتج كلّه يُحوّل له
-- ريالًا. ورصيدُه في لوحته يقول «مستحقّ» وهو مجموعُ ما كسبه منذ بدأ —
-- لا ما بقي له.
--
-- وأوّلُ ما يلزم للصرف **أين يُحوَّل**: `ServiceProvider` بلا آيبان.

-- AlterEnum
ALTER TYPE "ApprovalKind" ADD VALUE IF NOT EXISTS 'PROVIDER_PAYOUT';

-- AlterTable
ALTER TABLE "ServiceProvider" ADD COLUMN     "iban" TEXT;

-- CreateTable
CREATE TABLE "ProviderPayout" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "status" "PayoutStatus" NOT NULL DEFAULT 'PENDING',
    "ibanLast4" TEXT,
    "bankRef" TEXT,
    "note" TEXT,
    "approvalRequestId" TEXT,
    "requestedBy" TEXT NOT NULL,
    "sentBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),

    CONSTRAINT "ProviderPayout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProviderPayout_approvalRequestId_key" ON "ProviderPayout"("approvalRequestId");

-- CreateIndex
CREATE INDEX "ProviderPayout_providerId_createdAt_idx" ON "ProviderPayout"("providerId", "createdAt");

-- CreateIndex
CREATE INDEX "ProviderPayout_status_createdAt_idx" ON "ProviderPayout"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "ProviderPayout" ADD CONSTRAINT "ProviderPayout_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "ServiceProvider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


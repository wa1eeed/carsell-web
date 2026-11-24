-- AlterTable
ALTER TABLE "LegalDocument" ADD COLUMN     "requiredAtSignup" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "LegalAcceptance" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "documentKey" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "context" TEXT NOT NULL DEFAULT 'signup',

    CONSTRAINT "LegalAcceptance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LegalAcceptance_documentKey_version_idx" ON "LegalAcceptance"("documentKey", "version");

-- CreateIndex
CREATE UNIQUE INDEX "LegalAcceptance_userId_documentKey_version_key" ON "LegalAcceptance"("userId", "documentKey", "version");

-- AddForeignKey
ALTER TABLE "LegalAcceptance" ADD CONSTRAINT "LegalAcceptance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegalAcceptance" ADD CONSTRAINT "LegalAcceptance_documentKey_fkey" FOREIGN KEY ("documentKey") REFERENCES "LegalDocument"("key") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ═══ وأيُّ مستندٍ يُشترط للتسجيل ═══
--
-- شاشةُ الدخول تطلب الموافقة على الشروط وسياسة الخصوصية، والباقي
-- يُقرأ ولا يُشترط. والعمود يقولها بدل أن تبقى في رأس من كتب الشاشة.

UPDATE "LegalDocument" SET "requiredAtSignup" = true WHERE "key" IN ('terms', 'privacy');

-- التحويل إلى البائع يصير صفًّا — و`recordSellerPayout` يصير له منادٍ.
--
-- كان دفتر البائع يعرض «حُوِّل إليك: ٠٫٠٠» إلى الأبد: `payout.sent`
-- معرَّفٌ في الدفتر، ودالّته مكتوبة ومختبَرة، **ولا شيء في المنتج
-- كلّه يناديها** — فرصيد `SELLER_PAYABLE` ينمو ولا يُصفَّر، والشاشة
-- تقول للبائع إن له مالًا جاهزًا ولا باب يُخرجه.
--
-- والصفّ يحمل ما لا يحمله القيد: مرجع الحوالة، ومن اعتمدها، وآخر
-- أربع من الآيبان. والمال نفسه يخرج بيد المالية من البنك — فهذا
-- سجلٌّ يُطابَق به كشفُ البنك، لا تكاملٌ يُحوِّل.
CREATE TYPE "PayoutStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'CANCELLED');

ALTER TYPE "ApprovalKind" ADD VALUE IF NOT EXISTS 'SELLER_PAYOUT';

CREATE TABLE "Payout" (
  "id"                TEXT NOT NULL,
  "sellerId"          TEXT NOT NULL,
  "amount"            DECIMAL(12,2) NOT NULL,
  "status"            "PayoutStatus" NOT NULL DEFAULT 'PENDING',
  "ibanLast4"         TEXT,
  "bankRef"           TEXT,
  "note"              TEXT,
  "approvalRequestId" TEXT,
  "requestedBy"       TEXT NOT NULL,
  "sentBy"            TEXT,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sentAt"            TIMESTAMP(3),
  "failedAt"          TIMESTAMP(3),

  CONSTRAINT "Payout_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Payout_approvalRequestId_key" ON "Payout"("approvalRequestId");
CREATE INDEX "Payout_sellerId_createdAt_idx" ON "Payout"("sellerId", "createdAt");
CREATE INDEX "Payout_status_createdAt_idx" ON "Payout"("status", "createdAt");

ALTER TABLE "Payout"
  ADD CONSTRAINT "Payout_sellerId_fkey"
  FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE RESTRICT;

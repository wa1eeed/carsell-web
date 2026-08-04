-- دفتر الأستاذ — قيدٌ مزدوج يُضاف ولا يُعدَّل
CREATE TYPE "LedgerAccount" AS ENUM (
  'ESCROW_AT_PROVIDER', 'BUYER_ADVANCE', 'SELLER_PAYABLE', 'PLATFORM_REVENUE',
  'VAT_PAYABLE', 'GATEWAY_FEES_CLEARING', 'GOVT_FEES_CLEARING', 'PLATFORM_CASH'
);
CREATE TYPE "LedgerDirection" AS ENUM ('DEBIT', 'CREDIT');

CREATE TABLE "LedgerEntry" (
    "id"        TEXT NOT NULL,
    "txnId"     TEXT NOT NULL,
    "account"   "LedgerAccount" NOT NULL,
    "direction" "LedgerDirection" NOT NULL,
    "amount"    DECIMAL(12,2) NOT NULL,
    "currency"  TEXT NOT NULL DEFAULT 'SAR',
    "event"     TEXT NOT NULL,
    "orderId"   TEXT,
    "paymentId" TEXT,
    "userId"    TEXT,
    "note"      TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LedgerEntry_txnId_idx"            ON "LedgerEntry"("txnId");
CREATE INDEX "LedgerEntry_account_createdAt_idx" ON "LedgerEntry"("account", "createdAt");
CREATE INDEX "LedgerEntry_userId_createdAt_idx"  ON "LedgerEntry"("userId", "createdAt");
CREATE INDEX "LedgerEntry_orderId_idx"           ON "LedgerEntry"("orderId");

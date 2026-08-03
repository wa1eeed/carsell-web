-- قرارات ٣٤·٣٥·٣٦ — توجيهٌ لكل غرض دفع، وحالات بلغة الضمان
-- Payment وPaymentEvent فارغان، فيُعاد بناؤهما لا يُرحَّلان.

DROP TABLE IF EXISTS "PaymentEvent";
DROP TABLE IF EXISTS "Payment";
DROP TYPE IF EXISTS "PaymentStatus";

CREATE TYPE "PaymentStatus" AS ENUM (
  'CREATED', 'REQUIRES_ACTION', 'PENDING', 'HELD', 'SETTLED',
  'PARTIALLY_SETTLED', 'CANCELLED', 'RETURNED', 'PARTIALLY_RETURNED', 'FAILED'
);

CREATE TYPE "PaymentPurpose" AS ENUM (
  'VEHICLE_ESCROW', 'AUCTION_DEPOSIT', 'WALLET_TOPUP',
  'SERVICE_PURCHASE', 'TRANSFER_FEE', 'SUBSCRIPTION'
);

CREATE TABLE "PaymentGateway" (
  "key"          TEXT NOT NULL,
  "nameAr"       TEXT NOT NULL,
  "nameEn"       TEXT NOT NULL,
  "capabilities" JSONB NOT NULL,
  "status"       "IntegrationStatus" NOT NULL DEFAULT 'INACTIVE',
  "sort"         INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "PaymentGateway_pkey" PRIMARY KEY ("key")
);

CREATE TABLE "PaymentRoute" (
  "purpose"     "PaymentPurpose" NOT NULL,
  "gatewayKey"  TEXT NOT NULL,
  "environment" "IntegrationEnv" NOT NULL DEFAULT 'TEST',
  "enabled"     BOOLEAN NOT NULL DEFAULT true,
  "updatedBy"   TEXT NOT NULL,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PaymentRoute_pkey" PRIMARY KEY ("purpose")
);
ALTER TABLE "PaymentRoute" ADD CONSTRAINT "PaymentRoute_gatewayKey_fkey"
  FOREIGN KEY ("gatewayKey") REFERENCES "PaymentGateway"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "PaymentRouteChange" (
  "id"              TEXT NOT NULL,
  "purpose"         "PaymentPurpose" NOT NULL,
  "fromGatewayKey"  TEXT,
  "toGatewayKey"    TEXT NOT NULL,
  "fromEnvironment" "IntegrationEnv",
  "toEnvironment"   "IntegrationEnv" NOT NULL,
  "reason"          TEXT NOT NULL,
  "at"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "approvalId"      TEXT,
  "requestedBy"     TEXT NOT NULL,
  "approvedBy"      TEXT[],
  CONSTRAINT "PaymentRouteChange_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PaymentRouteChange_purpose_at_idx" ON "PaymentRouteChange"("purpose", "at");
ALTER TABLE "PaymentRouteChange" ADD CONSTRAINT "PaymentRouteChange_toGatewayKey_fkey"
  FOREIGN KEY ("toGatewayKey") REFERENCES "PaymentGateway"("key") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentRouteChange" ADD CONSTRAINT "PaymentRouteChange_fromGatewayKey_fkey"
  FOREIGN KEY ("fromGatewayKey") REFERENCES "PaymentGateway"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "Payment" (
  "id"             TEXT NOT NULL,
  "orderId"        TEXT,
  "purpose"        "PaymentPurpose" NOT NULL,
  "gatewayKey"     TEXT NOT NULL,
  "environment"    "IntegrationEnv" NOT NULL DEFAULT 'TEST',
  "amount"         DECIMAL(12,2) NOT NULL,
  "currency"       TEXT NOT NULL DEFAULT 'SAR',
  "method"         TEXT NOT NULL,
  "status"         "PaymentStatus" NOT NULL DEFAULT 'CREATED',
  "holdRef"        TEXT,
  "settleRef"      TEXT,
  "actionUrl"      TEXT,
  "failureCode"    TEXT,
  "settledAmount"  DECIMAL(12,2),
  "returnedAmount" DECIMAL(12,2),
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "heldAt"         TIMESTAMP(3),
  "settledAt"      TIMESTAMP(3),
  "cancelledAt"    TIMESTAMP(3),
  "failedAt"       TIMESTAMP(3),
  CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Payment_orderId_createdAt_idx" ON "Payment"("orderId", "createdAt");
CREATE INDEX "Payment_status_createdAt_idx" ON "Payment"("status", "createdAt");
-- المطابقة تجمع بالبوابة واليوم — ولا تفترض بوابة واحدة لليوم (قرار ٣٦)
CREATE INDEX "Payment_gatewayKey_createdAt_idx" ON "Payment"("gatewayKey", "createdAt");
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "PaymentEvent" (
  "id"         TEXT NOT NULL,
  "paymentId"  TEXT NOT NULL,
  "type"       TEXT NOT NULL,
  "fromStatus" "PaymentStatus",
  "toStatus"   "PaymentStatus" NOT NULL,
  "source"     TEXT NOT NULL,
  "detail"     JSONB,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PaymentEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PaymentEvent_paymentId_createdAt_idx" ON "PaymentEvent"("paymentId", "createdAt");
ALTER TABLE "PaymentEvent" ADD CONSTRAINT "PaymentEvent_paymentId_fkey"
  FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- المفردة واحدة في المخطّط والنطاق: «بوابة» لا «مزوّد»
ALTER TABLE "Escrow" RENAME COLUMN "providerRef" TO "gatewayRef";
ALTER TYPE "ApprovalKind" ADD VALUE IF NOT EXISTS 'PAYMENT_ROUTE';

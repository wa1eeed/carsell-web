-- الدفع الحقيقي و3DS ومفاتيح التكرار (المهمة ٢٧)

CREATE TYPE "PaymentStatus" AS ENUM
  ('CREATED', 'REQUIRES_3DS', 'AUTHORIZED', 'CAPTURED', 'FAILED', 'CANCELLED', 'REFUNDED');

CREATE TABLE "Payment" (
  "id"           TEXT NOT NULL,
  "orderId"      TEXT NOT NULL,
  "amount"       DECIMAL(12,2) NOT NULL,
  "currency"     TEXT NOT NULL DEFAULT 'SAR',
  "method"       TEXT NOT NULL,
  "status"       "PaymentStatus" NOT NULL DEFAULT 'CREATED',
  "providerRef"  TEXT,
  "threeDsUrl"   TEXT,
  "failureCode"  TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "authorizedAt" TIMESTAMP(3),
  "capturedAt"   TIMESTAMP(3),
  "failedAt"     TIMESTAMP(3),
  CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Payment_orderId_createdAt_idx" ON "Payment"("orderId", "createdAt");
CREATE INDEX "Payment_status_createdAt_idx" ON "Payment"("status", "createdAt");
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

CREATE TABLE "IdempotencyKey" (
  "key"       TEXT NOT NULL,
  "scope"     TEXT NOT NULL,
  "bodyHash"  TEXT NOT NULL,
  "response"  JSONB NOT NULL,
  "status"    INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IdempotencyKey_pkey" PRIMARY KEY ("key")
);
CREATE INDEX "IdempotencyKey_createdAt_idx" ON "IdempotencyKey"("createdAt");

CREATE TABLE "WebhookEvent" (
  "id"          TEXT NOT NULL,
  "provider"    TEXT NOT NULL,
  "type"        TEXT NOT NULL,
  "signatureOk" BOOLEAN NOT NULL,
  "processedAt" TIMESTAMP(3),
  "receivedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "payload"     JSONB NOT NULL,
  CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "WebhookEvent_provider_receivedAt_idx" ON "WebhookEvent"("provider", "receivedAt");

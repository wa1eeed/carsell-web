-- نقض توجيه الدفع.
ALTER TABLE "Escrow" RENAME COLUMN "gatewayRef" TO "providerRef";

DROP TABLE IF EXISTS "PaymentEvent";
DROP TABLE IF EXISTS "Payment";
DROP TABLE IF EXISTS "PaymentRouteChange";
DROP TABLE IF EXISTS "PaymentRoute";
DROP TABLE IF EXISTS "PaymentGateway";
DROP TYPE IF EXISTS "PaymentPurpose";
DROP TYPE IF EXISTS "PaymentStatus";

-- يُعاد الشكل السابق كي يبقى النقض قابلًا للتطبيق
CREATE TYPE "PaymentStatus" AS ENUM
  ('CREATED', 'REQUIRES_3DS', 'AUTHORIZED', 'CAPTURED', 'FAILED', 'CANCELLED', 'REFUNDED');
CREATE TABLE "Payment" (
  "id" TEXT NOT NULL, "orderId" TEXT NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL, "currency" TEXT NOT NULL DEFAULT 'SAR',
  "method" TEXT NOT NULL, "status" "PaymentStatus" NOT NULL DEFAULT 'CREATED',
  "providerRef" TEXT, "threeDsUrl" TEXT, "failureCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "authorizedAt" TIMESTAMP(3), "capturedAt" TIMESTAMP(3), "failedAt" TIMESTAMP(3),
  CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PaymentEvent" (
  "id" TEXT NOT NULL, "paymentId" TEXT NOT NULL, "type" TEXT NOT NULL,
  "fromStatus" "PaymentStatus", "toStatus" "PaymentStatus" NOT NULL,
  "source" TEXT NOT NULL, "detail" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PaymentEvent_pkey" PRIMARY KEY ("id")
);

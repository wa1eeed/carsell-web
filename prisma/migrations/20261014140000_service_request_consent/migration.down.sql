-- نقضٌ كامل عدا قيَم التعداد: PostgreSQL لا يحذف قيمة من ENUM، ووجودُ
-- قيمةٍ لا يكتبها أحد بلا أثر — بخلاف عمودٍ يحمل بيانات.
DROP INDEX "ServiceRequest_sellerId_status_idx";
ALTER TABLE "ServiceRequest" DROP CONSTRAINT "ServiceRequest_sellerId_fkey";
ALTER TABLE "ServiceRequest"
  DROP COLUMN "sellerId",
  DROP COLUMN "decisionDueAt",
  DROP COLUMN "decidedAt",
  DROP COLUMN "declineReason",
  DROP COLUMN "paymentId";
ALTER TABLE "Service" DROP COLUMN "providerType";

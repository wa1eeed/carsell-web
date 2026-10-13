-- رسم الخدمة: نسبةً أو مبلغًا ثابتًا (قرار المالك ٢٠٢٦-١٠-١٤)
CREATE TYPE "ServiceFeeMode" AS ENUM ('FIXED', 'PERCENT');

ALTER TABLE "Service"
  ADD COLUMN "adminFeeMode" "ServiceFeeMode" NOT NULL DEFAULT 'FIXED';

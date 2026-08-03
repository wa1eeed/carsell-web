-- ═══ المطابقة اليومية — دفترُنا مرآة ═══
--
-- و`UNAVAILABLE` حالٌ ثالثة لا تُختزل في «تطابقت»: بوابةٌ لم تُقرأ لم
-- تُطابَق، واختزالُها يجعل صمت المزوّد يبدو سلامةً.

CREATE TYPE "ReconciliationStatus" AS ENUM ('MATCHED', 'DIFFERS', 'UNAVAILABLE');

CREATE TABLE "ReconciliationRun" (
  "id"           TEXT NOT NULL,
  "gatewayKey"   TEXT NOT NULL,
  "date"         DATE NOT NULL,
  "ourTotal"     DECIMAL(14,2) NOT NULL,
  "gatewayTotal" DECIMAL(14,2),
  "diff"         DECIMAL(14,2) NOT NULL DEFAULT 0,
  "status"       "ReconciliationStatus" NOT NULL,
  "mismatches"   JSONB NOT NULL DEFAULT '[]',
  "note"         TEXT,
  "ranAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReconciliationRun_pkey" PRIMARY KEY ("id")
);

-- تشغيلٌ واحد لكل (بوابة، يوم) — وإعادة التشغيل تُحدّث ولا تُكرّر
CREATE UNIQUE INDEX "ReconciliationRun_gatewayKey_date_key"
  ON "ReconciliationRun"("gatewayKey", "date");
CREATE INDEX "ReconciliationRun_status_date_idx"
  ON "ReconciliationRun"("status", "date");

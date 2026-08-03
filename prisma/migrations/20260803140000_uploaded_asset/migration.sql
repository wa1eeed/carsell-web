-- ═══ الصورة المرفوعة قبل إعلانها — والبصمة تبقى في الخادم ═══
--
-- لو عادت البصمة إلى المتصفّح ثم قُبلت منه عند النشر لصار كشف التكرار
-- حارسًا يُطفئه من يريد تجاوزه.

CREATE TABLE "UploadedAsset" (
  "id"           TEXT NOT NULL,
  "r2Key"        TEXT NOT NULL,
  "ownerId"      TEXT NOT NULL,
  "phash"        TEXT NOT NULL,
  "plateBlurred" BOOLEAN NOT NULL DEFAULT false,
  "qualityFlags" TEXT[],
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UploadedAsset_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UploadedAsset_r2Key_key" ON "UploadedAsset"("r2Key");
CREATE INDEX "UploadedAsset_ownerId_createdAt_idx" ON "UploadedAsset"("ownerId", "createdAt");

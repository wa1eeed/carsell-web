-- CreateEnum
CREATE TYPE "LegalVersionStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'SUPERSEDED');

-- CreateTable
CREATE TABLE "LegalVersion" (
    "id" TEXT NOT NULL,
    "documentKey" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "titleAr" TEXT NOT NULL,
    "titleEn" TEXT NOT NULL,
    "summaryAr" TEXT,
    "summaryEn" TEXT,
    "sections" JSONB NOT NULL,
    "status" "LegalVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "material" BOOLEAN NOT NULL DEFAULT false,
    "effectiveAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "publishedBy" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LegalVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LegalVersion_documentKey_status_idx" ON "LegalVersion"("documentKey", "status");

-- CreateIndex
CREATE INDEX "LegalVersion_status_effectiveAt_idx" ON "LegalVersion"("status", "effectiveAt");

-- CreateIndex
CREATE UNIQUE INDEX "LegalVersion_documentKey_version_key" ON "LegalVersion"("documentKey", "version");

-- AddForeignKey
ALTER TABLE "LegalVersion" ADD CONSTRAINT "LegalVersion_documentKey_fkey" FOREIGN KEY ("documentKey") REFERENCES "LegalDocument"("key") ON DELETE CASCADE ON UPDATE CASCADE;


-- ═══ والأرشيفُ يبدأ ممّا في القاعدة الآن ═══
--
-- ثمانيةُ مستنداتٍ قائمة بنصوصها ونسخها، ولا صفَّ تاريخٍ لواحدٍ منها.
-- فشاشةُ «سجل النسخ» تُفتح على فراغٍ وتقول إنّ المنصّة لم تنشر شيئًا —
-- وهي نشرت ثمانية. فيُكتب لكلٍّ صفُّ نسخته السارية.
--
-- و"publishedBy" يبقى فارغًا: لا نعرف من نشرها، وكتابةُ اسمٍ فيها
-- اختلاقُ سجلّ. والفارغُ يُعرض «مع المنصّة».
INSERT INTO "LegalVersion" (
  "id", "documentKey", "version", "titleAr", "titleEn",
  "summaryAr", "summaryEn", "sections", "status", "material",
  "effectiveAt", "publishedAt", "createdAt", "updatedAt"
)
SELECT
  md5("key" || ':' || "version"),
  "key", "version", "titleAr", "titleEn",
  "summaryAr", "summaryEn", "sections",
  -- مستندٌ غير منشور نصُّه مسوّدةٌ لا نسخةٌ حلّت محلَّها أخرى
  CASE WHEN "active" THEN 'PUBLISHED'::"LegalVersionStatus"
       ELSE 'DRAFT'::"LegalVersionStatus" END,
  false,
  "effectiveAt",
  CASE WHEN "active" THEN "effectiveAt" ELSE NULL END,
  "effectiveAt", "updatedAt"
FROM "LegalDocument"
ON CONFLICT ("documentKey", "version") DO NOTHING;

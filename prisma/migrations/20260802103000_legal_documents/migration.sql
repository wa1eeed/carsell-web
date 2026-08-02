-- المستندات القانونية. جدول جديد فارغ، فلا حاجة لخطوة تعبئة.
CREATE TABLE "LegalDocument" (
    "key" TEXT NOT NULL,
    "titleAr" TEXT NOT NULL,
    "titleEn" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "summaryAr" TEXT,
    "summaryEn" TEXT,
    "sections" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LegalDocument_pkey" PRIMARY KEY ("key")
);

CREATE INDEX "LegalDocument_active_sort_idx" ON "LegalDocument"("active", "sort");

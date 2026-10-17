-- ═══ قالبُ الفحص ومسودّته ═══
--
-- **ولا يُولَّد هذا الملفّ من القاعدة الحيّة.** `migrate diff
-- --from-config-datasource` يقارن المخطّطَ بما في القاعدة الآن، فيجرف
-- كلَّ انحرافٍ سابقٍ فيها إلى ترحيلك: أسقط مفتاحين أجنبيّين وفهرسين
-- وافتراضيَّي عمود، **فسقط اختبارٌ لا علاقة له بما كتبتُ**. والصواب
-- `--from-migrations` — يقارن بتاريخ الترحيلات لا بحال القاعدة.
-- CreateEnum
CREATE TYPE "InspectionInputType" AS ENUM ('STATUS', 'NUMBER', 'TEXT', 'SELECT');

-- CreateEnum
CREATE TYPE "InspectionDraftStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'RETURNED', 'APPROVED');

-- CreateEnum
CREATE TYPE "InspectionResultState" AS ENUM ('PASS', 'MINOR', 'MAJOR', 'NOT_APPLICABLE');

-- CreateTable
CREATE TABLE "InspectionTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InspectionTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InspectionCategory" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "icon" TEXT,
    "weight" INTEGER NOT NULL DEFAULT 1,
    "sort" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "InspectionCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InspectionItem" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "inputType" "InspectionInputType" NOT NULL DEFAULT 'STATUS',
    "options" JSONB,
    "unit" TEXT,
    "isCritical" BOOLEAN NOT NULL DEFAULT false,
    "sort" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "InspectionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InspectionDraft" (
    "id" TEXT NOT NULL,
    "serviceRequestId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "providerUserId" TEXT,
    "status" "InspectionDraftStatus" NOT NULL DEFAULT 'DRAFT',
    "odometerKm" INTEGER,
    "summaryAr" TEXT,
    "returnNote" TEXT,
    "submittedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InspectionDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InspectionDraftResult" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "state" "InspectionResultState" NOT NULL,
    "value" TEXT,
    "note" TEXT,

    CONSTRAINT "InspectionDraftResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InspectionDraftPanel" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "panel" TEXT NOT NULL,
    "condition" TEXT NOT NULL,
    "paintThicknessMicrons" INTEGER,
    "note" TEXT,

    CONSTRAINT "InspectionDraftPanel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InspectionDraftPhoto" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "itemId" TEXT,
    "r2Key" TEXT NOT NULL,
    "caption" TEXT,
    "sort" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "InspectionDraftPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InspectionTemplate_isActive_idx" ON "InspectionTemplate"("isActive");

-- CreateIndex
CREATE INDEX "InspectionCategory_templateId_sort_idx" ON "InspectionCategory"("templateId", "sort");

-- CreateIndex
CREATE UNIQUE INDEX "InspectionCategory_templateId_key_key" ON "InspectionCategory"("templateId", "key");

-- CreateIndex
CREATE INDEX "InspectionItem_categoryId_sort_idx" ON "InspectionItem"("categoryId", "sort");

-- CreateIndex
CREATE UNIQUE INDEX "InspectionItem_categoryId_key_key" ON "InspectionItem"("categoryId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "InspectionDraft_serviceRequestId_key" ON "InspectionDraft"("serviceRequestId");

-- CreateIndex
CREATE INDEX "InspectionDraft_providerId_status_idx" ON "InspectionDraft"("providerId", "status");

-- CreateIndex
CREATE INDEX "InspectionDraft_status_submittedAt_idx" ON "InspectionDraft"("status", "submittedAt");

-- CreateIndex
CREATE INDEX "InspectionDraftResult_draftId_idx" ON "InspectionDraftResult"("draftId");

-- CreateIndex
CREATE UNIQUE INDEX "InspectionDraftResult_draftId_itemId_key" ON "InspectionDraftResult"("draftId", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "InspectionDraftPanel_draftId_panel_key" ON "InspectionDraftPanel"("draftId", "panel");

-- CreateIndex
CREATE INDEX "InspectionDraftPhoto_draftId_sort_idx" ON "InspectionDraftPhoto"("draftId", "sort");

-- AddForeignKey
ALTER TABLE "InspectionCategory" ADD CONSTRAINT "InspectionCategory_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "InspectionTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionItem" ADD CONSTRAINT "InspectionItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "InspectionCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionDraft" ADD CONSTRAINT "InspectionDraft_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "InspectionTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionDraft" ADD CONSTRAINT "InspectionDraft_serviceRequestId_fkey" FOREIGN KEY ("serviceRequestId") REFERENCES "ServiceRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionDraftResult" ADD CONSTRAINT "InspectionDraftResult_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "InspectionDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionDraftResult" ADD CONSTRAINT "InspectionDraftResult_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InspectionItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionDraftPanel" ADD CONSTRAINT "InspectionDraftPanel_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "InspectionDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionDraftPhoto" ADD CONSTRAINT "InspectionDraftPhoto_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "InspectionDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

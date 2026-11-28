-- CreateEnum
CREATE TYPE "ServiceFieldPurpose" AS ENUM ('REQUEST', 'ACTION');

-- CreateEnum
CREATE TYPE "ServiceFieldKind" AS ENUM ('TEXT', 'LATIN', 'NUMBER', 'MONEY', 'DATE', 'SELECT', 'CHECKBOX', 'NOTE');

-- CreateTable
CREATE TABLE "ServiceTemplate" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceTemplateField" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "labelAr" TEXT NOT NULL,
    "kind" "ServiceFieldKind" NOT NULL,
    "purpose" "ServiceFieldPurpose" NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "maxLength" INTEGER,
    "hintAr" TEXT,
    "priceDelta" DECIMAL(10,2),

    CONSTRAINT "ServiceTemplateField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceTemplateOption" (
    "id" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "labelAr" TEXT NOT NULL,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "priceDelta" DECIMAL(10,2),

    CONSTRAINT "ServiceTemplateOption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ServiceTemplate_serviceId_key" ON "ServiceTemplate"("serviceId");

-- CreateIndex
CREATE INDEX "ServiceTemplateField_templateId_sort_idx" ON "ServiceTemplateField"("templateId", "sort");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceTemplateField_templateId_key_key" ON "ServiceTemplateField"("templateId", "key");

-- CreateIndex
CREATE INDEX "ServiceTemplateOption_fieldId_sort_idx" ON "ServiceTemplateOption"("fieldId", "sort");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceTemplateOption_fieldId_value_key" ON "ServiceTemplateOption"("fieldId", "value");

-- AddForeignKey
ALTER TABLE "ServiceTemplate" ADD CONSTRAINT "ServiceTemplate_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceTemplateField" ADD CONSTRAINT "ServiceTemplateField_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ServiceTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceTemplateOption" ADD CONSTRAINT "ServiceTemplateOption_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "ServiceTemplateField"("id") ON DELETE CASCADE ON UPDATE CASCADE;


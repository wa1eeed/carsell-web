-- AlterTable
ALTER TABLE "InspectionDraft" ADD COLUMN     "frozenFlagged" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "frozenGrade" TEXT,
ADD COLUMN     "frozenPaintMap" JSONB,
ADD COLUMN     "frozenScore" INTEGER,
ADD COLUMN     "frozenSections" JSONB;


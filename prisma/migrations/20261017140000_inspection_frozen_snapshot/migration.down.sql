ALTER TABLE "InspectionDraft"
  DROP COLUMN IF EXISTS "frozenSections",
  DROP COLUMN IF EXISTS "frozenPaintMap",
  DROP COLUMN IF EXISTS "frozenScore",
  DROP COLUMN IF EXISTS "frozenGrade",
  DROP COLUMN IF EXISTS "frozenFlagged";

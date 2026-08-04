-- النقض: الأعمدة الثلاثة أثرُ قرارٍ لا مالٌ ولا معاملة، و`AuditLog`
-- يحمل القرار نفسه بمن اتّخذه ومتى. فحذفها يفقد الملاحظة المعروضة
-- للبائع ولا يفقد السجلّ.

ALTER TABLE "Listing"
  DROP COLUMN IF EXISTS "reviewQueuedAt",
  DROP COLUMN IF EXISTS "reviewNote",
  DROP COLUMN IF EXISTS "reviewedAt",
  DROP COLUMN IF EXISTS "reviewedBy";

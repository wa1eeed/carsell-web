ALTER TABLE "Order"
  DROP COLUMN IF EXISTS "returnWindowEndsAt",
  DROP COLUMN IF EXISTS "transferExtensionReason",
  DROP COLUMN IF EXISTS "transferDeadlineExtendedAt",
  DROP COLUMN IF EXISTS "transferDeadlineAt";

-- النقض: `idVerified` يبقى ويحمل الحقيقة الثنائية، فلا يُفقد توثيقٌ
-- قائم. والمفقود تمييزُ المنتظر من المرفوض — وهو ما لم يكن موجودًا
-- أصلًا قبل هذا الترحيل.

DROP INDEX IF EXISTS "User_identityStatus_identitySubmittedAt_idx";
ALTER TABLE "User"
  DROP COLUMN IF EXISTS "identityStatus",
  DROP COLUMN IF EXISTS "identitySubmittedAt",
  DROP COLUMN IF EXISTS "identityMethod",
  DROP COLUMN IF EXISTS "identityNote",
  DROP COLUMN IF EXISTS "identityReviewedBy";
DROP TYPE IF EXISTS "IdentityStatus";

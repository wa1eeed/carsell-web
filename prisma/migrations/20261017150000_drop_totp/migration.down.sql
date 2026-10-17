-- والعودةُ تُعيد العمودين فارغين — وأسرارُهما لا تُستعاد، ولا ينبغي.
ALTER TABLE "AdminUser" ADD COLUMN IF NOT EXISTS "totpSecret" TEXT;
ALTER TABLE "AdminUser" ADD COLUMN IF NOT EXISTS "totpEnrolledAt" TIMESTAMP(3);

-- ═══ حالة توثيق الهوية — أربعٌ لا رايةٌ واحدة ═══
--
-- `idVerified` منطقيّ يقول «وُثّق أو لا»، ولا يقول **ينتظر** ولا
-- **مُعلَّق للتوضيح** ولا **مرفوض** — وهي الحالات التي يُبنى عليها
-- طابور A18. ورايةٌ واحدة تجعل المنتظر والمرفوض سواءً.

CREATE TYPE "IdentityStatus" AS ENUM ('NONE', 'PENDING', 'CLARIFICATION', 'VERIFIED', 'REJECTED');

ALTER TABLE "User"
  ADD COLUMN "identityStatus" "IdentityStatus" NOT NULL DEFAULT 'NONE',
  ADD COLUMN "identitySubmittedAt" TIMESTAMP(3),
  ADD COLUMN "identityMethod" TEXT,
  ADD COLUMN "identityNote" TEXT,
  ADD COLUMN "identityReviewedBy" TEXT;

-- الموثَّقون سلفًا يأخذون حالتهم، فلا يعود أحدهم إلى الطابور
UPDATE "User" SET "identityStatus" = 'VERIFIED' WHERE "idVerified" = true;

-- ومن قدّم هويةً ولم يُوثَّق ينتظر — وهو ما كان يضيع بلا حالة
UPDATE "User"
SET "identityStatus" = 'PENDING', "identitySubmittedAt" = "createdAt", "identityMethod" = 'manual'
WHERE "idVerified" = false AND "nationalIdEncrypted" IS NOT NULL;

CREATE INDEX "User_identityStatus_identitySubmittedAt_idx"
  ON "User" ("identityStatus", "identitySubmittedAt");

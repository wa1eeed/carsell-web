-- قرار ٣٣: بيئتا التكامل منفصلتان (test · live)

CREATE TYPE "IntegrationEnv" AS ENUM ('TEST', 'LIVE');

ALTER TABLE "Integration"
  ADD COLUMN "activeEnv" "IntegrationEnv" NOT NULL DEFAULT 'TEST';

CREATE TABLE "IntegrationCredential" (
  "integrationKey"   TEXT NOT NULL,
  "env"              "IntegrationEnv" NOT NULL,
  "secretsEncrypted" TEXT,
  "hints"            JSONB,
  "updatedAt"        TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IntegrationCredential_pkey" PRIMARY KEY ("integrationKey", "env")
);
ALTER TABLE "IntegrationCredential" ADD CONSTRAINT "IntegrationCredential_integrationKey_fkey"
  FOREIGN KEY ("integrationKey") REFERENCES "Integration"("key") ON DELETE CASCADE ON UPDATE CASCADE;

-- المفتاح القائم كان بلا بيئة، وبيئته الآمنة هي الاختبار لا الإنتاج:
-- ترقيةٌ تفترض LIVE تجعل مفتاح تجربةٍ يعمل على أموال حقيقية.
INSERT INTO "IntegrationCredential" ("integrationKey", "env", "secretsEncrypted", "hints", "updatedAt")
SELECT "key", 'TEST', "secretsEncrypted",
       COALESCE("configPublic" -> 'hints', NULL),
       CURRENT_TIMESTAMP
FROM "Integration"
WHERE "secretsEncrypted" IS NOT NULL AND "secretsEncrypted" <> '';

ALTER TABLE "Integration" DROP COLUMN "secretsEncrypted";

ALTER TYPE "ApprovalKind" ADD VALUE IF NOT EXISTS 'INTEGRATION_ENV';

-- نقض فصل البيئات: يُعاد العمود الواحد، وتُنقل مفاتيح الاختبار إليه.
ALTER TABLE "Integration" ADD COLUMN "secretsEncrypted" TEXT;

UPDATE "Integration" i
SET "secretsEncrypted" = c."secretsEncrypted"
FROM "IntegrationCredential" c
WHERE c."integrationKey" = i."key" AND c."env" = 'TEST';

DROP TABLE IF EXISTS "IntegrationCredential";
ALTER TABLE "Integration" DROP COLUMN IF EXISTS "activeEnv";
DROP TYPE IF EXISTS "IntegrationEnv";

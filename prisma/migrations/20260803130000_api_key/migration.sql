-- ═══ مفتاح الـAPI العام — مجزّأ لا خام ═══
--
-- قاعدةٌ مسروقة تُعطي السارق مفاتيح عملاء يعملون بها فورًا. والبادئة
-- للتعرّف وحده: بها يعرف العميل أيّ مفتاح يدوّر، ولا تكفي للاستعمال.

CREATE TABLE "ApiKey" (
  "id"         TEXT NOT NULL,
  "name"       TEXT NOT NULL,
  "prefix"     TEXT NOT NULL,
  "keyHash"    TEXT NOT NULL,
  "scopes"     TEXT[],
  "rateLimit"  INTEGER NOT NULL DEFAULT 60,
  "active"     BOOLEAN NOT NULL DEFAULT true,
  "lastUsedAt" TIMESTAMP(3),
  "createdBy"  TEXT NOT NULL,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt"  TIMESTAMP(3),
  CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ApiKey_prefix_key" ON "ApiKey"("prefix");
CREATE UNIQUE INDEX "ApiKey_keyHash_key" ON "ApiKey"("keyHash");
CREATE INDEX "ApiKey_active_idx" ON "ApiKey"("active");

-- لوحة المزوّدين الموحَّدة (قرار المالك ٢٠٢٦-١٠-١٤):
-- للمزوّد موظّفون يدخلون بالبريد وكلمة المرور، لا رقمٌ واحد يتناقلونه.

CREATE TABLE "ProviderUser" (
  "id"                 TEXT NOT NULL,
  "providerId"         TEXT NOT NULL,
  "email"              TEXT NOT NULL,
  "name"               TEXT NOT NULL,
  "passwordHash"       TEXT NOT NULL,
  "active"             BOOLEAN NOT NULL DEFAULT true,
  "lastSeenAt"         TIMESTAMP(3),
  "mustChangePassword" BOOLEAN NOT NULL DEFAULT true,
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProviderUser_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProviderUser_email_key" ON "ProviderUser"("email");
CREATE INDEX "ProviderUser_providerId_active_idx" ON "ProviderUser"("providerId", "active");

ALTER TABLE "ProviderUser"
  ADD CONSTRAINT "ProviderUser_providerId_fkey"
  FOREIGN KEY ("providerId") REFERENCES "ServiceProvider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ProviderSession" (
  "id"             TEXT NOT NULL,
  "providerUserId" TEXT NOT NULL,
  "tokenHash"      TEXT NOT NULL,
  "ip"             TEXT,
  "userAgent"      TEXT,
  "expiresAt"      TIMESTAMP(3) NOT NULL,
  "revokedAt"      TIMESTAMP(3),
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProviderSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProviderSession_tokenHash_key" ON "ProviderSession"("tokenHash");
CREATE INDEX "ProviderSession_providerUserId_expiresAt_idx" ON "ProviderSession"("providerUserId", "expiresAt");

ALTER TABLE "ProviderSession"
  ADD CONSTRAINT "ProviderSession_providerUserId_fkey"
  FOREIGN KEY ("providerUserId") REFERENCES "ProviderUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

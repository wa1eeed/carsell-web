-- دفتر البوابة التجريبية — منفصل عن دفترنا عمدًا (يُقارَن به لا يُشتقّ منه)
CREATE TABLE "SandboxTransaction" (
    "id"        TEXT NOT NULL,
    "ref"       TEXT NOT NULL,
    "kind"      TEXT NOT NULL,
    "amount"    DECIMAL(12,2) NOT NULL,
    "currency"  TEXT NOT NULL DEFAULT 'SAR',
    "state"     TEXT NOT NULL,
    "parentRef" TEXT,
    "method"    TEXT NOT NULL DEFAULT 'mada',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SandboxTransaction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SandboxTransaction_ref_key" ON "SandboxTransaction"("ref");
CREATE INDEX "SandboxTransaction_createdAt_idx" ON "SandboxTransaction"("createdAt");
CREATE INDEX "SandboxTransaction_parentRef_idx" ON "SandboxTransaction"("parentRef");

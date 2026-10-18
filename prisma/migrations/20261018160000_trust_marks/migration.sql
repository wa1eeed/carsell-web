-- ═══ علاماتُ الموثوقية ═══
CREATE TYPE "TrustMarkKind" AS ENUM ('REGULATORY', 'PAYMENT');

CREATE TABLE "TrustMark" (
    "key" TEXT NOT NULL,
    "kind" "TrustMarkKind" NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "logoPath" TEXT NOT NULL,
    "registrationNo" TEXT,
    "verifyUrl" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "TrustMark_pkey" PRIMARY KEY ("key")
);

CREATE INDEX "TrustMark_kind_sort_idx" ON "TrustMark"("kind", "sort");

-- **والبياناتُ المرجعية تصل القاعدةَ الحيّة بترحيل لا ببذرة**: البذرة
-- تُطبَّق على قاعدةٍ فارغة مرّةً واحدة، وشاشةُ اللوحة تعدّل ولا تُنشئ.
INSERT INTO "TrustMark" ("key", "kind", "nameAr", "nameEn", "logoPath", "verifyUrl", "sort") VALUES
  ('dga', 'REGULATORY', 'هيئة الحكومة الرقمية', 'Digital Government Authority', '/trust/dga.png', 'https://dga.gov.sa', 1),
  ('saudi_business_center', 'REGULATORY', 'المركز السعودي للأعمال', 'Saudi Business Center', '/trust/saudi-business-center.png', 'https://business.sa', 2),
  ('ndgp', 'REGULATORY', 'منصة حوكمة البيانات الوطنية', 'National Data Governance Platform', '/trust/ndgp.png', 'https://dgp.sdaia.gov.sa', 3),
  ('vat', 'REGULATORY', 'ضريبة القيمة المضافة', 'Value Added Tax', '/trust/vat.png', 'https://zatca.gov.sa', 4)
ON CONFLICT ("key") DO NOTHING;

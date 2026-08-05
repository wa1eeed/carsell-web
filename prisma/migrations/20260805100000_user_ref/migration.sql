-- رقم العميل المقروء — `CUS-2026-0042`.
--
-- والمعرّف الداخليّ (cuid) لا يُقرأ في هاتف ولا يُكتب في رسالة، فبقي
-- العميل بلا رقمٍ يُعرَف به: يقول اسمه ورقم جوّاله، والأسماء تتكرّر
-- والجوّال يتغيّر.
ALTER TABLE "User" ADD COLUMN "ref" TEXT;

-- ═══ والتعبئة بترتيب الانضمام ═══
--
-- فأقدمُ عميلٍ يأخذ أصغر رقم، والتسلسل يقرأ ما يقوله الانضمام لا ما
-- يقوله ترتيب الصفوف على القرص.
WITH numbered AS (
  SELECT "id",
         'CUS-' || TO_CHAR("createdAt", 'YYYY') || '-' ||
         LPAD((ROW_NUMBER() OVER (
           PARTITION BY TO_CHAR("createdAt", 'YYYY') ORDER BY "createdAt", "id"
         ))::text, 4, '0') AS ref
  FROM "User"
)
UPDATE "User" SET "ref" = numbered.ref
FROM numbered WHERE "User"."id" = numbered."id";

CREATE UNIQUE INDEX "User_ref_key" ON "User"("ref");

-- نوعا هيكلٍ بلا صفّ عرض — فلا يظهران في الرئيسية ولا يُرشَّح بهما.
--
-- **والبياناتُ المرجعية تصل القاعدةَ الحيّة بترحيل لا ببذرة.**
INSERT INTO "BodyTypeDisplay" ("key","nameAr","nameEn","sort")
VALUES ('CROSSOVER','كروس أوفر','Crossover',3)
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "BodyTypeDisplay" ("key","nameAr","nameEn","sort")
VALUES ('CONVERTIBLE','مكشوفة','Convertible',7)
ON CONFLICT ("key") DO NOTHING;

UPDATE "BodyTypeDisplay" SET "sort" = 4 WHERE "key" = 'PICKUP';
UPDATE "BodyTypeDisplay" SET "sort" = 5 WHERE "key" = 'HATCHBACK';
UPDATE "BodyTypeDisplay" SET "sort" = 6 WHERE "key" = 'COUPE';
UPDATE "BodyTypeDisplay" SET "sort" = 8 WHERE "key" = 'VAN';

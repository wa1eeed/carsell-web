-- أسماءُ المزوّدَين كما في ترميز A11: «NAFATH» و«موجز».
-- والثاني خدمةٌ عربيّةُ الاسم، فكتابتُه «Mojaz» ترجمةٌ لا اسم.
UPDATE "Integration" SET "provider" = 'NAFATH' WHERE "key" = 'nafath' AND "provider" = 'Nafath';
UPDATE "Integration" SET "provider" = 'موجز'   WHERE "key" = 'mojaz'  AND "provider" = 'Mojaz';

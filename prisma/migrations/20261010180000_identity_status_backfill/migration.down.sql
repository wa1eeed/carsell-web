-- النقض يُعيد ما مُلئ إلى `NONE` — وما كان `VERIFIED` قبل الترحيل لا
-- يُميَّز عمّا مُلئ، فالنقض يطال الاثنين. وهو مقبول: الحقل مشتقٌّ،
-- و`idVerified` يبقى فلا تُفقد معلومة.
UPDATE "User"
SET "identityStatus" = 'NONE'
WHERE "idVerified" = true
  AND "identityStatus" = 'VERIFIED';

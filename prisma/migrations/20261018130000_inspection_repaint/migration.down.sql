UPDATE "InspectionCategory"
SET "nameAr" = 'الهيكل والصبغ', "nameEn" = 'Body and paint'
WHERE "key" = 'body';

-- وقيمةُ التعداد لا تُحذف في PostgreSQL إلّا بإعادة بناء النوع كلّه،
-- وهي عمليةٌ تُقفل الجدول — فتُترك: قيمةٌ زائدة لا تضرّ، وحذفُها يضرّ.

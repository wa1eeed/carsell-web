-- النصوص المرجعية: أرقامها إلى اللاتينية — قرار 2026-10-12
--
-- `DISPLAY_NUMERALS` يقلب كلَّ رقمٍ يمرّ بطبقة العرض، **ونصٌّ مخزَّن
-- لا يمرّ بها**. فكانت الشاشة تجمع «48px سطر» بأرقامٍ عربية-هندية
-- وسعرَها «3,500» لاتينيًّا في صفٍّ واحد، و«خلال 48 ساعة» في سؤالٍ
-- شائع فوق أسعارٍ لاتينية.
--
-- والبياناتُ المرجعية تصل القاعدةَ الحيّة بترحيل لا ببذرة: ملفّات
-- `seed-data/*.json` تُطبَّق مرّةً على قاعدةٍ فارغة، فصفٌّ معدَّل فيها
-- لا يصل بيئةً تعمل. وهذا يصلها.
--
-- و`translate` تبدّل الخانات وحدها: ما ليس رقمًا يمرّ كما هو.

UPDATE "AdSlot" SET
  "sizeLabel" = translate("sizeLabel", '٠١٢٣٤٥٦٧٨٩', '0123456789'),
  "placement" = translate("placement", '٠١٢٣٤٥٦٧٨٩', '0123456789'),
  "nameAr"    = translate("nameAr",    '٠١٢٣٤٥٦٧٨٩', '0123456789');

UPDATE "FaqItem" SET
  "questionAr" = translate("questionAr", '٠١٢٣٤٥٦٧٨٩', '0123456789'),
  "answerAr"   = translate("answerAr",   '٠١٢٣٤٥٦٧٨٩', '0123456789');

UPDATE "Feature" SET
  "nameAr" = translate("nameAr", '٠١٢٣٤٥٦٧٨٩', '0123456789');

UPDATE "Service" SET
  "nameAr" = translate("nameAr", '٠١٢٣٤٥٦٧٨٩', '0123456789'),
  "descAr" = translate("descAr", '٠١٢٣٤٥٦٧٨٩', '0123456789');

UPDATE "InspectionCategory" SET
  "nameAr" = translate("nameAr", '٠١٢٣٤٥٦٧٨٩', '0123456789');

UPDATE "InspectionItem" SET
  "nameAr" = translate("nameAr", '٠١٢٣٤٥٦٧٨٩', '0123456789');

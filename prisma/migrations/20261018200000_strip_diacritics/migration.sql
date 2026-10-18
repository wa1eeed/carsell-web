-- ═══ مسحُ التشكيل من النصّ المرجعيّ المخزَّن ═══
--
-- قرار المالك: «نعم اسحب حذف التشكيل على كل الشاشات». والشيفرةُ
-- وملفّاتُ البذرة مُسحت في الالتزام نفسه — **وملفُّ البذرة لا يصل
-- بيئةً تعمل**: الزرع يمرّ مرّةً على قاعدةٍ فارغة، وشاشاتُ الأدمن
-- تعدّل ولا تُعيد الزرع. فنصُّ وثيقةٍ قانونيةٍ في بيئةٍ قائمة يبقى
-- مشكولًا إلى الأبد ما لم يصله ترحيل.
--
-- **والمرجعيُّ وحده يُمسح.** السجلّاتُ لا: `AuditLog` والإشعارُ
-- المُرسَل والنزاعُ وملاحظاتُ المستخدمين **وقائعُ قيلت**، وتعديلُها
-- تزويرٌ لا تنسيق. والتشكيلُ فيها يختفي وحده كلّما أُنشئ صفٌّ جديد
-- من نصٍّ مُسِح.
--
-- **والفئةُ بمهاربها لا بحروفها**: ملفُّ ترحيلٍ مكتوبٌ بعلامات التشكيل
-- نفسِها يقع ضحيّةَ المسح التالي، فيصير `[-]` بلا شكوى. (وهو ما وقع
-- للمطبِّعَين في `cities.ts` و`lexicon.ts` لولا أنّهما أُصلحا.)
--
-- والتطويل (U+0640) يبقى: «ينتهي بـSA» عربيةٌ صحيحة لا زينة.

UPDATE "LegalDocument" SET
  "titleAr"   = regexp_replace("titleAr",   E'[ً-ْٰ]', '', 'g'),
  "summaryAr" = regexp_replace("summaryAr", E'[ً-ْٰ]', '', 'g'),
  "sections"  = regexp_replace("sections"::text, E'[ً-ْٰ]', '', 'g')::jsonb;

UPDATE "FaqItem" SET
  "questionAr" = regexp_replace("questionAr", E'[ً-ْٰ]', '', 'g'),
  "answerAr"   = regexp_replace("answerAr",   E'[ً-ْٰ]', '', 'g');

UPDATE "NotificationTemplate" SET
  "subjectAr" = regexp_replace("subjectAr", E'[ً-ْٰ]', '', 'g'),
  "bodyAr"    = regexp_replace("bodyAr",    E'[ً-ْٰ]', '', 'g'),
  "smsAr"     = regexp_replace("smsAr",     E'[ً-ْٰ]', '', 'g');

UPDATE "Service" SET
  "nameAr"     = regexp_replace("nameAr", E'[ً-ْٰ]', '', 'g'),
  "descAr"     = regexp_replace("descAr", E'[ً-ْٰ]', '', 'g'),
  "includesAr" = ARRAY(
    SELECT regexp_replace(x, E'[ً-ْٰ]', '', 'g') FROM unnest("includesAr") AS x
  );

UPDATE "AdSlot"  SET "nameAr" = regexp_replace("nameAr", E'[ً-ْٰ]', '', 'g');
UPDATE "Feature" SET "nameAr" = regexp_replace("nameAr", E'[ً-ْٰ]', '', 'g');
UPDATE "TaxRule" SET "note"   = regexp_replace("note",   E'[ً-ْٰ]', '', 'g');

UPDATE "InspectionCategory" SET "nameAr" = regexp_replace("nameAr", E'[ً-ْٰ]', '', 'g');
UPDATE "InspectionItem"     SET "nameAr" = regexp_replace("nameAr", E'[ً-ْٰ]', '', 'g');

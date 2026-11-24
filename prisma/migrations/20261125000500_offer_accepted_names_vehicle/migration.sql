-- إشعارُ «قُبل عرضك» يسمّي السيارة.
--
-- كان نصُّه «قبل عرضك» وحدها، ومن له عرضان على سيارتين لا يعرف أيَّهما قُبل
-- — وهو إشعارٌ حرج: بعده مهلةُ دفعٍ يفوتها من انتظر ليعرف. وترميزُ A8 يكتبه
-- «قُبل عرضك على {vehicle}».
--
-- والقوالبُ بياناتٌ مرجعية: ملفّ البذرة يُطبَّق على قاعدةٍ فارغة مرّةً، فما
-- يُعدَّل فيه لا يصل بيئةً تعمل. والشرطُ على النصّ القديم فلا يُكتب على
-- قالبٍ عدّله مشغّل من الشاشة.

UPDATE "NotificationTemplate"
SET "subjectAr" = 'قبل عرضك على {vehicle}',
    "subjectEn" = 'Your offer on {vehicle} was accepted',
    "bodyAr"    = 'قبل البائع عرضك على {vehicle} بمبلغ {amount} ريال، وأنشئ لك طلب بانتظار الدفع ضمن المهلة المعروضة فيه.',
    "bodyEn"    = 'The seller accepted your offer on {vehicle} for {amount} SAR. An order is waiting for payment within the window shown on it.',
    "smsAr"     = 'قبل عرضك على {vehicle} — أتمم الدفع من حسابك',
    "variables" = ARRAY['vehicle','ref','amount']
WHERE "key" = 'offer.accepted' AND "subjectAr" = 'قبل عرضك';

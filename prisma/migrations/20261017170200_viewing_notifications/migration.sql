-- ═══ قوالبُ المعاينة وقناتُها — بترحيلٍ لا ببذرة ═══
--
-- القاعدة في `CLAUDE.md`: شاشةُ الأدمن تعدّل القوالب ولا تُنشئها،
-- والبذرةُ تُطبَّق على قاعدةٍ فارغة مرّةً. فقالبٌ جديد في الملفّ يصل
-- بيئةً جديدة **ولا يصل بيئةً تعمل** — فيُعرض مفتاحُه الخام
-- («viewing.requested») في جرس المستخدم.
--
-- **والقناةُ قبل القوالب**: `pushChannelKey` مفتاحٌ أجنبيّ، وإدراجُ
-- قالبٍ يشير إلى قناةٍ غائبة يسقط الترحيل كلَّه.

INSERT INTO "PushChannel" ("key","nameAr","defaultOn","userControllable","sort")
VALUES ('viewings_mine', 'مواعيد المعاينة', true, true, 7)
ON CONFLICT ("key") DO NOTHING;


INSERT INTO "NotificationTemplate" ("key","subjectAr","subjectEn","bodyAr","bodyEn","smsAr","smsEn","priority","channelEmail","channelSms","channelPush","channelInApp","variables","active","pushChannelKey")
VALUES ('viewing.requested','طلبُ معاينة على إعلانك','A viewing request on your listing','طلب مشترٍ موعدًا لمعاينة مركبتك. افتح «مواعيد المعاينة» لتقبل أو تعتذر — وإن لم تردّ قبل الموعد سقط الطلب.','A buyer asked to view your car. Open “Viewings” to accept or decline — an unanswered request lapses at its slot.',NULL,NULL,'high',true,false,true,true,ARRAY['ref']::text[],true,'viewings_mine')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "NotificationTemplate" ("key","subjectAr","subjectEn","bodyAr","bodyEn","smsAr","smsEn","priority","channelEmail","channelSms","channelPush","channelInApp","variables","active","pushChannelKey")
VALUES ('viewing.confirmed','تأكّد موعد المعاينة','Your viewing is confirmed','قبل البائع موعدك وكتب نقطة اللقاء. افتح «مواعيد المعاينة» لتراها.','The seller accepted your slot and set a meeting point. Open “Viewings” to see it.',NULL,NULL,'high',true,false,true,true,ARRAY['ref']::text[],true,'viewings_mine')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "NotificationTemplate" ("key","subjectAr","subjectEn","bodyAr","bodyEn","smsAr","smsEn","priority","channelEmail","channelSms","channelPush","channelInApp","variables","active","pushChannelKey")
VALUES ('viewing.declined','لم يُقبل موعد المعاينة','Your viewing was declined','اعتذر البائع عن هذا الموعد وكتب سببه. تستطيع اقتراح موعدٍ آخر من صفحة المركبة.','The seller declined this slot and gave a reason. You can propose another from the car page.',NULL,NULL,'normal',true,false,true,true,ARRAY['ref']::text[],true,'viewings_mine')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "NotificationTemplate" ("key","subjectAr","subjectEn","bodyAr","bodyEn","smsAr","smsEn","priority","channelEmail","channelSms","channelPush","channelInApp","variables","active","pushChannelKey")
VALUES ('viewing.cancelled','أُلغي موعد المعاينة','A viewing was cancelled','أُلغي موعد المعاينة المتّفق عليه. افتح «مواعيد المعاينة» للتفاصيل.','An agreed viewing was cancelled. Open “Viewings” for details.',NULL,NULL,'high',true,false,true,true,ARRAY['ref']::text[],true,'viewings_mine')
ON CONFLICT ("key") DO NOTHING;

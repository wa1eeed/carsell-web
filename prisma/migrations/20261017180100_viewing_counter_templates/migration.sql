-- قالبا الاقتراح المضادّ والتذكير — بترحيلٍ لا ببذرة.
--
-- شاشةُ الأدمن تعدّل القوالب ولا تُنشئها، والبذرةُ تُطبَّق على قاعدةٍ
-- فارغة مرّةً — فقالبٌ جديد في الملفّ يصل بيئةً جديدة ولا يصل بيئةً
-- تعمل، فيُعرض مفتاحُه الخام في جرس المستخدم.


INSERT INTO "NotificationTemplate" ("key","subjectAr","subjectEn","bodyAr","bodyEn","smsAr","smsEn","priority","channelEmail","channelSms","channelPush","channelInApp","variables","active","pushChannelKey")
VALUES ('viewing.countered','اقترح البائع موعدًا آخر','The seller proposed another time','لم يناسبه الموعد الذي طلبتَه واقترح غيره، وكتب نقطة اللقاء. افتح «مواعيد المعاينة» لتقبل أو تلغي.','Your slot did not suit the seller; they proposed another and set a meeting point. Open “Viewings” to accept or cancel.',NULL,NULL,'high',true,false,true,true,ARRAY['ref']::text[],true,'viewings_mine')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "NotificationTemplate" ("key","subjectAr","subjectEn","bodyAr","bodyEn","smsAr","smsEn","priority","channelEmail","channelSms","channelPush","channelInApp","variables","active","pushChannelKey")
VALUES ('viewing.reminder','تذكير بموعد المعاينة','Your viewing is coming up','موعد المعاينة المتّفق عليه يقترب. افتح «مواعيد المعاينة» لمكان اللقاء ورقم الطرف الآخر.','Your agreed viewing is coming up. Open “Viewings” for the meeting point and the other party’s number.',NULL,NULL,'high',true,false,true,true,ARRAY['ref']::text[],true,'viewings_mine')
ON CONFLICT ("key") DO NOTHING;

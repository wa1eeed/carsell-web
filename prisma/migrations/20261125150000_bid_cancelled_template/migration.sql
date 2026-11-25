-- قالبُ «ألغيت مزايدتك» — والبياناتُ المرجعية تصل القاعدةَ الحيّة بترحيل
--
-- `seed-data/notification-templates.json` يُطبَّق بـ`createMany` على
-- قاعدةٍ فارغة مرّةً واحدة، وشاشةُ A8 تعدّل ولا تُنشئ. فقالبٌ جديد
-- يصل بيئةً جديدة ولا يصل بيئةً تعمل — ويُعرض مفتاحُه الخام في جرس
-- المستخدم («auction.bid_cancelled»). وقد وقع هذا مرّةً من قبل.
INSERT INTO "NotificationTemplate" (
  "key", "subjectAr", "subjectEn", "bodyAr", "bodyEn", "smsAr", "smsEn",
  "priority", "channelEmail", "channelSms", "channelPush", "channelInApp",
  "variables", "active", "pushChannelKey"
) VALUES (
  'auction.bid_cancelled',
  'ألغيت مزايدتك',
  'Your bid was cancelled',
  'ألغى فريق المنصة مزايدتك على {ref} — السبب: {reason}. عربونك باقي ولك أن تزايد من جديد.',
  'The platform team cancelled your bid on {ref} — reason: {reason}. Your deposit stands and you may bid again.',
  'ألغيت مزايدتك على {ref}',
  NULL,
  'critical', false, true, true, true,
  ARRAY['ref','reason','amount'],
  true,
  'auction_mine'
)
ON CONFLICT ("key") DO NOTHING;

-- و«عدتَ إلى الصدارة» قالبٌ مستقلّ لا `auction.outbid`
--
-- أرسلتُ للعائد إلى الصدارة قالبَ «تم تجاوز مزايدتك» — نصٌّ يقول
-- عكسَ ما وقع. والنصّ المعروض وعدٌ لا وصف: من قرأه يحسب نفسه خاسرًا
-- وهو المتصدّر، فيترك المزاد في وقتٍ هو أحوج ما يكون إلى متابعته.
INSERT INTO "NotificationTemplate" (
  "key", "subjectAr", "subjectEn", "bodyAr", "bodyEn", "smsAr", "smsEn",
  "priority", "channelEmail", "channelSms", "channelPush", "channelInApp",
  "variables", "active", "pushChannelKey"
) VALUES (
  'auction.lead_restored',
  'عدت إلى صدارة المزاد',
  'You lead the auction again',
  'ألغيت مزايدة كانت فوق مزايدتك على {ref}، فصرت الأعلى بـ{amount} ريال.',
  'A bid above yours on {ref} was cancelled, so you are the highest at {amount} SAR.',
  NULL, NULL,
  'high', false, false, true, true,
  ARRAY['ref','amount'],
  true,
  'auction_mine'
)
ON CONFLICT ("key") DO NOTHING;

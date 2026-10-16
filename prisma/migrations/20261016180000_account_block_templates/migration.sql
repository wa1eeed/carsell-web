-- ═══ قالبا إيقافِ الحساب ورفعِه ═══
--
-- `setUserStatus` تُخطر صاحب الحساب بما وقع. و`NotificationTemplate`
-- يُكتب بـ`createMany` في البذرة وحدها، وشاشةُ الأدمن **تعدّل ولا
-- تُنشئ** — فقالبٌ يُضاف إلى الملفّ يصل بيئةً جديدة ولا يصل قاعدةً
-- تعمل، ويُعرض مفتاحُه الخام («account.blocked») في جرس المستخدم.
--
-- و`ON CONFLICT DO NOTHING` يجعله آمنًا على بيئةٍ زُرعت بالملفّ: يمرّ
-- بلا أثر.

INSERT INTO "NotificationTemplate" (
  "key", "subjectAr", "subjectEn", "bodyAr", "bodyEn",
  "smsAr", "smsEn", "priority",
  "channelEmail", "channelSms", "channelPush", "channelInApp",
  "variables", "active"
) VALUES
  (
    'account.blocked',
    'أُوقف حسابك',
    'Your account is blocked',
    'أُوقف حسابك مؤقّتًا. السبب مسجَّل لدينا، وللاعتراض تواصل معنا.',
    'Your account has been blocked. The reason is on record; contact us to appeal.',
    NULL, NULL, 'critical',
    true, false, true, true,
    ARRAY['reason']::text[], true
  ),
  (
    'account.restored',
    'عاد حسابك',
    'Your account is active again',
    'رُفع الإيقاف عن حسابك، وتستطيع الدخول والمتابعة كالمعتاد.',
    'The block on your account has been lifted; you can sign in and continue.',
    NULL, NULL, 'high',
    true, false, true, true,
    ARRAY[]::text[], true
  )
ON CONFLICT ("key") DO NOTHING;

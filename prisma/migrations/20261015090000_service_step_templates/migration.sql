-- ═══ قالبا إشعارٍ جديدان — ولا طريق لهما إلى قاعدةٍ مزروعة ═══
--
-- `NotificationTemplate` يُكتب بـ`createMany` في البذرة وحدها، وشاشةُ
-- الأدمن **تعدّل ولا تُنشئ**. فقالبٌ يُضاف إلى `notification-templates.json`
-- يصل بيئةً جديدة ولا يصل قاعدةً تعمل — ويُرسَل الإشعار فيُعرض **مفتاحه
-- الخام** («service.assigned») بدل نصّه، عطلًا يراه المستخدم.
--
-- فالبياناتُ المرجعية تصل بترحيل. و`ON CONFLICT DO NOTHING` يجعله آمنًا
-- على بيئةٍ زُرعت بالملفّ أصلًا: يمرّ بلا أثر.

INSERT INTO "NotificationTemplate" (
  "key", "subjectAr", "subjectEn", "bodyAr", "bodyEn",
  "smsAr", "smsEn", "priority",
  "channelEmail", "channelSms", "channelPush", "channelInApp",
  "variables", "active"
) VALUES
  (
    'service.assigned',
    'استلم مركزٌ طلبك',
    'A centre took your request',
    'استلم مركزٌ معتمد طلبك وسيتواصل معك على موعده. تفاصيله في صفحة الطلب.',
    'An approved centre took your request and will be in touch about the appointment. Details on the request page.',
    NULL, NULL, 'normal',
    true, false, false, true,
    ARRAY['ref', 'service'], true
  ),
  (
    'service.failed',
    'تعذّر إتمام طلبك',
    'Your request could not be completed',
    'تعذّر إتمام طلب الخدمة، والسبب في صفحة الطلب. وما دُفع يُردّ — يراجعه فريقنا.',
    'Your service request could not be completed; the reason is on the request page. Anything paid is refunded — our team is reviewing it.',
    NULL, NULL, 'critical',
    true, false, false, true,
    ARRAY['ref', 'service'], true
  )
ON CONFLICT ("key") DO NOTHING;

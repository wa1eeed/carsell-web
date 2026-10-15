-- نقضٌ يحذف القالبين — وإشعاراتٌ أُرسلت بهما تبقى وتُعرض بمفتاحها الخام.
DELETE FROM "NotificationTemplate" WHERE "key" IN ('service.assigned', 'service.failed');

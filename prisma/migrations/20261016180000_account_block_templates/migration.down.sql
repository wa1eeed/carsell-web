-- نقضُ القالبين — ولا يُحذف إشعارٌ أُرسل بهما: الإشعار يحمل نصَّه.
DELETE FROM "NotificationTemplate" WHERE "key" IN ('account.blocked', 'account.restored');

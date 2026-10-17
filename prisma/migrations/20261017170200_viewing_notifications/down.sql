DELETE FROM "NotificationTemplate" WHERE "key" LIKE 'viewing.%';
DELETE FROM "PushChannel" WHERE "key" = 'viewings_mine';

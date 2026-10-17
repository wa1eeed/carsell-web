-- ═══ قنواتُ الإشعار تصل بترحيل — وكانت في البذرة وحدها ═══
--
-- القاعدةُ مكتوبةٌ في `CLAUDE.md`: البياناتُ المرجعية تصل القاعدةَ
-- الحيّة بترحيل لا ببذرة. **وطُبِّقت على القوالب ولم تُطبَّق على
-- القنوات** — فصار تاريخُ الترحيلات غيرَ قابلٍ للإعادة:
--
--   ١. ترحيلان يُدرجان صفوف `NotificationTemplate`.
--   ٢. ثمّ `20261016220000` يُسند لها `pushChannelKey`.
--   ٣. و`PushChannel` فارغٌ لأن صفوفَه في البذرة — فيسقط المفتاح
--      الأجنبيّ: «Key (pushChannelKey)=(orders_payment) is not present».
--
-- **فقاعدةٌ جديدة لا تُبنى من الترحيلات أصلًا**، و`migrate deploy`
-- يسقط على أوّل بيئةٍ تُنشأ. ولا يظهر في قاعدةٍ قائمة: البذرةُ سبقت
-- فيها الترحيل. وختمُه أقدم من `220000` ليسبقه في الترتيب.

INSERT INTO "PushChannel" ("key","nameAr","defaultOn","userControllable","sort")
VALUES ('auction_mine', 'المزادات التي أشارك فيها', true, false, 1)
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "PushChannel" ("key","nameAr","defaultOn","userControllable","sort")
VALUES ('orders_payment', 'الطلبات والدفع', true, false, 2)
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "PushChannel" ("key","nameAr","defaultOn","userControllable","sort")
VALUES ('offers_mine', 'العروض على مركباتي', true, true, 3)
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "PushChannel" ("key","nameAr","defaultOn","userControllable","sort")
VALUES ('favorite_price_drop', 'انخفاض سعر في المفضلة', true, true, 4)
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "PushChannel" ("key","nameAr","defaultOn","userControllable","sort")
VALUES ('saved_search_results', 'نتائج جديدة لبحث محفوظ', true, true, 5)
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "PushChannel" ("key","nameAr","defaultOn","userControllable","sort")
VALUES ('marketing', 'عروض وخدمات (تسويقي)', false, true, 6)
ON CONFLICT ("key") DO NOTHING;

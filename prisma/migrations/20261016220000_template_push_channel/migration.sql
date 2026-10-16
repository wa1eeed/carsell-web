-- ═══ موضوعُ الإشعار — والفراغ الذي عطّل المفاتيح كلَّها ═══
--
-- `NotificationPreference` و`setPreference` و`isChannelEnabled`
-- مبنيّةٌ منذ A10، و`PushChannel` مزروعٌ بستّ قنوات — **ولا طريق من
-- قالبٍ مُرسَل إلى القناة التي يُطفئها صاحبه**. فالمفاتيح لا تُقرأ
-- أبدًا، وصفُّ تفضيلٍ واحد لم يُكتب قطّ.
--
-- و`NULL` تعني «يصل دائمًا»: ما لم يُصنَّف لا يُمنع.

ALTER TABLE "NotificationTemplate" ADD COLUMN IF NOT EXISTS "pushChannelKey" TEXT;

ALTER TABLE "NotificationTemplate"
  DROP CONSTRAINT IF EXISTS "NotificationTemplate_pushChannelKey_fkey";

ALTER TABLE "NotificationTemplate"
  ADD CONSTRAINT "NotificationTemplate_pushChannelKey_fkey"
  FOREIGN KEY ("pushChannelKey") REFERENCES "PushChannel"("key")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ═══ والتصنيف بالموضوع لا بالوسيلة ═══
--
-- المزاد وعربونُه قناةٌ واحدة، والطلب وضمانُه وخدماتُه أخرى، والعرض
-- ثالثة. **وما لا قناةَ له يبقى `NULL`**: النزاع وحالُ الحساب ودخولُه
-- لا تُطفأ، وشؤون الإعلان لا قناةَ لها بعد.

UPDATE "NotificationTemplate" SET "pushChannelKey" = 'auction_mine'
  WHERE "key" LIKE 'auction.%' OR "key" LIKE 'deposit.%';

UPDATE "NotificationTemplate" SET "pushChannelKey" = 'orders_payment'
  WHERE "key" LIKE 'order.%' OR "key" LIKE 'escrow.%' OR "key" LIKE 'service.%';

UPDATE "NotificationTemplate" SET "pushChannelKey" = 'offers_mine'
  WHERE "key" LIKE 'offer.%';

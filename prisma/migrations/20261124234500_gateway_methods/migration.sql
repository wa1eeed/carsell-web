-- وسائلُ الدفع لكلّ بوابة — تصل القاعدةَ الحيّة بترحيلٍ لا بملفّ البذرة.
--
-- ملفّ `payment-gateways.json` يُطبَّق بـcreateMany + skipDuplicates، أي على
-- قاعدةٍ فارغة مرّةً واحدة. فمفتاحٌ يُضاف إلى `capabilities` يصل بيئةً جديدة
-- ولا يصل بيئةً تعمل — وتبقى شاشةُ A20 بلا سطر الوسائل في الإنتاج وحده.
--
-- والدمجُ لا الاستبدال: `||` يُبقي ما في الصفّ ويضيف المفتاح، فلا تُمحى
-- قيمةٌ عدّلها مشغّل. ولا يُكتب على صفٍّ يحمل المفتاح أصلًا.

UPDATE "PaymentGateway"
SET "capabilities" = "capabilities" || '{"methods":["تحويل بنكي"]}'::jsonb
WHERE "key" = 'bank_escrow' AND NOT ("capabilities" ? 'methods');

UPDATE "PaymentGateway"
SET "capabilities" = "capabilities" || '{"methods":["مدى","Apple Pay","بطاقات"]}'::jsonb
WHERE "key" = 'moyasar' AND NOT ("capabilities" ? 'methods');

UPDATE "PaymentGateway"
SET "capabilities" = "capabilities" || '{"methods":["مدى","بطاقات","تحويل"]}'::jsonb
WHERE "key" = 'tap' AND NOT ("capabilities" ? 'methods');

UPDATE "PaymentGateway"
SET "capabilities" = "capabilities" || '{"methods":["بطاقات"]}'::jsonb
WHERE "key" = 'sandbox' AND NOT ("capabilities" ? 'methods');

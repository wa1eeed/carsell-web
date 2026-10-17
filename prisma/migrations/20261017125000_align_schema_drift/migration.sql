-- ═══ مواءمةُ ما تُنتجه الترحيلات بما يُعلنه المخطّط ═══
--
-- كان بينهما فرقٌ صامت: مفتاحان أجنبيّان بسلوك حذفٍ غير الذي يُعلنه
-- المخطّط، وفهرسان تُنشئهما الترحيلات ولا يذكرهما. فقاعدةٌ تُبنى من
-- الترحيلات **لا تساوي المخطّط**، و`migrate diff` يُخرج فرقًا في كل
-- مرّة — فيجرفه أوّلُ من يولّد ترحيلًا من القاعدة الحيّة إلى ترحيله.
-- وهو ما وقع: ترحيلُ قالب الفحص جرفها فأسقط اختبار إنشاء الخدمات.
--
-- **وكلُّها محصَّنة**: القاعدةُ التي وقع فيها الجرفُ فقدت الفهرسين
-- أصلًا، فعبارةٌ بلا `IF EXISTS` تسقط عليها وتنجح على الجديدة —
-- وترحيلٌ يعمل على قاعدةٍ دون أخرى ليس ترحيلًا.
--
-- والعباراتُ هنا هي مخرَج `migrate diff --from-migrations --to-schema`
-- حرفيًّا — لا مكتوبةً بيد.
ALTER TABLE "Deposit" DROP CONSTRAINT IF EXISTS "Deposit_paymentId_fkey";
ALTER TABLE "Payout" DROP CONSTRAINT IF EXISTS "Payout_sellerId_fkey";
DROP INDEX IF EXISTS "ServiceRequest_sellerId_status_idx";
DROP INDEX IF EXISTS "User_identityStatus_identitySubmittedAt_idx";
ALTER TABLE "Deposit" DROP CONSTRAINT IF EXISTS "Deposit_paymentId_fkey";
ALTER TABLE "Deposit" ADD CONSTRAINT "Deposit_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payout" DROP CONSTRAINT IF EXISTS "Payout_sellerId_fkey";
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

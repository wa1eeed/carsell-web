-- ═══ الخدمة تصل الدفتر ═══
--
-- حسابان جديدان: ما نَدين به للمزوّد، وسعرُه تكلفةً علينا. والقاعدة
-- الضريبية `SERVICE` تجعل المنصّة المورِّد (`supplierIsPlatform`)، فكامل
-- القيمة إيرادٌ وسعرُ المزوّد تكلفةُ بيع — وبدونها يظهر رسمُ خمسين
-- ريالًا ربحًا قدره خمسُ مئة.
ALTER TYPE "LedgerAccount" ADD VALUE IF NOT EXISTS 'PROVIDER_PAYABLE';
ALTER TYPE "LedgerAccount" ADD VALUE IF NOT EXISTS 'PROVIDER_COST';

-- وضريبةُ الطلب لقطةٌ كالرسم: اشتقاقُها من الإجماليّ بالنسبة السارية
-- وقتَ القراءة يُنتج قيدًا لا يطابق ما دُفع متى تغيّرت النسبة.
ALTER TABLE "ServiceRequest" ADD COLUMN "vatAmount" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- والقائم يُملأ بنسبة اليوم (١٥٪) — وهي النسبة التي أُنشئ بها كلُّه،
-- إذ لم تتغيّر منذ بدء المنتج.
UPDATE "ServiceRequest"
SET "vatAmount" = ROUND("amount" - ("amount" / 1.15), 2)
WHERE "vatAmount" = 0;

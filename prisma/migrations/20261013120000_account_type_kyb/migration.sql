-- نوعُ الحساب وحقول المنشأة — KYC وKYB.
--
-- `identityMethod` يحمل `commercial_register` منذ المخطّط الأوّل
-- **ولا كاتب له**: لا شيء في المنتج يعرّف حسابًا بأنه منشأة، فكلّ
-- توثيقٍ يمرّ بمسار الفرد ولو كان صاحبه وكالة.
--
-- ═══ وهو غيرُ `taxStatus` ═══
--
-- ذاك يجيب «أمسجَّلٌ في ضريبة القيمة المضافة؟» وهذا «من أنت؟».
-- ومنشأةٌ دون حدّ التسجيل موجودةٌ في `SellerType` باسم `DEALER_NO_VAT`
-- — فخلطُهما يجعل كلَّ منشأةٍ صغيرة فردًا.
--
-- ═══ والقديم فردٌ بحقّ ═══
--
-- كلُّ حسابٍ قائم سُجِّل بلا سؤالٍ عن نوعه، وكلُّهم وثّقوا بهوية فرد
-- (`manual` برقم هوية) — فالافتراضيّ يصف واقعهم لا يفترضه.
CREATE TYPE "AccountType" AS ENUM ('INDIVIDUAL', 'BUSINESS');

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "accountType" "AccountType" NOT NULL DEFAULT 'INDIVIDUAL';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "businessName" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "crNumber" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "crExpiresAt" TIMESTAMP(3);

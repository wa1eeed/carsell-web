-- ═══ الرسم الإداريّ — منفصلٌ عن الصرف الذي يرافقه ═══
--
-- الرسم الحكوميّ صرفٌ نيابةً عن العميل: يُمرَّر كما هو، ولا ضريبة لنا
-- فيه. والرسم الإداريّ توريدُ خدمةٍ منّا: خاضع للضريبة. ودمجُهما في
-- عمودٍ واحد يُسقط الوصف الأوّل عن المبلغ كلّه.

ALTER TYPE "SupplyType" ADD VALUE IF NOT EXISTS 'ADMIN_FEE';
ALTER TYPE "SupplyType" ADD VALUE IF NOT EXISTS 'DISBURSEMENT';

ALTER TABLE "Service"
  ADD COLUMN "adminFeeEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "adminFee" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- لقطةٌ كـ`amount`: تعديل الرسم لا يمسّ طلبًا قائمًا
ALTER TABLE "ServiceRequest"
  ADD COLUMN "adminFee" DECIMAL(10,2) NOT NULL DEFAULT 0;

ALTER TABLE "PlatformSetting"
  ADD COLUMN "transferAdminFeeEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "transferAdminFee" DECIMAL(10,2) NOT NULL DEFAULT 0;

ALTER TABLE "Order"
  ADD COLUMN "transferAdminFee" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- لا فاتورة أصلًا — وصفٌ يحتاجه صفّ الصرف
ALTER TYPE "InvoiceIssuer" ADD VALUE IF NOT EXISTS 'NONE';

-- ═══ تصحيح وعاء الضريبة على الطلبات القائمة ═══
--
-- كانت `vatAmount` = ١٥/١١٥ من الإجمالي، فتحتسب ضريبةً على قيمة المركبة
-- (مورّدها البائع) وعلى الرسم الحكوميّ (صرفٌ لسنا مورّده). وتركُها يجعل
-- شاشة المالية تُبلغ رقمًا لا يقابله التزام.
UPDATE "Order" o
SET "vatAmount" = ROUND(
  (o."commissionAmount" + o."transferAdminFee")
    * COALESCE((SELECT p."vatPct" FROM "PlatformSetting" p WHERE p.id = 'default'), 15)
    / (100 + COALESCE((SELECT p."vatPct" FROM "PlatformSetting" p WHERE p.id = 'default'), 15)),
  2
);

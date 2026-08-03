-- ═══ رسوم معالجة الدفع — سياسةٌ يضبطها المشغّل ═══
--
-- **توريدٌ منّا لا صرفٌ نيابةً عن العميل**: البوابة تفوتر نحن لا هو،
-- فنحن المدين بها. وتمريرُها إعادةُ تحميلِ تكلفتنا — خاضعة للضريبة،
-- بخلاف رسم المرور الذي العميل مدينٌ به أصلًا.

CREATE TYPE "FeeBearer" AS ENUM ('SELLER', 'BUYER');

ALTER TABLE "PlatformSetting"
  ADD COLUMN "processingFeeEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "processingFeeBearer" "FeeBearer" NOT NULL DEFAULT 'SELLER',
  ADD COLUMN "processingFeePct" DECIMAL(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN "processingFeeFixed" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- لقطةٌ على الطلب: القيمة ومن تحمّلها تبقيان وإن تغيّرت السياسة بعدها
ALTER TABLE "Order"
  ADD COLUMN "processingFee" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "processingFeeBearer" "FeeBearer" NOT NULL DEFAULT 'SELLER';

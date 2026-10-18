-- ═══ صفاتُ المركبة — طلباتُ المالك ٢٠٢٦-١٠-١٨ ═══
--
-- وقِيس قبل البناء فلم يُبنَ ما هو قائم: نظامُ الدفع وعددُ
-- السلندرات وسعةُ المحرك ونوعُ الهيكل والواردُ كلُّها في `Trim`
-- و`Vehicle` منذ بُني المخطّط، ومحرّرُ الأدمن يضبطها.
--
-- وهذا ما نقص:

-- ١ · هيكلان لم يكن لهما وجودٌ في التعداد — **ومعالجُ البيع يعرضهما**
--     في قائمته الاحتياطية (`WAGON` و`CONVERTIBLE`)، فمن اختار
--     أحدهما أرسل قيمةً يردّها الخادم.
ALTER TYPE "BodyType" ADD VALUE IF NOT EXISTS 'CROSSOVER';
ALTER TYPE "BodyType" ADD VALUE IF NOT EXISTS 'CONVERTIBLE';

-- ٢ · والواردُ يُحرّك السعر في هذا السوق، وكان يطوي الأمريكيّ
--     والكوريّ في «وارد وكيل».
ALTER TYPE "VehicleSpec" ADD VALUE IF NOT EXISTS 'AMERICAN';
ALTER TYPE "VehicleSpec" ADD VALUE IF NOT EXISTS 'KOREAN';

-- ٣ · والهجينُ القابل للشحن نوعٌ ثالث: بطاريةٌ تُشحن ومحرّكُ بنزين.
ALTER TYPE "FuelType" ADD VALUE IF NOT EXISTS 'PLUGIN_HYBRID';

-- ٤ · نوعُ التسجيل — تصنيفُ المرور، وهو غيرُ شكل الهيكل: بيك أبٌ
--     واحد قد يكون «خصوصي» أو «نقل خاص»، والفرقُ في اللوحة والرسوم
--     والتأمين لا في الشكل.
CREATE TYPE "RegistrationType" AS ENUM (
  'PRIVATE', 'PRIVATE_TRANSPORT', 'PUBLIC_TRANSPORT',
  'MINIBUS', 'TAXI', 'MOTORCYCLE', 'HEAVY_EQUIPMENT'
);

-- ٥ · وحالُ وثيقةٍ على المركبة — **ولا تُعرض للعلن** (قرار المالك):
--     الفحصُ الدوريّ ورخصةُ السير شأنُ المالك ومن يفحص.
CREATE TYPE "DocumentStatus" AS ENUM ('VALID', 'EXPIRED');

-- ٦ · ومدخلُ الشحن للكهربائية — CCS2 قياسيُّ السعودية.
CREATE TYPE "ChargePort" AS ENUM ('CCS2', 'GBT', 'TYPE2');

ALTER TABLE "Model"   ADD COLUMN "registrationType" "RegistrationType";
ALTER TABLE "Vehicle" ADD COLUMN "registrationType" "RegistrationType";
ALTER TABLE "Vehicle" ADD COLUMN "periodicInspection" "DocumentStatus";
ALTER TABLE "Vehicle" ADD COLUMN "licenseStatus" "DocumentStatus";
ALTER TABLE "Vehicle" ADD COLUMN "batteryKwh" DECIMAL(5,1);
ALTER TABLE "Vehicle" ADD COLUMN "rangeKm" INTEGER;
ALTER TABLE "Vehicle" ADD COLUMN "chargePort" "ChargePort";

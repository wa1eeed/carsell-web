-- نقضُ سجلّ القبول.
--
-- **ويمحو إثباتَ موافقةِ كلّ مستخدم.** لا يُنفَّذ على قاعدةٍ فيها
-- مستخدمون إلا بعد نسخةٍ محقَّقة — فالصفُّ هنا هو الحجّة على أنّ
-- فلانًا قَبِل هذا النصّ بعينه في هذا اليوم.

DROP TABLE IF EXISTS "LegalAcceptance";
ALTER TABLE "LegalDocument" DROP COLUMN IF EXISTS "requiredAtSignup";

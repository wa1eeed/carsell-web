-- ═══ حالُ استخدام المركبة — طلبُ المالك ٢٠٢٦-١٠-١٨ ═══
--
-- والمسجَّلُ غيرُ غير المسجَّل: حادثٌ في نجم يظهر في تقرير «موجز»
-- ويعرفه المشتري مهما قال البائع، وغيرُ المسجَّل لا يظهر — فالتفريقُ
-- إقرارٌ من صاحبه لا وصفٌ للشدّة.
--
-- وعددُ الملّاك يُحرّك السعر: «مالك أول» وصفٌ يبحث عنه المشتري.
--
-- وكلاهما **للمستعملة وحدها**: الجديدةُ لا حوادثَ لها ولا مالكَ سابق.
CREATE TYPE "AccidentStatus" AS ENUM ('NONE', 'REPORTED', 'UNREPORTED');
CREATE TYPE "PreviousOwners" AS ENUM ('FIRST', 'SECOND', 'THREE', 'FOUR', 'MORE_THAN_FOUR');

ALTER TABLE "Vehicle" ADD COLUMN "accidentStatus" "AccidentStatus";
ALTER TABLE "Vehicle" ADD COLUMN "previousOwners" "PreviousOwners";

-- النقض: العمود يحمل بيانًا شخصيًّا مشفّرًا، وحذفه يُسقطه ولا يمسّ مالًا
ALTER TABLE "User" DROP COLUMN IF EXISTS "nationalIdEncrypted";

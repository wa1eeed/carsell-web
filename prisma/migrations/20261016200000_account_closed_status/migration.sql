-- ═══ إغلاقُ الحساب — تجهيلٌ لا محو ═══
--
-- قرار المالك: «يُجهَّل الحساب وتبقى فواتيره وعقوده». فالحال الجديدة
-- `CLOSED` **غيرُ `BANNED`**: ذاك قرارُنا وهذا قرارُه، واللوحة تفرّق.
--
-- و`closedAt` يقول متى — فحسابٌ مجهَّلٌ بلا تاريخٍ لا يُعرف أكان
-- إغلاقًا أم خطأ ترحيل.

ALTER TYPE "UserStatus" ADD VALUE IF NOT EXISTS 'CLOSED';

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "closedAt" TIMESTAMP(3);

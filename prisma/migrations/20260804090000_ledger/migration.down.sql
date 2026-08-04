-- النقض: الدفتر مشتقٌّ من الطلبات والدفعات القائمة، وحذفه لا يفقد مالًا
-- ولا معاملة — يُعاد بناؤه بإعادة ترحيل الأحداث. ولا يُنقض بعد أن يصير
-- مرجعًا محاسبيًّا معتمَدًا: عندها الترحيل إلى الأمام لا إلى الوراء.
DROP TABLE IF EXISTS "LedgerEntry";
DROP TYPE IF EXISTS "LedgerDirection";
DROP TYPE IF EXISTS "LedgerAccount";

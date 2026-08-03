-- القاعدتان: سقف النقل ونافذة الاسترجاع
-- كلّها اختيارية، فالجداول غير الفارغة تمرّ بلا توقّف.
ALTER TABLE "Order"
  ADD COLUMN "transferDeadlineAt"         TIMESTAMP(3),
  ADD COLUMN "transferDeadlineExtendedAt" TIMESTAMP(3),
  ADD COLUMN "transferExtensionReason"    TEXT,
  ADD COLUMN "returnWindowEndsAt"         TIMESTAMP(3);

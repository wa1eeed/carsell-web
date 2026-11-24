-- صنفُ التكامل — كلمةٌ أضيق من الفئة (ترميز A11).
--
-- `category` أربعُ مجموعات، والترميز يضع بجوار كلّ مزوّد كلمةً:
-- حسابُ الضمان وبوابةُ البطاقة كلاهما `PAYMENT`، وأحدهما مسارٌ بنكيّ
-- والآخر بطاقة.

ALTER TABLE "Integration" ADD COLUMN IF NOT EXISTS "kindLabel" TEXT NOT NULL DEFAULT '';

UPDATE "Integration" SET "kindLabel" = v.label
FROM (VALUES
  ('otp_sms','رسائل'), ('nafath','هوية'), ('identity_manual','هوية'),
  ('payments','مدفوعات'), ('moyasar_platform','مدفوعات'),
  ('bank_escrow','بنكي'), ('sarie_payout','بنكي'),
  ('vin_lookup','مركبات'), ('lean','سجل تجاري'), ('mojaz','تقارير'),
  ('traffic_transfer','مرور'),
  ('r2','تخزين'), ('email','بريد'), ('email_marketing','بريد'),
  ('push_mobile','دفع'), ('error_monitoring','مراقبة'),
  ('product_analytics','تحليلات')
) AS v(key, label)
WHERE "Integration"."key" = v.key AND "Integration"."kindLabel" = '';

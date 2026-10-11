-- النقض لا يمسّ `ApprovalKind`: قيمةُ تعدادٍ في PostgreSQL لا تُحذف
-- إلّا بإعادة بناء النوع كلّه، وصفوفٌ قائمة قد تحملها. والقيمة
-- الزائدة بلا كاتب أخفُّ من تعدادٍ يُعاد بناؤه تحت بياناتٍ حيّة.
DROP TABLE IF EXISTS "Payout";
DROP TYPE IF EXISTS "PayoutStatus";

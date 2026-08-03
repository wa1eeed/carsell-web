-- نقض: حقول قرار النزاع.
--
-- **يمسّ المال**: `resolutionAmount` هو مبلغ التسوية الجزئية المنفَّذ على
-- حساب الضمان، و`approvalId` هو الدليل على أن عضوين وافقا عليه.
--
-- **النقض يفقد الأثر لا المال**: المبالغ نُفِّذت على `Escrow` بالفعل، لكن
-- حذف هذه الحقول يمحو لماذا نُفِّذت وبموافقة من. لا تنقضه على قاعدة فيها
-- نزاعات محسومة إلا بعد تصدير:
--
--   \copy (SELECT "id","orderId","resolution","resolutionAmount","approvalId","resolvedBy","resolvedAt" FROM "Dispute" WHERE "resolution" IS NOT NULL) TO 'disputes.csv' CSV HEADER
--
-- و`ApprovalKind` لا يُنقَض: حذف قيمة من تعداد Postgres يتطلّب إعادة بناء
-- النوع كلّه، وقيمةٌ زائدة غير مستعملة لا تضرّ.

ALTER TABLE "Dispute" DROP COLUMN IF EXISTS "approvalId";
ALTER TABLE "Dispute" DROP COLUMN IF EXISTS "resolvedAt";
ALTER TABLE "Dispute" DROP COLUMN IF EXISTS "resolutionAmount";
ALTER TABLE "Dispute" DROP COLUMN IF EXISTS "openedAt";

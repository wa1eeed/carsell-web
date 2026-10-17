-- قيمةُ تعدادٍ لا تُحذف في Postgres وهناك صفوفٌ قد تحملها.
-- والنقضُ هنا حذفُ الطلبات التي تحملها ثمّ إعادةُ بناء التعداد:
DELETE FROM "ApprovalRequest" WHERE "kind" = 'PROVIDER_ADJUSTMENT';

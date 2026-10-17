-- افتراضيٌّ كان في القاعدة ولا يُعلنه المخطّط، و`createService` تعتمد
-- عليه. فأوّلُ مواءمةٍ أسقطت إنشاء الخدمات — والانحرافُ الذي يعمل
-- بالصدفة ينتظر من يُصلح غيره ليظهر.
ALTER TABLE "Service" ALTER COLUMN "includesAr" SET DEFAULT '{}';
ALTER TABLE "Service" ALTER COLUMN "includesEn" SET DEFAULT '{}';

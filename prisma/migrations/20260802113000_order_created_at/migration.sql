-- تاريخ إنشاء الطلب. `stageEnteredAt` يتصفّر عند كل انتقال مرحلة فلا
-- يصلح بديلًا، لكنه أقرب تقدير متاح للصفوف القائمة: الطلب أُنشئ قبل
-- دخوله مرحلته الحالية أو معها، لا بعدها.
ALTER TABLE "Order" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
UPDATE "Order" SET "createdAt" = "stageEnteredAt";

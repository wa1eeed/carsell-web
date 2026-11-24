-- متى أُنجز الطلب فعلًا — وبه تُقاس مدّةُ التنفيذ والتزامُ المزوّد.
-- والصفوفُ القائمة تبقى `NULL`: ما لم يُسجَّل لا يُفبرَك، والمقياس يتخطّاها.
ALTER TABLE "ServiceRequest" ADD COLUMN "completedAt" TIMESTAMP(3);

/**
 * فئات الخدمات — ثابت عرضٍ مفصول عن وحدة `content`.
 *
 * مكوّن العميل يحتاج القائمة ولا يحتاج قاعدة البيانات؛ واستيرادها من
 * وحدة تستورد `db` يجرّ Prisma كلّه إلى حزمة المتصفّح ويُسقط البناء.
 */
export const SERVICE_CATEGORIES = ['PRE_PURCHASE', 'POST_PURCHASE', 'SELLER'] as const;

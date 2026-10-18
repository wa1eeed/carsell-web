/**
 * ميزةٌ كما تصل استمارةَ البائع — **نوعٌ مشترك في ملفٍّ لا يستورد `db`**.
 *
 * حدُّ الخادم/العميل يمرّ عبر الاستيرادات لا التوجيهات: مكوّن
 * `'use client'` يستورد `catalog-options.ts` يجرّ Prisma إلى حزمة
 * المتصفّح ويُسقط البناء.
 */
export type SellFormFeature = {
  key: string;
  nameAr: string;
  nameEn: string;
  /** `SAFETY` · `COMFORT` · `TECH` — وما سواها يلحق بـ«أخرى». */
  group: string;
};

/**
 * ═══ معاينةُ القسط في المتصفّح — نسخةٌ مشروعةٌ بشرطها ═══
 *
 * منضدةُ البيع تُري الموظّفَ القسطَ **قبل أن يوقّع العميل**: «١٢ شهرًا»
 * لا تقول ما يقوله «٦٬٥٤١٫٦٧ شهريًّا». ولا تستطيع استيراد
 * `installmentSchedule` من `money.ts`: الحدُّ يمرّ عبر الاستيرادات،
 * و`money.ts` يستورد `Prisma` فيجرّ العميلَ إلى حزمةٍ لا مكانَ لها في
 * المتصفّح — وبوابةُ `checkClientDbImports` أمسكتها في أوّل تشغيل.
 *
 * **والنسخةُ مشروعةٌ بشرطٍ واحد**: اختبارٌ يقارن ناتجَيهما على حالاتٍ
 * متطرّفة (`tests/installment-preview.test.ts`) — وإلّا فهما نسختان
 * تتباعدان كأيّ نسختين، فتقول الشاشةُ رقمًا ويكتب العقدُ آخر.
 *
 * والقاعدةُ واحدة: القسطُ مقطوعٌ عند الهللة، **والكسرُ على الأخير**.
 */
export type PreviewPlan = { monthly: string; last: string; financed: string };

/** بالهللات، فلا تُقرَّب القسمةُ العشرية مرّتين. */
function halalas(amount: number): number {
  return Math.round(amount * 100);
}

export function previewSchedule(financed: number, months: number): PreviewPlan | null {
  if (!Number.isFinite(financed) || financed <= 0) return null;
  if (!Number.isInteger(months) || months < 1) return null;

  const total = halalas(financed);
  const base = Math.floor(total / months);
  const last = base + (total - base * months);

  return {
    monthly: (base / 100).toFixed(2),
    last: (last / 100).toFixed(2),
    financed: (total / 100).toFixed(2),
  };
}

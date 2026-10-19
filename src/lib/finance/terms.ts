/**
 * ═══ شروطُ التمويل — ثابتٌ مشترك بين الخادم والعميل ═══
 *
 * **وموضعُه ملفٌّ بذاته لأنّ الحدّ يمرّ عبر الاستيرادات لا التوجيهات.**
 * شاشةُ الإعداد تحسب القسطَ لحظيًّا لتُري المشغّل أثرَ ما يكتبه قبل أن
 * يحفظه — فلو استوردت `domain/financing.ts` لجرّت `db` إلى حزمة
 * المتصفّح وأسقطت البناء. (وقع قبلها ثلاثًا: `CategoryFilter`، ومحرّر
 * القوالب، وخيارات المواصفة.)
 *
 * **وسلسلةُ الاستيراد تُقاس لا تُفترض**: `money.ts` يبدو محايدًا وهو
 * يستورد `tax.ts` التي تستورد `db`. فالقاعدةُ هنا نسخةٌ حرّة منها،
 * ويحرس تطابُقَهما اختبار.
 */

export type FinancingSettings = {
  downPaymentPct: number;
  months: number;
  profitRatePct: number;
  minPrice: number;
};

/**
 * الحدودُ تُعلَن مرّةً ويقرؤها الخادمُ والشاشةُ والرسالة — فلا يقول
 * الحقل «بين ٠ و٩٠» ويردّ الخادمُ حدًّا آخر.
 */
export const FINANCING_LIMITS = {
  /** **ودفعةٌ أولى ١٠٠٪ تعني «لا تمويل»**: رأسُ المال صفرٌ والقسط صفر. */
  downPaymentPct: { min: 0, max: 90 },
  months: { min: 6, max: 96 },
  profitRatePct: { min: 0, max: 30 },
  minPrice: { min: 0, max: 1_000_000 },
} as const;

export type FinancingError =
  | 'DOWN_PAYMENT_RANGE'
  | 'MONTHS_RANGE'
  | 'PROFIT_RATE_RANGE'
  | 'MIN_PRICE_RANGE';

export function validateFinancing(input: FinancingSettings): FinancingError[] {
  const errors: FinancingError[] = [];
  const within = (value: number, range: { min: number; max: number }): boolean =>
    Number.isFinite(value) && value >= range.min && value <= range.max;

  if (!within(input.downPaymentPct, FINANCING_LIMITS.downPaymentPct)) {
    errors.push('DOWN_PAYMENT_RANGE');
  }
  if (!Number.isInteger(input.months) || !within(input.months, FINANCING_LIMITS.months)) {
    errors.push('MONTHS_RANGE');
  }
  if (!within(input.profitRatePct, FINANCING_LIMITS.profitRatePct)) {
    errors.push('PROFIT_RATE_RANGE');
  }
  if (!within(input.minPrice, FINANCING_LIMITS.minPrice)) {
    errors.push('MIN_PRICE_RANGE');
  }
  return errors;
}

/**
 * القسطُ التقريبيّ — **والقاعدةُ نفسُها التي في `money.ts`**، منسوخةً
 * هنا لأنّ تلك تجرّ `db`. ويحرس تطابُقَهما اختبارٌ يقارن ناتجَيهما،
 * فنسختان لقاعدة مالٍ لا تتباعدان صامتتين.
 *
 * قرارُ ١٤: قسطٌ ثابت على رأس مالٍ بعد دفعةٍ أولى بنسبة ربحٍ سنوية
 * بسيطة، مقرَّبًا إلى أقرب عشرة — فلا يُقرأ وعدًا بالهللة.
 */
export function monthlyInstalment(
  price: number,
  settings: FinancingSettings,
): number {
  const principal = price * (1 - settings.downPaymentPct / 100);
  const total = principal * (1 + (settings.profitRatePct / 100) * (settings.months / 12));
  return Math.round(total / settings.months / 10) * 10;
}

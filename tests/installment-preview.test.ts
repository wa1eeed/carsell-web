import { describe, expect, it } from 'vitest';
import { previewSchedule } from '@/lib/installment-preview';
import { installmentSchedule } from '@/lib/domain/money';

/**
 * ═══ النسختان تتطابقان أو تتباعدان ═══
 *
 * منضدةُ البيع تحسب القسطَ في المتصفّح لتُريه قبل التوقيع، ولا تستطيع
 * استيراد `money.ts` (يجرّ `Prisma` إلى حزمة المتصفّح). **والنسخةُ
 * مشروعةٌ بشرطٍ واحد: هذا الاختبار** — وإلّا قالت الشاشةُ رقمًا وكتب
 * العقدُ آخر.
 */
const CASES: readonly { financed: number; months: number }[] = [
  /** قسمةٌ لا تنتهي — وكسرُها على الأخير. */
  { financed: 100_000, months: 7 },
  /** هللةٌ واحدة تفرّق. */
  { financed: 1_000.01, months: 3 },
  /** شهرٌ واحد — فالأوّلُ هو الأخير. */
  { financed: 55_555.55, months: 1 },
  /** أقصى المدّة على مبلغٍ كبير. */
  { financed: 980_000.99, months: 60 },
  /** قسمةٌ صحيحة — فلا كسرَ يُحمَّل. */
  { financed: 120_000, months: 12 },
];

describe('previewSchedule مقابل installmentSchedule', () => {
  it.each(CASES)('يطابق الدقيق على $financed / $months', ({ financed, months }) => {
    const exact = installmentSchedule(financed, months);
    const preview = previewSchedule(financed, months);

    expect(preview).not.toBeNull();
    if (preview === null) return;

    expect(preview.monthly).toBe(exact[0]?.toFixed(2));
    expect(preview.last).toBe(exact[exact.length - 1]?.toFixed(2));

    /** **والمجموعُ يساوي المموَّل بالهللة** — وهو شرطُ العقد لا تجميلُه. */
    const zero = exact[0]?.mul(0);
    expect(zero).toBeDefined();
    if (zero === undefined) return;
    const sum = exact.reduce((total, row) => total.add(row), zero);
    expect(sum.toFixed(2)).toBe(preview.financed);
  });

  it('ويرد ما لا يصلح عقدا', () => {
    expect(previewSchedule(0, 12)).toBeNull();
    expect(previewSchedule(1000, 0)).toBeNull();
    expect(previewSchedule(1000, 1.5)).toBeNull();
    expect(previewSchedule(Number.NaN, 12)).toBeNull();
  });
});

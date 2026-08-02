import { Prisma } from '@/generated/prisma/client';

/**
 * حساب المال — **بـ`Decimal` لا بعدد عشري**.
 *
 * القاعدة الوحيدة هنا هي أن قاعدة الضريبة تُكتب مرّة. كانت في
 * `offers.ts` وحدها، وحين احتاجتها A3 صارت على وشك أن تُكتب ثانيةً —
 * ونسختان من قاعدة ضريبية تتباعدان أوّل مرّة تتغيّر النسبة.
 */

export const DEFAULT_VAT_PCT = 15;

/**
 * ═══ قرار ١٧ ═══ **الضريبة مضمَّنة لا مضافة.**
 *
 * السعر المعروض شاملٌ للضريبة، فحصّتها منه `total × 15/115` لا
 * `total × 15/100`. والفرق ليس تقريبًا: على ١١٥٠٠٠ ريال، المضمَّنة
 * ١٥٠٠٠ والمضافة ١٧٢٥٠ — ألفان ومئتان وخمسون ريالًا من فرق في صفقة
 * واحدة، تُدفع من جيب أحدهم.
 */
export function vatIncluded(
  total: Prisma.Decimal | number | string,
  vatPct: Prisma.Decimal | number | string = DEFAULT_VAT_PCT,
): Prisma.Decimal {
  const amount = new Prisma.Decimal(total);
  const pct = new Prisma.Decimal(vatPct);
  return amount.times(pct).dividedBy(pct.plus(100)).toDecimalPlaces(2);
}

/** الصافي قبل الضريبة — المكمّل لـ`vatIncluded`، ومجموعهما الإجمالي بلا فرق قرش. */
export function netOfVat(
  total: Prisma.Decimal | number | string,
  vatPct: Prisma.Decimal | number | string = DEFAULT_VAT_PCT,
): Prisma.Decimal {
  return new Prisma.Decimal(total).minus(vatIncluded(total, vatPct));
}

/** جمعٌ آمن لقائمة مبالغ — `reduce` بـ`+` على `Decimal` يُنتج نصًّا لا رقمًا. */
export function sum(amounts: readonly (Prisma.Decimal | number | string | null)[]): Prisma.Decimal {
  return amounts.reduce<Prisma.Decimal>(
    (total, amount) => (amount === null ? total : total.plus(new Prisma.Decimal(amount))),
    new Prisma.Decimal(0),
  );
}

/**
 * نسبةٌ مئوية بمقام قد يكون صفرًا.
 *
 * القسمة على صفر في `Decimal` **ترمي**، وأوّل شهر بلا صفقات مقامُه صفر.
 * فالصفر هنا حالٌ متوقَّعة لا خطأ.
 */
export function pct(
  part: Prisma.Decimal | number | string,
  whole: Prisma.Decimal | number | string,
): number {
  const denominator = new Prisma.Decimal(whole);
  if (denominator.isZero()) return 0;
  return new Prisma.Decimal(part).dividedBy(denominator).times(100).toDecimalPlaces(2).toNumber();
}

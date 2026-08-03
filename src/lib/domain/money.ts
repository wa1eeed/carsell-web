import { Prisma } from '@/generated/prisma/client';

/**
 * حساب المال — **بـ`Decimal` لا بعدد عشري**.
 *
 * والضريبة ليست هنا: انتقلت إلى `vat.ts` وحدها، فالنسبة تُقرأ من موضع
 * واحد وبوابةٌ تمنع كتابتها في غيره. هذا الملف للحساب الذي لا علاقة
 * له بتصنيف ضريبي — الجمع والنسبة المئوية.
 */
// يُعاد التصدير ليبقى للمستدعين مدخلٌ واحد لا مدخلان
export { DEFAULT_VAT_PCT, netOfVat, vatIncluded } from './vat';


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

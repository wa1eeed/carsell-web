import { Prisma } from '@/generated/prisma/client';

/**
 * ضريبة القيمة المضافة — **النسبة تعيش هنا وحدها**.
 *
 * ولا رقم ١٥ في أي ملف آخر: بوابةٌ تمنعه. والسبب أن التصنيف الضريبي
 * نفسه قد يتغيّر (المهمة ٣٥) — وحين يتغيّر يجب أن يكون هناك **موضع
 * واحد** يُقرأ، لا خمسة عشر موضعًا يُبحث عنها.
 *
 * وهذا الملف **يُدمج في `tax.ts`** حين يُبنى محرّك الضريبة: يومها تصير
 * النسبة صفًّا في `TaxRule` لا ثابتًا هنا، وتُنسَخ لقطةً في الفاتورة.
 */

/** النسبة الحالية. مؤقّتة بطبعها — والمحرّك يحلّ محلّها. */
export const DEFAULT_VAT_PCT = 15;

/**
 * ═══ قرار ١٧ ═══ **الضريبة مضمَّنة لا مضافة.**
 *
 * السعر المعروض شاملٌ للضريبة، فحصّتها منه `total × r/(100+r)` لا
 * `total × r/100`. والفرق ليس تقريبًا: على ١١٥٬٠٠٠ ريال، المضمَّنة
 * ١٥٬٠٠٠ والمضافة ١٧٬٢٥٠ — ألفان ومئتان وخمسون ريالًا في صفقة واحدة،
 * تُدفع من جيب أحدهم.
 *
 * **وهذه الدالّة على العمولة والخدمات — لا على قيمة المركبة.** حساب
 * الضريبة على قيمة المركبة ينتظر التصنيف (المهمة ٣٥)، وبوابةٌ تمنعه.
 */
export function vatIncluded(
  total: Prisma.Decimal | number | string,
  vatPct: Prisma.Decimal | number | string = DEFAULT_VAT_PCT,
): Prisma.Decimal {
  const amount = new Prisma.Decimal(total);
  const rate = new Prisma.Decimal(vatPct);
  return amount.times(rate).dividedBy(rate.plus(100)).toDecimalPlaces(2);
}

/** الصافي قبل الضريبة — ومجموعه مع `vatIncluded` الإجماليُّ بلا فرق قرش. */
export function netOfVat(
  total: Prisma.Decimal | number | string,
  vatPct: Prisma.Decimal | number | string = DEFAULT_VAT_PCT,
): Prisma.Decimal {
  return new Prisma.Decimal(total).minus(vatIncluded(total, vatPct));
}

import { Prisma } from '@/generated/prisma/client';

/**
 * حساب المال — **بـ`Decimal` لا بعدد عشري**.
 *
 * والضريبة ليست هنا: انتقلت إلى `tax.ts` وحدها، فالنسبة تُقرأ من موضع
 * واحد وبوابةٌ تمنع كتابتها في غيره. هذا الملف للحساب الذي لا علاقة
 * له بتصنيف ضريبي — الجمع والنسبة المئوية.
 */
// يُعاد التصدير ليبقى للمستدعين مدخلٌ واحد لا مدخلان
export { DEFAULT_VAT_PCT, netOfVat, vatIncluded } from './tax';


/** جمعٌ آمن لقائمة مبالغ — `reduce` بـ`+` على `Decimal` يُنتج نصًّا لا رقمًا. */
export function sum(amounts: readonly (Prisma.Decimal | number | string | null)[]): Prisma.Decimal {
  return amounts.reduce<Prisma.Decimal>(
    (total, amount) => (amount === null ? total : total.plus(new Prisma.Decimal(amount))),
    new Prisma.Decimal(0),
  );
}

/**
 * ═══ ما يصل البائع — قاعدةٌ واحدة، وثلاثة كانت تتباعد ═══
 *
 * كان لها **صيغتان** تختلفان في المال نفسه:
 *
 *   · `documents.ts` — كشف التسوية الذي يقرؤه البائع:
 *     `المُسوَّى − عمولة − رسم البوابة`
 *   · `seller-book.ts` — صفحة أرباحه ولوحة الإفراج:
 *     `المتّفق − عمولة − ضريبة − رسم نقل − رسم البوابة`
 *
 * فرقُهما **رسمُ النقل والضريبة**، وكلاهما دفعهما المشتري في إجماليه.
 * فكان البائع يُخصم منه ما لم يدفعه: قِيس بعمولة صفر فدفع المشتري
 * ١٠٠٬٣٥٠، وقال كشفُه ١٠٠٬٠٠٠ وقالت صفحةُ أرباحه ٩٩٬٦٥٠.
 *
 * ═══ وثلاثة أشياء تحكم هذه القاعدة ═══
 *
 * **١· بالمُسوَّى لا بالمتّفق.** تسويةٌ جزئية بعد نزاع تُنقص القيمة،
 * و`agreedPrice` يبقى للتدقيق. وقراءتُه بدلها تدفع للبائع ما لم يُتّفق
 * عليه أخيرًا.
 *
 * **٢· عمولة البائع وحدها.** ما يدفعه المشتري من عمولةٍ ليس خصمًا
 * على البائع — وهو الالتباس نفسه بوجهه الثاني.
 *
 * **٣· ولا رسم نقلٍ ولا ضريبة.** الأوّل حكوميّ يُمرَّر ودفعه المشتري
 * فوق السعر، والثانية على توريداتنا لا على توريد البائع.
 */
export function netToSeller(order: {
  agreedPrice: Prisma.Decimal;
  /** ما وقع فعلًا — و`null` تعني أن المتّفق هو الذي وقع */
  settlementAmount?: Prisma.Decimal | null;
  sellerCommission: Prisma.Decimal;
  /** رسم المعالجة حين يتحمّله البائع — وصفرٌ حين يتحمّله المشتري */
  gatewayFee?: Prisma.Decimal | null;
}): Prisma.Decimal {
  const value = order.settlementAmount ?? order.agreedPrice;
  return value
    .minus(order.sellerCommission)
    .minus(order.gatewayFee ?? new Prisma.Decimal(0));
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

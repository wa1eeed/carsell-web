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
import { DEFAULT_VAT_PCT } from './tax';


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
 * **٣· ولا رسمَ نقل — والضريبةُ بقدر ما يخصّه.** الأوّل حكوميّ يُمرَّر
 * ودفعه المشتري فوق السعر. **والثانيةُ كانت مستثناةً كلَّها** لأنّ
 * العمولة كانت شاملةً لها، فخصمُها معها خصمٌ مرّتين. وبعد قرار
 * «فوقها» (٢٠٢٦-١٠-١٧) صار الرسمُ صافيًا والضريبةُ فوقه — فتُخصم
 * **حصّةُ البائع منها** مرّةً واحدة، وتبقى حصّةُ المشتري عليه.
 */
export function netToSeller(order: {
  agreedPrice: Prisma.Decimal;
  /** ما وقع فعلًا — و`null` تعني أن المتّفق هو الذي وقع */
  settlementAmount?: Prisma.Decimal | null;
  sellerCommission: Prisma.Decimal;
  /**
   * ضريبةُ عمولته — **وتُخصم معها** (قرار المالك ٢٠٢٦-١٠-١٧:
   * «فوقها»). والنصُّ أعلاه كان يقول «ولا رسم نقلٍ ولا ضريبة»، وهو
   * صوابُ النموذج القديم (العمولةُ شاملةٌ لضريبتها): لا تُخصم مرّتين.
   *
   * **وفي «فوقها» ليست مخصومةً مرّتين بل مرّة**: الرسمُ صافٍ،
   * والضريبةُ فوقه، ويتحمّلها من وُرِّد إليه. ورسمُ النقل الحكوميّ
   * يبقى خارجها — دفعه المشتري فوق السعر.
   *
   * و`null` لمن لا يمرّر لقطتَه — والصفرُ حين لا عمولةَ على البائع.
   */
  sellerVat?: Prisma.Decimal | null;
  /** رسم المعالجة حين يتحمّله البائع — وصفرٌ حين يتحمّله المشتري */
  gatewayFee?: Prisma.Decimal | null;
}): Prisma.Decimal {
  const value = order.settlementAmount ?? order.agreedPrice;
  return value
    .minus(order.sellerCommission)
    .minus(order.sellerVat ?? new Prisma.Decimal(0))
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

/**
 * إجماليّ خدمة — **السعر صافٍ والضريبة تُضاف فوقه**.
 *
 * بخلاف بيع المركبة: ثَمَّ السعر شاملٌ للضريبة وتُستخرَج منه
 * (`vatIncluded`)، وهنا تُضاف — فخلطُ القاعدتين يُنتج فرق سبعةٍ
 * وستّين ريالًا في كل طلب.
 *
 * **وتُكتب مرّة**: الشاشة تعرض الإجماليّ والشراء يحجزه، وحسابٌ في كل
 * موضعٍ يُنتج قاعدتين تتباعدان أوّل تغيير — فيدفع المشتري غير ما رأى.
 */
export type ServiceFee = {
  /** `FIXED` يقرأ `amount` ريالًا، و`PERCENT` يقرؤه نسبةً من سعر المزوّد */
  mode: 'FIXED' | 'PERCENT';
  amount: Prisma.Decimal | number | string;
  enabled: boolean;
};

export function serviceTotal(
  price: Prisma.Decimal | number | string,
  vatPct: Prisma.Decimal | number | string = DEFAULT_VAT_PCT,
  fee: ServiceFee | null = null,
): {
  /** حصّة المزوّد — سعرُ خدمته كما ضبطه */
  providerNet: Prisma.Decimal;
  /** حصّتنا — تُضاف فوق سعره لا تُقتطع منه */
  platformFee: Prisma.Decimal;
  net: Prisma.Decimal;
  vat: Prisma.Decimal;
  total: Prisma.Decimal;
} {
  const providerNet = new Prisma.Decimal(price).toDecimalPlaces(2);

  /**
   * ═══ ورسمُنا يُضاف فوق سعر المزوّد ═══
   *
   * قرار المالك (٢٠٢٦-١٠-١٤): «رسوم المنصّة … تفرضه المنصّة على خدمة
   * المزوّد **وتُضاف عليه**». فالمزوّد يقبض سعرَه كاملًا، والعميل يدفع
   * السعر والرسم — واقتطاعُه من سعره يجعل كل رفعٍ لرسمنا خفضًا لدخله
   * بلا أن يُسأل.
   *
   * **وكان الرسم يُضبط ولا يُحصَّل**: `adminFeeEnabled` و`adminFee`
   * في `Service` ولهما محرّرٌ كامل في اللوحة، **وصفرُ قرّاءٍ في مسار
   * الشراء** — فيُفعّله المشغّل ويُسعّره ولا يدخل ريالٌ منه.
   */
  const platformFee =
    fee === null || !fee.enabled
      ? new Prisma.Decimal(0)
      : fee.mode === 'PERCENT'
        ? providerNet.times(new Prisma.Decimal(fee.amount)).dividedBy(100).toDecimalPlaces(2)
        : new Prisma.Decimal(fee.amount).toDecimalPlaces(2);

  const net = providerNet.plus(platformFee);
  const vat = net.times(new Prisma.Decimal(vatPct)).dividedBy(100).toDecimalPlaces(2);
  return { providerNet, platformFee, net, vat, total: net.plus(vat) };
}

/**
 * ═══ القسطُ التقريبيّ — قاعدةُ مالٍ تُكتب مرّة ═══
 *
 * كانت **مكتوبةً مرّتين** حرفًا بحرف: نسخةٌ محلّية في `listings.ts`
 * وأخرى مصدَّرة في `listing-detail.ts`. ونسختان لقاعدة مالٍ تتباعدان
 * أوّلَ تغيير — فتقول بطاقةُ البحث «١٬٩٠٠ شهريًّا» وصفحةُ السيارة
 * «٢٬١٤٠» للسيارة نفسها، ولا شيء يقول أيُّهما الصواب.
 *
 * **وخطرُها ازداد يوم صارت مدخلاتُها تُحرَّر من اللوحة**: من يغيّر
 * نسبةَ الربح يغيّر نصفَ الشاشات لا كلَّها.
 *
 * وهي قرارُ ١٤: قسطٌ ثابت على رأس مالٍ بعد دفعةٍ أولى، بنسبة ربحٍ
 * سنوية بسيطة — حسابٌ محلّيّ بلا استدعاء مموّل، ويُقرَّب إلى أقرب
 * عشرة فلا يُقرأ وعدًا بالهللة.
 */
export function monthlyPayment(
  price: number,
  downPct: number,
  months: number,
  ratePct: number,
): number {
  const principal = price * (1 - downPct / 100);
  const total = principal * (1 + (ratePct / 100) * (months / 12));
  return Math.round(total / months / 10) * 10;
}

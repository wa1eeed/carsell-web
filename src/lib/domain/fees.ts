import { Prisma } from '@/generated/prisma/client';
import { DEFAULT_VAT_PCT, vatIncluded } from './tax';

/**
 * ═══ الرسم المُمرَّر والرسم الإداريّ — ولا يُدمجان ═══
 *
 * كثيرٌ من خدماتنا يرافقها مبلغ **لسنا نحن مورّده**: رسم نقل الملكية
 * للمرور، أجر مقدّم فحصٍ مستقلّ. وهذا **صرفٌ نيابةً عن العميل**: نحن
 * وكيلٌ يدفع ويسترد، والعميل هو المدين به أصلًا. فلا ضريبة لنا فيه،
 * ولا يدخل فاتورتنا.
 *
 * وما نأخذه نحن مقابل تولّي الإجراء **رسمٌ إداريّ**: توريدُ خدمةٍ منّا،
 * خاضع للضريبة كأيّ خدمة.
 *
 * ═══ ولماذا حقلان لا حقلٌ واحد ═══
 *
 * وصف «الصرف» مشروطٌ بأن يُمرَّر المبلغ **كما هو بلا زيادة**. فلو رفعنا
 * الـ٣٥٠ إلى ٤٠٠ وقلنا «رسوم نقل» سقط الوصف عن المبلغ كلّه، وصار
 * الأربعمئة توريدًا منّا تُستحقّ الضريبة على كامله — لا على الخمسين.
 *
 * فالفصل هنا ليس ترتيبًا للعرض بل **شرط صحّة التصنيف**، ولذلك هو
 * حقلان في المخطّط لا حقلٌ يُجمَع فيه رقمان. `assertNoMarkup` تحرس
 * الشرط، ولا يُبنى مسارٌ يجمعهما قبل التخزين.
 *
 * ⚠️ التصنيف النهائيّ للمستشار الضريبيّ — `docs/tax-model.md` § ١٠.
 */

export type ChargeKind =
  /** صرفٌ نيابةً عن العميل — خارج نطاق فاتورتنا */
  | 'DISBURSEMENT'
  /** توريدٌ منّا — خاضع للضريبة */
  | 'PLATFORM_FEE';

export type ChargeLine = {
  key: string;
  kind: ChargeKind;
  amount: Prisma.Decimal;
  /** ضريبة هذا السطر — صفرٌ للصرف دائمًا، لا «لم تُحسب بعد» */
  tax: Prisma.Decimal;
};

/**
 * **المبلغ المُمرَّر يساوي مصدره حرفيًّا.**
 *
 * وهذا ليس تحقّقًا من مدخلات بل حراسةٌ لتصنيفٍ ضريبيّ: زيادةٌ قدرها
 * ريال واحد تنقل المبلغ كلّه من «خارج النطاق» إلى «خاضع بالكامل».
 * فترمي بدل أن تُصحّح — لأن التصحيح الصامت هنا يُخفي ما يجب أن يُرى.
 */
export function assertNoMarkup(charged: Prisma.Decimal, source: Prisma.Decimal): void {
  if (!charged.equals(source)) {
    throw new Error(
      `Disbursement must be passed through unchanged: charged ${charged.toString()} against ${source.toString()}.`,
    );
  }
}

/**
 * سطرا الرسم لإجراءٍ واحد.
 *
 * والرسم الإداريّ **شامل للضريبة** كسائر أسعار المنصّة (١٥/١١٥): ما
 * يُدخله المشغّل هو ما يدفعه العميل، والشاشة تقولها له صراحةً. وخلاف
 * ذلك يجعل رقم الإعداد رقمًا ثالثًا لا يراه أحد.
 */
export function feeLines(
  input: {
    passThroughKey: string;
    passThrough: Prisma.Decimal | number | string;
    adminFeeKey: string;
    adminFeeEnabled: boolean;
    adminFee: Prisma.Decimal | number | string;
  },
  ratePct: number = DEFAULT_VAT_PCT,
): ChargeLine[] {
  const lines: ChargeLine[] = [];

  const passThrough = new Prisma.Decimal(input.passThrough);
  if (passThrough.greaterThan(0)) {
    lines.push({
      key: input.passThroughKey,
      kind: 'DISBURSEMENT',
      amount: passThrough,
      // صفرٌ **قرارًا** لا نقصًا في الحساب
      tax: new Prisma.Decimal(0),
    });
  }

  const adminFee = new Prisma.Decimal(input.adminFee);
  if (input.adminFeeEnabled && adminFee.greaterThan(0)) {
    lines.push({
      key: input.adminFeeKey,
      kind: 'PLATFORM_FEE',
      amount: adminFee,
      tax: vatIncluded(adminFee, ratePct),
    });
  }

  return lines;
}

/** الرسم الإداريّ المستحقّ — **صفرٌ ما دام معطَّلًا**، مهما كانت قيمته. */
export function effectiveAdminFee(source: {
  adminFeeEnabled: boolean;
  adminFee: Prisma.Decimal | number | string;
}): Prisma.Decimal {
  return source.adminFeeEnabled ? new Prisma.Decimal(source.adminFee) : new Prisma.Decimal(0);
}

/**
 * ═══ وعاء ضريبتنا ═══
 *
 * **توريداتنا وحدها**: العمولة والرسوم الإدارية. ولا تدخله قيمة
 * المركبة — مورّدها البائع، وأكثر الحالات اليوم بلا فاتورة مركبة
 * أصلًا (`docs/tax-model.md` § ٥) — ولا الرسم الحكوميّ الممرَّر.
 *
 * وهذا يُصحّح ما كان: `vatIncluded` على الإجمالي كلّه كانت تُدخل
 * المركبةَ والرسمَ الحكوميّ في وعاءٍ ليسا منه.
 */
export function ourTaxableBase(order: {
  commissionAmount: Prisma.Decimal | number | string;
  transferAdminFee: Prisma.Decimal | number | string;
  processingFee?: Prisma.Decimal | number | string;
}): Prisma.Decimal {
  return new Prisma.Decimal(order.commissionAmount)
    .plus(new Prisma.Decimal(order.transferAdminFee))
    .plus(new Prisma.Decimal(order.processingFee ?? 0));
}

export function ourVat(
  order: {
    commissionAmount: Prisma.Decimal | number | string;
    transferAdminFee: Prisma.Decimal | number | string;
    processingFee?: Prisma.Decimal | number | string;
  },
  ratePct: number = DEFAULT_VAT_PCT,
): Prisma.Decimal {
  return vatIncluded(ourTaxableBase(order), ratePct);
}

/**
 * ═══ رسوم معالجة الدفع — سياسةٌ لا تكلفة ═══
 *
 * **وهي توريدٌ منّا لا صرفٌ نيابةً عن العميل.** الفرق عن رسم المرور
 * جوهريّ: هناك العميل هو المدين والمرور يُصدر له، وهنا **البوابة تفوتر
 * نحن**. فتمريرُها إلى أيّ من الطرفين إعادةُ تحميلِ تكلفتنا — أي خدمةٌ
 * نورّدها، خاضعة للضريبة بالكامل.
 *
 * ولذلك **لا `assertNoMarkup` عليها**: الزيادة فوق تكلفتنا مسموحة ولا
 * تُغيّر تصنيفًا، لأن التصنيف «توريدُنا» من الأصل.
 */
export type ProcessingFeePolicy = {
  processingFeeEnabled: boolean;
  processingFeeBearer: 'SELLER' | 'BUYER';
  processingFeePct: Prisma.Decimal | number | string;
  processingFeeFixed: Prisma.Decimal | number | string;
};

/**
 * `نسبة × قيمة البيع + ثابت` — **والاثنان يجتمعان**.
 *
 * فترك أحدهما صفرًا يُنتج الصيغة المفردة، ولا حاجة إلى راية ثالثة تقول
 * «أيّهما»: صفرٌ في أحدهما هو الجواب.
 */
export function processingFeeFor(
  policy: ProcessingFeePolicy,
  saleValue: Prisma.Decimal | number | string,
): Prisma.Decimal {
  if (!policy.processingFeeEnabled) return new Prisma.Decimal(0);

  const pct = new Prisma.Decimal(policy.processingFeePct).dividedBy(100);
  const fixed = new Prisma.Decimal(policy.processingFeeFixed);
  return new Prisma.Decimal(saleValue).times(pct).plus(fixed).toDecimalPlaces(2);
}

/** ما يُضاف إلى إجمالي المشتري — صفرٌ حين يتحمّلها البائع. */
export function processingFeeOnBuyer(
  policy: ProcessingFeePolicy,
  saleValue: Prisma.Decimal | number | string,
): Prisma.Decimal {
  return policy.processingFeeBearer === 'BUYER'
    ? processingFeeFor(policy, saleValue)
    : new Prisma.Decimal(0);
}

/**
 * ما يُخصم من مستحقّ البائع — صفرٌ حين يتحمّلها المشتري.
 *
 * **ولا يُخصم ما دُفع.** لو خُصم من البائع ما أضافه المشتري لأخذناها
 * مرّتين، وهو أخطر ما في هذين الحقلين: كلٌّ منهما صحيحٌ وحده.
 */
export function processingFeeOnSeller(
  order: { processingFee: Prisma.Decimal | number | string; processingFeeBearer: 'SELLER' | 'BUYER' },
): Prisma.Decimal {
  return order.processingFeeBearer === 'SELLER'
    ? new Prisma.Decimal(order.processingFee)
    : new Prisma.Decimal(0);
}

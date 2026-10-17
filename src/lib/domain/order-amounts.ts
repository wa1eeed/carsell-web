import { Prisma } from '@/generated/prisma/client';
import type { FeeBearer } from '@/generated/prisma/enums';
import type { db } from '@/lib/db';
import { supplyVatPct, vatAdded } from './tax';
import { effectiveAdminFee, processingFeeFor } from './fees';

/**
 * ═══ مبالغ الطلب — **قاعدةٌ واحدة لكل مصادر الطلب** ═══
 *
 * الطلب يُنشأ من ثلاثة مسارات: بيعٌ مباشر، وقبولُ عرض، ورسوّ مزاد.
 * وحسابُ العمولة والرسوم والضريبة واحدٌ فيها جميعًا — فنسخُه في كل
 * مسار يُنتج ثلاث قواعد تتباعد أوّل تغيير، والفرق يظهر في فاتورة.
 *
 * وكان محسوبًا داخل `acceptOffer` وحده. أُخرج هنا حين احتاجه البيع
 * المباشر، **قبل** أن يُنسخ لا بعده.
 */

export type OrderAmounts = {
  agreedPrice: Prisma.Decimal;
  /** نسبة عمولة **البائع** — ونسبة المشتري تُقرأ من `CommissionRule` عند العرض */
  commissionPct: Prisma.Decimal;
  /** مجموع عمولتَي الطرفين — إيرادنا، وعليه تُحسب الضريبة */
  commissionAmount: Prisma.Decimal;
  /** تُضاف إلى ما يدفعه المشتري */
  buyerCommission: Prisma.Decimal;
  /** تُخصم ممّا يستلمه البائع */
  sellerCommission: Prisma.Decimal;
  /** حكوميّ يُمرَّر كما هو — لا ضريبة لنا فيه */
  transferFee: Prisma.Decimal;
  /** رسمنا الإداريّ — سطرٌ مستقلّ دائمًا */
  transferAdminFee: Prisma.Decimal;
  processingFee: Prisma.Decimal;
  processingFeeBearer: FeeBearer;
  /** ضريبة توريداتنا وحدها — ومجموعُ حصّتَي الطرفين */
  vatAmount: Prisma.Decimal;
  /**
   * ═══ ويتحمّلها من يُورَّد إليه ═══
   *
   * قرار المالك (٢٠٢٦-١٠-١٧): «فوقها» — فالضريبةُ تُضاف فوق الرسم،
   * **والمشتري يتحمّل ضريبةَ ما وُرِّد إليه** (عمولتُه ورسمُنا
   * الإداريّ ورسمُ المعالجة حين يتحمّله)، والبائعُ ضريبةَ عمولته.
   *
   * وخلطُهما في رقمٍ واحد كان يُنتج القسمة الخاطئة نفسَها التي
   * أُصلحت في العمولة: يُضاف المجموع إلى المشتري **ويُخصم المجموع**
   * من البائع.
   */
  buyerVat: Prisma.Decimal;
  sellerVat: Prisma.Decimal;
  totalAmount: Prisma.Decimal;
};

type Reader = Pick<typeof db, 'platformSetting' | 'commissionRule'>;

type Rule = {
  pct: Prisma.Decimal;
  fixedFee: Prisma.Decimal;
  minFee: Prisma.Decimal | null;
  maxFee: Prisma.Decimal | null;
};

/**
 * نسبةٌ **ومبلغٌ ثابت** معًا، بحدَّين.
 *
 * والحساب واحدٌ للطرفين — فكتابتُه مرّتين تجعل حدًّا أدنى يُضاف لأحدهما
 * ويُنسى للآخر، ولا يظهر الفرق إلا في صفقةٍ صغيرة.
 */
/**
 * العمولة من قاعدةٍ وسعر — **وهي القاعدة الوحيدة**.
 *
 * تُصدَّر كي يستعملها محاكي A29: محاكاةٌ تُعيد حسابها بنفسها تُنتج
 * قاعدةً ثانية، فيقول المحاكي رقمًا ويكتب الطلبُ غيره.
 */
/**
 * ═══ أحدثُ قاعدةٍ سارية لطرفٍ بعينه ═══
 *
 * **والتصفية بـ`enabled` تقع هنا لا في الاستعلام.** والقواعد تُضاف
 * ولا تُعدَّل — لأن الطلب يخزّن نسبته وقت إنشائه — فتعطيلُ عمولةٍ
 * يكتب صفًّا جديدًا بـ`enabled: false`. ولو صفّى الاستعلام لسقط على
 * **القاعدة الأقدم المفعَّلة**، فيُعطَّل الرسم فيعود من تلقاء نفسه
 * بنسبةٍ قديمة، ولا شيء يقول إن التعطيل لم يقع.
 *
 * **وتُصدَّر لأنّ صفحة المركبة تُسعّر بها أيضًا**: كانت تقرأ
 * `findFirst` بلا طرفٍ ولا `enabled`، فتأخذ أحدثَ قاعدةٍ أيًّا كان
 * طرفُها وتضيفها إلى ما يدفعه المشتري — **فيُقتبَس له عمولةُ البائع**.
 * وصفرٌ أخفى ذلك كلَّه.
 *
 * والقائمةُ مرتَّبةٌ تنازليًّا بـ`activeFrom` — وهو شرطُ الدالّة.
 */
export function activeRule(
  rules: readonly (Rule & { side: string; enabled: boolean })[],
  side: 'BUYER' | 'SELLER',
): Rule | null {
  const rule = rules.find((row) => row.side === side);
  return rule === undefined || !rule.enabled ? null : rule;
}

export function commissionFrom(rule: Rule | null, price: number): number {
  if (rule === null) return 0;
  const raw = (price * Number(rule.pct)) / 100 + Number(rule.fixedFee);
  const bounded = Math.min(
    Math.max(raw, Number(rule.minFee ?? 0)),
    Number(rule.maxFee ?? Number.MAX_SAFE_INTEGER),
  );

  /**
   * ═══ والمالُ يُقرَّب حيث يُحسب لا حيث يُخزَّن ═══
   *
   * ٤٤٬١٣٥ بنسبة ٢٫٥٪ = **١٬١٠٣٫٣٧٥** — وهو ليس مبلغًا بالهللات.
   * وكان يُمرَّر خامًّا: يُشتقّ منه صافي البائع فيصير ٤٢٬٨٨٧٫٧٠٥،
   * ثمّ **يقرّب العمودُ كلَّ رقمٍ على حدة** — ١٬١٠٣٫٣٨ و٤٢٬٨٨٧٫٧١ —
   * **فيختلّ القيد بهللةٍ واحدة** ولا يعود مزدوجًا.
   *
   * وهي القاعدة المسجَّلة في CLAUDE.md بعينها: «مدينٌ ٥١٧٫٥٠ يُكتب
   * ٥١٨ ودائناه … فيتوازن الصفّان بحظّ التقريب» — وهنا لم يُسعفه
   * الحظّ. **ولم تظهر ما دامت النسبةُ صفرًا.**
   *
   * و`vatIncluded` تُقرّب منذ كُتبت، فكان طرفٌ مقرَّبًا وطرفٌ لا.
   */
  return new Prisma.Decimal(bounded).toDecimalPlaces(2).toNumber();
}

/**
 * يقبل `tx` أو `db` — فيُحسب داخل معاملة الإنشاء لا قبلها.
 *
 * والقراءة داخل المعاملة تجعل اللقطة متّسقة: قاعدة عمولةٍ تتغيّر بين
 * القراءة والكتابة تُنتج طلبًا بنسبةٍ لم تكن سارية في أيٍّ من اللحظتين.
 */
export async function computeOrderAmounts(
  reader: Reader,
  price: number,
  now: Date = new Date(),
): Promise<OrderAmounts> {
  const [platform, rules] = await Promise.all([
    reader.platformSetting.findUnique({ where: { id: 'default' } }),
    reader.commissionRule.findMany({
      where: { scope: 'global', activeFrom: { lte: now } },
      orderBy: { activeFrom: 'desc' },
    }),
  ]);

  /**
   * أحدث قاعدةٍ سارية **لكل طرف على حدة**.
   *
   * **والتصفية بـ`enabled` تقع هنا لا في الاستعلام.** والقواعد تُضاف
   * ولا تُعدَّل — لأن الطلب يخزّن نسبته وقت إنشائه — فتعطيلُ عمولةٍ
   * يكتب صفًّا جديدًا بـ`enabled: false`. ولو صفّى الاستعلام لسقط على
   * **القاعدة الأقدم المفعَّلة**، فيُعطَّل الرسم فيعود من تلقاء نفسه
   * بنسبةٍ قديمة، ولا شيء يقول إن التعطيل لم يقع.
   */
  const sellerRule = activeRule(rules, 'SELLER');
  const buyerRule = activeRule(rules, 'BUYER');

  const sellerCommission = commissionFrom(sellerRule, price);
  const buyerCommission = commissionFrom(buyerRule, price);
  const commissionPct = sellerRule === null ? 0 : Number(sellerRule.pct);
  const commissionAmount = sellerCommission + buyerCommission;

  /**
   * رسم النقل **حكوميّ يُمرَّر كما هو** — صرفٌ نيابةً عن العميل. ورسمنا
   * الإداريّ سطرٌ ثانٍ مستقلّ، لأن دمجهما يُسقط وصف الصرف عن المبلغ كلّه
   * فتُستحقّ الضريبة على كامله.
   */
  const transferFee = Number(platform?.transferFee ?? 0);
  const transferAdminFee = effectiveAdminFee({
    adminFeeEnabled: platform?.transferAdminFeeEnabled ?? false,
    adminFee: platform?.transferAdminFee ?? 0,
  });

  /**
   * رسوم المعالجة **تُضاف للمشتري أو تُخصم من البائع، لا كليهما**.
   * فما يدخل الإجمالي صفرٌ حين يتحمّلها البائع، وخصمُه يقع في كشف
   * التسوية من مستحقّه.
   */
  const processingFee = processingFeeFor(
    platform ?? {
      processingFeeEnabled: false,
      processingFeeBearer: 'SELLER',
      processingFeePct: 0,
      processingFeeFixed: 0,
    },
    price,
  );
  const processingFeeBearer = platform?.processingFeeBearer ?? 'SELLER';
  const buyerShare = processingFeeBearer === 'BUYER' ? Number(processingFee) : 0;

  /**
   * **ما يدفعه المشتري — بعمولته هو وحدها.**
   *
   * كان يُضاف `commissionAmount` كلّه هنا **ويُخصم كلّه** من صافي
   * البائع في كشف التسوية: عمولةٌ معلنة ٢٬٥٠٠ تأخذ ٥٬٠٠٠، بلا حقلٍ
   * يقول أيّهما قُصد. فالآن ما يُضاف هنا هو `buyerCommission`، وما
   * يُخصم هناك `sellerCommission` — ومجموعهما إيرادنا.
   */
  const vatPct = await supplyVatPct('COMMISSION', now);

  /**
   * ═══ وضريبةُ كلّ طرفٍ على ما وُرِّد إليه ═══
   *
   * المشتري: عمولتُه ورسمُنا الإداريّ (يُضاف إلى إجماليّه) ورسمُ
   * المعالجة حين يتحمّله. والبائع: عمولتُه ورسمُ المعالجة حين
   * يتحمّله هو.
   *
   * **والحكوميُّ خارجَهما**: صرفٌ نيابةً عن العميل، لسنا مورّده.
   */
  const buyerVat = vatAdded(
    new Prisma.Decimal(buyerCommission).plus(transferAdminFee).plus(buyerShare),
    vatPct,
  );
  const sellerVat = vatAdded(
    new Prisma.Decimal(sellerCommission).plus(
      processingFeeBearer === 'SELLER' ? Number(processingFee) : 0,
    ),
    vatPct,
  );

  /**
   * **وما يدفعه المشتري يضمّ ضريبتَه هو** — ولا ضريبةَ البائع.
   * وكانت الضريبةُ لا تدخل إجماليَّه أصلًا لأنها كانت مضمَّنةً في
   * الرسم.
   */
  const total =
    price +
    buyerCommission +
    Number(buyerVat) +
    transferFee +
    Number(transferAdminFee) +
    buyerShare;

  /**
   * الضريبة على **توريداتنا وحدها** — العمولة والرسوم الإدارية ورسوم
   * المعالجة. ولا تدخلها قيمة المركبة (مورّدها البائع) ولا الرسم
   * الحكوميّ (لسنا مورّده).
   */
  /**
   * **والنسبةُ من قاعدتها لا من رقمٍ ثانٍ.** `/admin/tax` تعدّل
   * `ratePct` و`active` لقاعدة `COMMISSION`، وكان هذا السطر يقرأ
   * `PlatformSetting.vatPct` — رقمًا لا تلمسه تلك الشاشة. وقِيس:
   * ضُبطت القاعدة صفرًا فبقي الطلب يحسب ٣٢٦٫٠٩، **فزرُّ التعطيل بلا
   * أثر على المال**.
   *
   * وتعطيلُ القاعدة يُصفّر النسبة، وهو ما طلب المالك أن يعمل.
   */
  /** ومجموعُهما هو ضريبةُ توريداتنا — يُقرأ في الفاتورة والدفتر */
  const vatAmount = buyerVat.plus(sellerVat);

  return {
    agreedPrice: new Prisma.Decimal(price),
    commissionPct: new Prisma.Decimal(commissionPct),
    commissionAmount: new Prisma.Decimal(commissionAmount),
    buyerCommission: new Prisma.Decimal(buyerCommission),
    sellerCommission: new Prisma.Decimal(sellerCommission),
    transferFee: new Prisma.Decimal(transferFee),
    transferAdminFee,
    processingFee,
    processingFeeBearer,
    vatAmount,
    buyerVat,
    sellerVat,
    totalAmount: new Prisma.Decimal(total),
  };
}

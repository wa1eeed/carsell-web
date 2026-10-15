import { Prisma } from '@/generated/prisma/client';
import type { db } from '@/lib/db';
import { postEntries, type PostResult } from './ledger';

/**
 * ═══ لحظات المال الأربع، وقيدُ كلٍّ منها ═══
 *
 * **موضعٌ واحد يترجم الحدث إلى قيد.** ولو تُرك لكل مستدعٍ أن يبني
 * قيوده لتباعدت الصيغ، وصار سؤال «كيف يُحتسب الإيراد؟» له جوابان.
 *
 * والأمثلة بأرقام صفقةٍ حقيقية (١٬٠٠٠ ريال · عمولة ١٠٪ · ضريبتها ١٥٪ ·
 * رسوم بوابة ٢٠ على البائع) — وهي المثال الذي اتُّفق عليه.
 */

type Writer = Pick<typeof db, 'ledgerEntry'>;

const zero = new Prisma.Decimal(0);
const d = (value: Prisma.Decimal | number | string): Prisma.Decimal =>
  value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);

export type OrderMoney = {
  orderId: string;
  paymentId?: string | null;
  buyerId: string;
  sellerId: string;
  /** ما يدفعه المشتري كاملًا */
  total: Prisma.Decimal | number | string;
  commission: Prisma.Decimal | number | string;
  /** ضريبة توريداتنا وحدها — لا ضريبة على قيمة المركبة */
  vat: Prisma.Decimal | number | string;
  /** رسم حكوميّ يُمرَّر — لا إيراد ولا مصروف */
  govtFee: Prisma.Decimal | number | string;
  /** رسم البوابة، يتحمّله البائع */
  gatewayFee?: Prisma.Decimal | number | string;
};

/**
 * ═══ ١· دفع المشتري وحُجز المبلغ لدى المزوّد ═══
 *
 * ```
 *   مدين   ESCROW_AT_PROVIDER   ١٬٠٠٠
 *   دائن   BUYER_ADVANCE        ١٬٠٠٠
 * ```
 *
 * **ولا إيراد بعد.** المبلغ قُبض ولم يُستحقّ: الخدمة لم تكتمل، ونافذة
 * الإرجاع لم تنقضِ. واعترافُ الإيراد عند القبض يُظهر أرباحًا تُردّ
 * نصفها الشهر القادم.
 */
export async function recordOrderPaid(
  writer: Writer,
  input: Pick<OrderMoney, 'orderId' | 'paymentId' | 'buyerId' | 'total'>,
  now: Date = new Date(),
): Promise<PostResult> {
  return postEntries(
    writer,
    {
      event: 'order.paid',
      orderId: input.orderId,
      paymentId: input.paymentId ?? null,
      postings: [
        { account: 'ESCROW_AT_PROVIDER', direction: 'DEBIT', amount: input.total },
        {
          account: 'BUYER_ADVANCE',
          direction: 'CREDIT',
          amount: input.total,
          userId: input.buyerId,
        },
      ],
    },
    now,
  );
}

/**
 * ═══ ٢· استُحقّ المبلغ — نُقلت الملكية وأُكّد الاستلام ═══
 *
 * ```
 *   مدين   BUYER_ADVANCE          ١٬٠٠٠
 *   دائن   SELLER_PAYABLE           ٨٦٥
 *   دائن   PLATFORM_REVENUE         ١٠٠
 *   دائن   VAT_PAYABLE               ١٥
 *   دائن   GATEWAY_FEES_CLEARING     ٢٠
 * ```
 *
 * **وهنا وحده يُعترف بالإيراد.** والشروط الثلاثة (النقل · النافذة ·
 * ألّا نزاع) تقولها `settleGuard` — ولا تُعاد كتابتها هنا: شرطان
 * يُكتبان مرّتين يتباعدان أوّل تعديل، فيصير للسؤال الواحد جوابان.
 *
 * ورسم النقل الحكوميّ يمرّ في حسابه: لا يزيد إيرادنا ولا ينقص.
 */
export async function recordOrderEarned(
  writer: Writer,
  input: OrderMoney,
  now: Date = new Date(),
): Promise<PostResult> {
  const total = d(input.total);
  const commission = d(input.commission);
  const vat = d(input.vat);
  const govtFee = d(input.govtFee);
  const gatewayFee = d(input.gatewayFee ?? 0);

  // صافي البائع هو الباقي — يُشتقّ ولا يُمرَّر، فلا يصل رقمٌ لا يتوازن
  const netToSeller = total.minus(commission).minus(vat).minus(govtFee).minus(gatewayFee);

  return postEntries(
    writer,
    {
      event: 'order.earned',
      orderId: input.orderId,
      paymentId: input.paymentId ?? null,
      postings: [
        {
          account: 'BUYER_ADVANCE',
          direction: 'DEBIT',
          amount: total,
          userId: input.buyerId,
        },
        {
          account: 'SELLER_PAYABLE',
          direction: 'CREDIT',
          amount: netToSeller,
          userId: input.sellerId,
        },
        { account: 'PLATFORM_REVENUE', direction: 'CREDIT', amount: commission },
        ...(vat.equals(zero)
          ? []
          : [{ account: 'VAT_PAYABLE' as const, direction: 'CREDIT' as const, amount: vat }]),
        ...(govtFee.equals(zero)
          ? []
          : [
              {
                account: 'GOVT_FEES_CLEARING' as const,
                direction: 'CREDIT' as const,
                amount: govtFee,
              },
            ]),
        ...(gatewayFee.equals(zero)
          ? []
          : [
              {
                account: 'GATEWAY_FEES_CLEARING' as const,
                direction: 'CREDIT' as const,
                amount: gatewayFee,
              },
            ]),
      ],
    },
    now,
  );
}

/**
 * ═══ ٣· حُوِّل للبائع ═══
 *
 * ```
 *   مدين   SELLER_PAYABLE   ٨٦٥
 *   دائن   ESCROW_AT_PROVIDER  ٨٦٥
 * ```
 *
 * **وبه يُصفَّر حقّه.** وما لم يُكتب هذا القيد يبقى `SELLER_PAYABLE`
 * موجبًا إلى الأبد، فيقرأ البائع أن له مالًا وقد وصله.
 */
export async function recordSellerPayout(
  writer: Writer,
  input: { orderId?: string | null; sellerId: string; amount: Prisma.Decimal | number | string; note?: string },
  now: Date = new Date(),
): Promise<PostResult> {
  return postEntries(
    writer,
    {
      event: 'payout.sent',
      orderId: input.orderId ?? null,
      postings: [
        {
          account: 'SELLER_PAYABLE',
          direction: 'DEBIT',
          amount: input.amount,
          userId: input.sellerId,
          ...(input.note === undefined ? {} : { note: input.note }),
        },
        { account: 'ESCROW_AT_PROVIDER', direction: 'CREDIT', amount: input.amount },
      ],
    },
    now,
  );
}

/**
 * ═══ ٤· رُدّ للمشتري ═══
 *
 * قبل الاستحقاق يُردّ من `BUYER_ADVANCE` مباشرةً — لم يُعترف بإيراد
 * فلا شيء يُعكَس. وبعده يُعكَس ما اعتُرف به: **بقيدٍ عكسيّ لا بتعديل**،
 * فيبقى في الدفتر أنه استُحقّ ثم رُدّ، لا أنه لم يقع.
 */
export async function recordRefund(
  writer: Writer,
  input: {
    orderId: string;
    buyerId: string;
    amount: Prisma.Decimal | number | string;
    /** بعد الاستحقاق ⇒ يُعكَس الإيراد وضريبته معه */
    afterEarning: boolean;
    commission?: Prisma.Decimal | number | string;
    vat?: Prisma.Decimal | number | string;
    sellerId?: string;
  },
  now: Date = new Date(),
): Promise<PostResult> {
  const amount = d(input.amount);

  if (!input.afterEarning) {
    return postEntries(
      writer,
      {
        event: 'refund.before_earning',
        orderId: input.orderId,
        postings: [
          { account: 'BUYER_ADVANCE', direction: 'DEBIT', amount, userId: input.buyerId },
          { account: 'ESCROW_AT_PROVIDER', direction: 'CREDIT', amount },
        ],
      },
      now,
    );
  }

  const commission = d(input.commission ?? 0);
  const vat = d(input.vat ?? 0);
  const fromSeller = amount.minus(commission).minus(vat);

  return postEntries(
    writer,
    {
      event: 'refund.after_earning',
      orderId: input.orderId,
      postings: [
        /*
          مَن تحمّل الردّ يُقال بالتقسيم لا بحسابٍ واحد: عمولتنا تعود
          منّا، وضريبتها تُخصم من دَيننا للهيئة، والباقي من حقّ البائع.
          ومجموعها هو المبلغ المردود بعينه — فيتوازن القيد.
        */
        ...(commission.equals(zero)
          ? []
          : [
              {
                account: 'PLATFORM_REVENUE' as const,
                direction: 'DEBIT' as const,
                amount: commission,
              },
            ]),
        ...(vat.equals(zero)
          ? []
          : [{ account: 'VAT_PAYABLE' as const, direction: 'DEBIT' as const, amount: vat }]),
        ...(fromSeller.equals(zero)
          ? []
          : [
              {
                account: 'SELLER_PAYABLE' as const,
                direction: 'DEBIT' as const,
                amount: fromSeller,
                ...(input.sellerId === undefined ? {} : { userId: input.sellerId }),
              },
            ]),
        { account: 'ESCROW_AT_PROVIDER', direction: 'CREDIT', amount, userId: input.buyerId },
      ],
    },
    now,
  );
}

/**
 * ═══ ولحظتا الخدمة ═══
 *
 * والقاعدة الضريبية `SERVICE` تحسم من المورِّد: `supplierIsPlatform:
 * true` و`invoiceIssuer: PLATFORM` — فالعميل يشتري **منّا**، والمزوّد
 * مقاولٌ من الباطن. فكامل القيمة إيرادُنا، وسعرُه **تكلفةُ البيع**.
 *
 * وبغير هذا يظهر رسمُ خمسين ريالًا على فحصٍ بأربعمئة وخمسين **ربحًا
 * قدره خمسُ مئة** — ولا يكشفه ميزانٌ لأن الدفتر متوازن في الحالين.
 *
 * **ولم يكن للخدمة قيدٌ أصلًا**: يدفع العميل خمسَ مئةٍ وتُحجز لدى
 * البوّابة، ولا سطر في الدفتر — فلا إيرادٌ يُعترف به، ولا دَينٌ
 * للمزوّد يُسجَّل، ولا ضريبةٌ تُرصد. وقِيس: `ledgerEntry` بلا حسابٍ
 * واحد يخصّ الخدمات.
 */
export type ServiceMoney = {
  /** مرجعُ الطلب — يُكتب في `note` إذ لا عمود له في الدفتر */
  ref: string;
  paymentId?: string | null;
  requesterId: string;
  /** ما يدفعه الطالب كاملًا، شاملًا الضريبة */
  total: Prisma.Decimal | number | string;
  /** رسمُنا فوق سعر المزوّد — لقطةُ الطلب */
  platformFee: Prisma.Decimal | number | string;
  /** ضريبةُ التوريد كلِّه — لقطةُ الطلب */
  vat: Prisma.Decimal | number | string;
};

/**
 * ═══ ١· دُفع ثمنُ الخدمة ولم تُؤدَّ بعد ═══
 *
 * ```
 *   مدين   ESCROW_AT_PROVIDER   ٥١٧٬٥٠
 *   دائن   BUYER_ADVANCE        ٥١٧٬٥٠
 * ```
 *
 * **ولا إيراد بعد** — كالمركبة سواءً بسواء: قُبض ولم يُستحقّ، والخدمة
 * لم تقع. ومن يعترف بالإيراد عند القبض يُظهر أرباحًا على عملٍ قد يفشل.
 */
export async function recordServicePaid(
  writer: Writer,
  input: Pick<ServiceMoney, 'ref' | 'paymentId' | 'requesterId' | 'total'>,
  now: Date = new Date(),
): Promise<PostResult> {
  return postEntries(
    writer,
    {
      event: 'service.paid',
      paymentId: input.paymentId ?? null,
      /** **والمرجع في كل قيد** — لا عمود للطلب في الدفتر، والقيد يُقرأ وحده. */
      postings: [
        {
          account: 'ESCROW_AT_PROVIDER',
          direction: 'DEBIT',
          amount: input.total,
          note: input.ref,
        },
        {
          account: 'BUYER_ADVANCE',
          direction: 'CREDIT',
          amount: input.total,
          userId: input.requesterId,
          note: input.ref,
        },
      ],
    },
    now,
  );
}

/**
 * ═══ ٢· أُدّيت الخدمة — فاستُحقّ الإيراد وصار للمزوّد دَين ═══
 *
 * على فحصٍ سعرُه ٤٥٠ ورسمُنا ٥٠ وضريبةُ الخمسمئة ٧٥:
 *
 * ```
 *   مدين   BUYER_ADVANCE        ٥٧٥
 *   دائن   PLATFORM_REVENUE     ٥٠٠
 *   دائن   VAT_PAYABLE           ٧٥
 *
 *   مدين   PROVIDER_COST        ٤٥٠
 *   دائن   PROVIDER_PAYABLE     ٤٥٠
 * ```
 *
 * **وحصّةُ المزوّد تُشتقّ طرحًا** — الإجماليّ ناقص الضريبة ناقص رسمنا —
 * فلا يصل رقمٌ لا يتوازن. والربح الحقيقيّ هو الرسم: ٥٠٠ إيرادًا مقابل
 * ٤٥٠ تكلفةً.
 *
 * **ولحظةُ الاستحقاق إنجازُ المزوّد** (`DONE`) لا قبضُ المال: هي
 * اللحظة التي وقع فيها التوريد.
 */
export async function recordServiceEarned(
  writer: Writer,
  input: ServiceMoney,
  now: Date = new Date(),
): Promise<PostResult> {
  const total = d(input.total);
  const vat = d(input.vat);
  const platformFee = d(input.platformFee);
  const revenue = total.minus(vat);
  const providerNet = revenue.minus(platformFee);

  if (providerNet.isNegative()) return { ok: false, reason: 'NEGATIVE_AMOUNT' };

  const earned = await postEntries(
    writer,
    {
      event: 'service.earned',
      paymentId: input.paymentId ?? null,
      postings: [
        {
          account: 'BUYER_ADVANCE',
          direction: 'DEBIT',
          amount: total,
          userId: input.requesterId,
          note: input.ref,
        },
        { account: 'PLATFORM_REVENUE', direction: 'CREDIT', amount: revenue, note: input.ref },
        { account: 'VAT_PAYABLE', direction: 'CREDIT', amount: vat, note: input.ref },
      ],
    },
    now,
  );
  if (!earned.ok) return earned;

  /**
   * **ومعاملةٌ ثانية لا سطران في الأولى.** تكلفةُ المزوّد حدثٌ آخر:
   * دَينٌ علينا لجهةٍ أخرى، يُسدَّد في موعدٍ آخر. وخلطُهما يجعل
   * تسويةَ المزوّد تبدو ردًّا للعميل.
   */
  if (providerNet.isZero()) return earned;

  return postEntries(
    writer,
    {
      event: 'service.provider_due',
      paymentId: input.paymentId ?? null,
      postings: [
        { account: 'PROVIDER_COST', direction: 'DEBIT', amount: providerNet, note: input.ref },
        {
          account: 'PROVIDER_PAYABLE',
          direction: 'CREDIT',
          amount: providerNet,
          note: input.ref,
        },
      ],
    },
    now,
  );
}

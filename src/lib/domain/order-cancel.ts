import { db } from '@/lib/db';
import { Prisma } from '@/generated/prisma/client';
import { resolveForPayment } from '@/lib/payments/resolve';
import { recordRefund } from './ledger-events';
import { republishListing } from './listing-state';

/**
 * ═══ إلغاء الطلب — وكان لا سبيل إليه ═══
 *
 * `OrderStatus.CANCELLED` معرَّفٌ في المخطّط، ولوحة الأدمن تعدّه،
 * و`cancelReason` تُقرأ في تفصيل الطلب — **ولا شيء في المنتج كلّه
 * يكتبه**. ثاني عشرَ موضعٍ لنمط «قيمةٌ في المخطّط بلا كاتب».
 *
 * وأثرُه أثقل من عدّادٍ فارغ: **شروطُنا المنشورة تَعِد به**. «الإلغاء
 * قبل الدفع بلا رسوم… وبعد الدفع تُطبَّق رسوم الإلغاء المعلنة في صفحة
 * الطلب» — ومن دفع ثم احتاج الإلغاء لا يجد بابًا، فيفتح نزاعًا على
 * ما ليس خلافًا، أو يتصل ويُطلب منه الانتظار.
 *
 * ═══ والمرحلة تُحدّد ما يقع ═══
 *
 * | المرحلة | ما يقع |
 * |---|---|
 * | قبل الدفع | إلغاءٌ بلا رسوم — ولا مال تحرّك أصلًا |
 * | بعد الدفع وقبل النقل | يُلغى الحجز لدى البوابة ويُردّ القيد |
 * | بعد تأكيد النقل | **لا إلغاء** — وقع البيع، والمسار نزاع |
 *
 * **والمال يتحرّك قبل أن يُكتب الصفّ**: إلغاء الحجز لدى البوابة أوّلًا،
 * فلو فشل بقي الطلب قائمًا كما هو. والعكس يُنتج طلبًا ملغًى ومالًا
 * محجوزًا لا يعرف أحدٌ لمن هو.
 */

export type CancelFailure =
  | 'NOT_FOUND'
  | 'NOT_PARTY'
  | 'ALREADY_CLOSED'
  | 'TRANSFER_DONE'
  | 'DISPUTED'
  | 'REASON_REQUIRED'
  | 'GATEWAY_FAILED';

export type CancelResult =
  | { ok: true; refunded: string; stage: string }
  | { ok: false; reason: CancelFailure };

/** المراحل التي يجوز الإلغاء فيها — وما بعدها بيعٌ وقع. */
const CANCELLABLE = ['REQUEST', 'APPROVED', 'INSPECTION', 'PAYMENT', 'TRANSFER'] as const;

export async function cancelOrder(
  input: {
    orderRef: string;
    /** المشتري أو البائع — ولا ثالث لهما من غير الأدمن. */
    actorId: string;
    reason: string;
  },
  now: Date = new Date(),
): Promise<CancelResult> {
  /**
   * **والسبب مكتوبٌ إلزامًا.** إلغاءٌ بلا سببٍ يُقرأ بعد شهر ولا يُعرف
   * أكان خطأً أم انسحابًا — وهو أوّل ما يُسأل عنه في نزاعٍ لاحق.
   */
  if (input.reason.trim().length < 3) return { ok: false, reason: 'REASON_REQUIRED' };

  const order = await db.order.findUnique({
    where: { ref: input.orderRef },
    select: {
      id: true, stage: true, status: true, buyerId: true, sellerId: true,
      totalAmount: true, listingId: true,
    },
  });

  if (order === null) return { ok: false, reason: 'NOT_FOUND' };
  if (order.buyerId !== input.actorId && order.sellerId !== input.actorId) {
    return { ok: false, reason: 'NOT_PARTY' };
  }
  if (order.status !== 'ACTIVE') {
    return { ok: false, reason: order.status === 'DISPUTED' ? 'DISPUTED' : 'ALREADY_CLOSED' };
  }
  if (!(CANCELLABLE as readonly string[]).includes(order.stage)) {
    return { ok: false, reason: 'TRANSFER_DONE' };
  }

  /**
   * **وتأكيد الاستلام يُغلق الباب** — لا المرحلة وحدها. طلبٌ في
   * `TRANSFER` أُفرج عن ضمانه لا يُلغى: المال عند البائع.
   */
  const escrow = await db.escrow.findFirst({
    where: { orderId: order.id },
    select: { id: true, status: true, amount: true },
  });
  if (escrow !== null && escrow.status === 'RELEASED') {
    return { ok: false, reason: 'TRANSFER_DONE' };
  }

  const payment = await db.payment.findFirst({
    where: { orderId: order.id, purpose: 'VEHICLE_ESCROW', status: 'HELD' },
    select: { id: true, holdRef: true, gatewayKey: true, environment: true, amount: true },
  });

  /**
   * ═══ المال أوّلًا ═══
   *
   * فلو فشل الإلغاء لدى البوابة بقي الطلب قائمًا كما هو — ومحاولةٌ
   * ثانية تجد الحال نفسها. والعكس يُنتج طلبًا ملغًى ومالًا محجوزًا.
   */
  if (payment !== null && payment.holdRef !== null) {
    const gateway = await resolveForPayment(payment.gatewayKey, payment.environment);
    const result = await gateway.cancel(payment.holdRef);
    /**
     * **و`CONFIRMED` هي نجاح الإلغاء** لا تأكيد القبض: المُهايئ يعيد
     * حالة العملية التي طُلبت، والعملية هنا إلغاء. (المفردة نفسها
     * في `cancelDepositHold`.)
     */
    if (result.state !== 'CONFIRMED') {
      return { ok: false, reason: 'GATEWAY_FAILED' };
    }
  }

  const refunded = payment?.amount ?? new Prisma.Decimal(0);

  await db.$transaction(async (tx) => {
    if (payment !== null) {
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: 'CANCELLED', cancelledAt: now, returnedAmount: payment.amount },
      });
    }

    if (escrow !== null) {
      await tx.escrow.update({
        where: { id: escrow.id },
        /** و`Escrow` لا يحمل تاريخ ردّ — ووقتُه في قيد الدفتر. */
        data: { status: 'REFUNDED' },
      });
    }

    /**
     * **ولا إيراد يُعكَس**: الإلغاء قبل الاستحقاق، فلم يُعترف بشيء —
     * والردّ من `BUYER_ADVANCE` مباشرةً. (`afterEarning: false`.)
     */
    if (Number(refunded) > 0) {
      await recordRefund(
        tx,
        {
          orderId: order.id,
          buyerId: order.buyerId,
          amount: refunded,
          afterEarning: false,
        },
        now,
      );
    }

    await tx.order.update({
      where: { id: order.id },
      data: {
        status: 'CANCELLED',
        cancelReason: input.reason.trim().slice(0, 500),
        /** **ومن ألغى يُكتب**: «المشتري انسحب» غير «البائع اعتذر». */
        cancelledBy: input.actorId,
      },
    });

    /**
     * **والإعلان يعود معروضًا.** مركبةٌ أُلغي طلبُها تبقى `RESERVED`
     * فلا يراها أحد ولا يشتريها — فيخسر البائع بيعًا بسبب انسحاب
     * مشترٍ. ولا يعود إن كان قد بِيع أو أوقفه صاحبه.
     */
    const listing = await tx.listing.findUnique({
      where: { id: order.listingId },
      select: { status: true },
    });
    /** **والحالة تمرّ بمدخلها الوحيد** — والبوابة أمسكت هذا الموضع. */
    if (listing?.status === 'RESERVED') {
      await republishListing(tx, order.listingId);
    }
  });

  /**
   * ═══ والمشتري وحده يُصادَر عربونه ═══
   *
   * القاعدة ٩: «يُصادَر عند الانسحاب» — والانسحاب فعلُ من رسا عليه.
   * **فإلغاءُ البائع ليس انسحابًا من المشتري**: لم يُخلّ بشيء،
   * وعربونُه يبقى محجوزًا حتى يُردّ، ومصادرتُه عقوبةٌ على فعل غيره.
   *
   * وخارج المعاملة لأنها تنادي البوابة — والإلغاء وقع، فلا يُحتجز
   * على نداءٍ تعثّر.
   */
  if (input.actorId === order.buyerId) {
    const { forfeitOnWithdrawal } = await import('./auctions');
    await forfeitOnWithdrawal({ orderId: order.id, reason: 'buyer.cancelled' }, now);
  }

  return { ok: true, refunded: refunded.toString(), stage: order.stage };
}

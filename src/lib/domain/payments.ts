import { db } from '@/lib/db';
import { DEADLINE_DEFAULTS } from './deadlines';
import { recordOrderEarned, recordOrderPaid } from './ledger-events';
import type { Prisma } from '@/generated/prisma/client';
import type { PaymentPurpose, PaymentStatus } from '@/generated/prisma/enums';
import { gatewayImplemented, resolveForPayment, resolveGateway } from '@/lib/payments/resolve';
import { canSettle } from './transfer-windows';
import { isLiveOrder } from './order-state';
import { REQUIRED_APPROVALS, selfApprovalBlocked, soloQuorum } from './approvals';

/**
 * مسار الدفع — **بلغة الضمان** (قرار ٣٤).
 *
 * والحالة عندنا لا عند البوابة: هي مصدر الحقيقة عن البطاقة، ونحن عن
 * الطلب. وقراءةُ حالة الطلب من البوابة وقت العرض تجعل الشاشة تتوقّف
 * حين تتوقّف هي، والمال معلَّقًا بين النظامين.
 *
 * ولكل محاولة صفّها لا للنجاح وحده: «دفعتُ ولم يصل» شكوى لا يُردّ
 * عليها إلا بسجلٍّ للمحاولة الفاشلة.
 */

/**
 * الانتقالات المسموحة — **جدولٌ صريح لا مشتقّ**.
 *
 * `FAILED → SETTLED` يبدو مستحيلًا حتى يصل ويبهوك متأخّر بعد انقضاء
 * المهلة، فيُقلب فشلٌ إلى نجاح ويُسلَّم مبلغٌ لطلبٍ أُعيد نشره.
 */
const TRANSITIONS: Record<PaymentStatus, readonly PaymentStatus[]> = {
  CREATED: ['REQUIRES_ACTION', 'PENDING', 'HELD', 'FAILED', 'CANCELLED'],
  REQUIRES_ACTION: ['PENDING', 'HELD', 'FAILED', 'CANCELLED'],
  PENDING: ['HELD', 'SETTLED', 'PARTIALLY_SETTLED', 'FAILED', 'CANCELLED'],
  HELD: ['SETTLED', 'PARTIALLY_SETTLED', 'CANCELLED', 'FAILED'],
  SETTLED: ['RETURNED', 'PARTIALLY_RETURNED'],
  PARTIALLY_SETTLED: ['SETTLED', 'RETURNED', 'PARTIALLY_RETURNED'],
  CANCELLED: [],
  RETURNED: [],
  PARTIALLY_RETURNED: ['RETURNED'],
  FAILED: [],
};

export function canTransition(from: PaymentStatus, to: PaymentStatus): boolean {
  return (TRANSITIONS[from] ?? []).includes(to);
}

/** محاولةٌ حيّة — لا تُبدأ ثانية بجانبها، وإلّا خُصمت البطاقة مرّتين. */
const LIVE: readonly PaymentStatus[] = ['CREATED', 'REQUIRES_ACTION', 'PENDING', 'HELD'];

export type StartFailure =
  | 'ORDER_NOT_FOUND'
  | 'NOT_BUYER'
  | 'ORDER_CLOSED'
  | 'WRONG_STAGE'
  | 'WINDOW_PASSED'
  | 'ALREADY_HELD'
  | 'ATTEMPT_IN_FLIGHT'
  | 'ROUTE_DISABLED'
  | 'NO_ROUTE'
  | 'GATEWAY_FAILED';

export type StartResult =
  | { ok: true; paymentId: string; status: PaymentStatus; actionUrl: string | null }
  | { ok: false; reason: StartFailure; code?: string };

/**
 * بدء حجز على طلب.
 *
 * **المبلغ من الطلب لا من الطلبِ الوارد**: قيمةٌ يرسلها المتصفّح تُدفَع
 * بها البطاقة هي بابٌ لدفع ريال واحد ثمنًا لسيارة.
 */
export async function startHold(
  input: { orderRef: string; buyerId: string; method: string; returnUrl: string; idempotencyKey: string },
  now: Date = new Date(),
): Promise<StartResult> {
  const order = await db.order.findUnique({
    where: { ref: input.orderRef },
    select: {
      id: true, buyerId: true, stage: true, status: true,
      totalAmount: true, paymentDueAt: true,
      payments: { select: { status: true } },
    },
  });

  if (order === null) return { ok: false, reason: 'ORDER_NOT_FOUND' };
  if (order.buyerId !== input.buyerId) return { ok: false, reason: 'NOT_BUYER' };
  /**
   * ═══ والحالة تُفحص قبل المرحلة ═══
   *
   * **`status` كان مختارًا في الاستعلام ولا يقرؤه أحد.** والإلغاء حالةٌ
   * لا مرحلة: طلبٌ ملغى في `PAYMENT` تبقى مرحلتُه `PAYMENT`، فكل
   * الحُرّاس تحته تمرّ — ويُحجَز مبلغٌ لطلبٍ ميّتٍ أُعيد إعلانُه
   * معروضًا للآخرين. فالمال يُؤخَذ مرّتين عن مركبةٍ واحدة.
   *
   * و`advanceStage` كان يفحصها منذ بُني (`ORDER_CLOSED`) — فهذا المدخل
   * وحده كان مكشوفًا.
   */
  if (!isLiveOrder(order.status)) return { ok: false, reason: 'ORDER_CLOSED' };
  if (order.stage !== 'PAYMENT') return { ok: false, reason: 'WRONG_STAGE' };
  if (order.paymentDueAt !== null && order.paymentDueAt.getTime() <= now.getTime()) {
    return { ok: false, reason: 'WINDOW_PASSED' };
  }
  if (order.payments.some((payment) => payment.status === 'HELD' || payment.status === 'SETTLED')) {
    return { ok: false, reason: 'ALREADY_HELD' };
  }
  if (order.payments.some((payment) => LIVE.includes(payment.status))) {
    return { ok: false, reason: 'ATTEMPT_IN_FLIGHT' };
  }

  const purpose: PaymentPurpose = 'VEHICLE_ESCROW';
  const resolved = await resolveGateway(purpose);
  if (resolved === null) return { ok: false, reason: 'NO_ROUTE' };
  // الغرض المعطَّل يمنع الجديد ولا يمسّ القائم (قاعدة ٣ من قرار ٣٤)
  if (!resolved.enabled) return { ok: false, reason: 'ROUTE_DISABLED' };

  const payment = await db.payment.create({
    data: {
      orderId: order.id,
      purpose,
      // **لقطة لا إعداد**: الحجز يُفرَج من حيث أُنشئ
      gatewayKey: resolved.gatewayKey,
      environment: resolved.environment,
      amount: order.totalAmount,
      method: input.method,
      status: 'CREATED',
      createdAt: now,
    },
  });
  await record(payment.id, null, 'CREATED', 'payment.created', 'user', now);

  const result = await resolved.gateway.hold({
    purpose,
    ref: input.orderRef,
    amount: order.totalAmount.toString(),
    currency: 'SAR',
    method: input.method,
    returnUrl: input.returnUrl,
    idempotencyKey: input.idempotencyKey,
  });

  if (result.state === 'FAILED') {
    /**
     * فشل البوابة **يُسجَّل ولا يُبتلع**. ولا مسار بديل للدفع، فالصمت
     * هنا شاشةٌ تدور بلا نهاية ومستخدمٌ لا يعرف أدُفع أم لا.
     */
    await db.payment.update({
      where: { id: payment.id },
      data: { status: 'FAILED', failedAt: now, failureCode: result.code },
    });
    await record(payment.id, 'CREATED', 'FAILED', 'payment.failed', 'gateway', now, {
      code: result.code,
    });
    return { ok: false, reason: 'GATEWAY_FAILED', code: result.code };
  }

  const next: PaymentStatus =
    result.state === 'REQUIRES_ACTION' ? 'REQUIRES_ACTION'
    : result.state === 'CONFIRMED' ? 'HELD'
    : 'PENDING';

  /**
   * مرجع البوابة يُكتب أوّلًا — به تُلغى المحاولة أو تُسوَّى لاحقًا،
   * حتى لو سقط ما بعده.
   */
  await db.payment.update({
    where: { id: payment.id },
    data: {
      holdRef: result.holdRef,
      actionUrl: result.state === 'REQUIRES_ACTION' ? result.actionUrl : null,
    },
  });

  /**
   * ═══ والحالة تمرّ بـ`applyState` لا تُكتب هنا ═══
   *
   * كانت تُكتب هنا مباشرةً، **فبوابةٌ تؤكّد لحظيًّا — وكل بوابة بطاقة
   * كذلك — تترك الدفعة `HELD` بلا `Escrow` وبلا تقدّم مرحلة**: المال
   * محجوزٌ لدى البوابة ودفترنا لا يعرف لمن هو، والطلب واقفٌ في «دفع»
   * إلى أن تنقضي مهلته. ولا يظهر العطل إلا حين تؤكّد البوابة فورًا،
   * فمسار الويبهوك وحده كان يُختبَر.
   *
   * و`applyState` هي **المدخل الوحيد** — تُنشئ الضمان وتفتح سقف النقل
   * وتقيّد الحدث، فتُكتب قاعدة المال مرّة ويمرّ منها الويبهوك والأدمن
   * وهذا المسار معًا.
   */
  const applied = await applyState(payment.id, next, 'gateway', now);
  if (!applied.ok) {
    // انتقالٌ مرفوض بعد نجاح البوابة: يُقيَّد ولا يُبتلع
    await record(payment.id, 'CREATED', next, 'payment.state_rejected', 'gateway', now, {
      reason: applied.reason,
    });
  }

  return {
    ok: true,
    paymentId: payment.id,
    status: next,
    actionUrl: result.state === 'REQUIRES_ACTION' ? result.actionUrl : null,
  };
}

async function record(
  paymentId: string,
  from: PaymentStatus | null,
  to: PaymentStatus,
  type: string,
  source: string,
  now: Date,
  detail?: Prisma.InputJsonValue,
): Promise<void> {
  await db.paymentEvent.create({
    data: {
      paymentId, type, fromStatus: from, toStatus: to, source,
      ...(detail === undefined ? {} : { detail }),
      createdAt: now,
    },
  });
}

export type AdvanceResult =
  | { ok: true; status: PaymentStatus }
  /**
   * `DEPOSIT_NOT_CAPTURED` — تعذّر تحصيل عربون الفائز، فالتسوية
   * تتوقّف. وإفراجٌ عن مالٍ ناقصٍ أسوأ من إفراجٍ يُعاد.
   */
  | { ok: false; reason: 'PAYMENT_NOT_FOUND' | 'INVALID_TRANSITION' | 'DEPOSIT_NOT_CAPTURED' };

/**
 * نقل حالة الدفعة — **المدخل الوحيد**، ومنه يمرّ الويبهوك والأدمن معًا.
 *
 * وحين تصير `HELD` يُحجز الضمان في المعاملة نفسها: مبلغٌ محجوز بلا قيدٍ
 * يقول لمن هو مالٌ بلا صاحب في دفترنا.
 */
/**
 * مراجع المزوّد التي تُحفظ مع الانتقال.
 *
 * **و`settleRef` لم يكن يُكتب إطلاقًا.** المطابقة اليومية تقرأ
 * `settleRef ?? holdRef`، فكانت تُطابق أبدًا بمرجع الحجز — والمزوّد
 * يبلّغ تسوياته بمرجع التسوية. فالحقل موجودٌ في المخطّط، والفرع
 * الاحتياطيّ يعمل، والمطابقة تفشل على بوابةٍ حقيقية بلا أن يقول شيءٌ
 * إن السبب مرجعٌ لم يُحفَظ.
 */
export type PaymentRefs = { settleRef?: string; settledAmount?: string };

export async function applyState(
  paymentId: string,
  to: PaymentStatus,
  source: string,
  now: Date = new Date(),
  detail?: Prisma.InputJsonValue,
  refs?: PaymentRefs,
): Promise<AdvanceResult> {
  let orderId: string | null = null;

  /**
   * ═══ عربون الفائز يُحصَّل قبل أن يُقفل الاستحقاق ═══
   *
   * **وخارج المعاملة**: التحصيل ينادي البوابة، وشبكةٌ بطيئة داخل
   * معاملةٍ تُبقي صفوف الدفعة والضمان مقفلة حتى تردّ.
   *
   * **وقبلها لا بعدها**: `recordOrderEarned` يحتسب الإجمالي زائدَ
   * العربون، فلو فشل التحصيل بعد القيد لصار في الدفتر مالٌ لم يدخل.
   * والفشل هنا يمنع التسوية كلّها — وهو الصواب: إفراجٌ عن مالٍ
   * ناقصٍ أسوأ من إفراجٍ يُعاد.
   */
  if (to === 'SETTLED') {
    const target = await db.payment.findUnique({
      where: { id: paymentId },
      select: { status: true, order: { select: { id: true, buyerId: true, listingId: true, source: true } } },
    });
    const order = target?.order ?? null;
    if (target?.status === 'HELD' && order !== null && order.source === 'AUCTION') {
      const { captureAppliedDeposit } = await import('./deposit-money');
      const captured = await captureAppliedDeposit(
        { orderId: order.id, buyerId: order.buyerId, listingId: order.listingId },
        now,
      );
      /**
       * `null` تعني «لا عربون يُحصَّل» أو «تعذّر». والأولى شائعة
       * (عربونٌ دفتريّ قديم بلا دفعة)، فلا تُعامَل خطأ — ويُميَّز
       * بينهما بأن المخصوم صفر.
       */
      if (captured === null) {
        const row = await db.order.findUnique({
          where: { id: order.id },
          select: { depositApplied: true },
        });
        const owed = row?.depositApplied ?? null;
        if (owed !== null && owed.greaterThan(0)) {
          const { reportError } = await import('@/lib/observability/report');
          reportError(new Error('applied deposit not captured'), {
            where: 'payments.applyState.captureDeposit',
            extra: { orderId: order.id, depositApplied: owed.toString() },
          });
          return { ok: false, reason: 'DEPOSIT_NOT_CAPTURED' };
        }
      }
    }
  }

  const result = await db.$transaction(async (tx): Promise<AdvanceResult> => {
    const payment = await tx.payment.findUnique({
      where: { id: paymentId },
      select: { id: true, status: true, orderId: true, amount: true, gatewayKey: true },
    });
    if (payment === null) return { ok: false, reason: 'PAYMENT_NOT_FOUND' };
    if (!canTransition(payment.status, to)) return { ok: false, reason: 'INVALID_TRANSITION' };

    await tx.payment.update({
      where: { id: paymentId },
      data: {
        status: to,
        ...(to === 'HELD' ? { heldAt: now } : {}),
        ...(to === 'SETTLED' || to === 'PARTIALLY_SETTLED' ? { settledAt: now } : {}),
        ...(to === 'CANCELLED' ? { cancelledAt: now } : {}),
        ...(to === 'FAILED' ? { failedAt: now } : {}),
        ...(refs?.settleRef === undefined ? {} : { settleRef: refs.settleRef }),
        // نصًّا لا `Decimal`: Prisma يقبل السلسلة، والبناء هنا يحتاج قيمةً لا نوعًا
        ...(refs?.settledAmount === undefined ? {} : { settledAmount: refs.settledAmount }),
      },
    });
    await tx.paymentEvent.create({
      data: {
        paymentId, type: `payment.${to.toLowerCase()}`,
        fromStatus: payment.status, toStatus: to, source,
        ...(detail === undefined ? {} : { detail }),
        createdAt: now,
      },
    });

    if (to === 'HELD' && payment.orderId !== null) {
      const existing = await tx.escrow.findUnique({ where: { orderId: payment.orderId } });
      if (existing === null) {
        /**
         * **القيد داخل المعاملة نفسها.** ضمانٌ يُنشأ ودفترٌ لا يُكتب
         * يجعل الدفتر ينقص صفقةً بلا أن يقول — وهو أسوأ خللٍ في دفتر:
         * لا يظهر إلا حين يبحث محاسب عن مالٍ لا يجده.
         */
        const order = await tx.order.findUniqueOrThrow({
          where: { id: payment.orderId },
          select: { buyerId: true },
        });
        await recordOrderPaid(
          tx,
          {
            orderId: payment.orderId,
            paymentId: payment.id,
            buyerId: order.buyerId,
            total: payment.amount,
          },
          now,
        );

        await tx.escrow.create({
          data: {
            orderId: payment.orderId,
            amount: payment.amount,
            status: 'HELD',
            heldAt: now,
            gatewayRef: payment.gatewayKey,
          },
        });
      } else if (existing.status === 'PENDING') {
        await tx.escrow.update({
          where: { orderId: payment.orderId },
          data: { status: 'HELD', heldAt: now },
        });
      }

      // الطلب يتقدّم إلى نقل الملكية — والسقف يُفتح معه
      const order = await tx.order.findUniqueOrThrow({ where: { id: payment.orderId } });
      if (order.stage === 'PAYMENT') {
        /**
         * **مهلة النقل من إعداد الأدمن** — وهذا موضع كتابتها الوحيد.
         * وكانت تُقرأ من الثابت، فيضبط المشغّل الإعداد ولا يتغيّر شيء:
         * إعدادٌ يُحفظ ولا يبلغ الصفّ ليس إعدادًا.
         */
        const { transferDeadlineFor } = await import('./transfer-windows');
        await tx.order.update({
          where: { id: payment.orderId },
          data: {
            stage: 'TRANSFER',
            stageEnteredAt: now,
            transferDeadlineAt: await transferDeadlineFor(now),
          },
        });
        await tx.orderEvent.create({
          data: {
            orderId: payment.orderId,
            type: 'stage.advanced',
            fromStage: 'PAYMENT',
            toStage: 'TRANSFER',
            actorType: 'system',
            createdAt: now,
          },
        });
      }

      /**
       * ═══ والبائع يُخطَر هنا ═══
       *
       * **هذه لحظتُه**: المشتري ضغط «ادفع» ورأى نتيجته على شاشته،
       * والبائع كان ينتظر مالًا لا يعرف أوصل أم لا — ولا شيء في
       * المنتج كان يقول له. وعليه واجبٌ يبدأ الآن (إجراء النقل)،
       * فالخبرُ بلا تبليغٍ واجبٌ بلا موعد.
       */
      const { notifyEscrowHeld } = await import('./order-notify');
      await notifyEscrowHeld(
        tx,
        { ref: order.ref, buyerId: order.buyerId, sellerId: order.sellerId },
        payment.amount.toString(),
      );
    }

    if (to === 'SETTLED' && payment.orderId !== null) {
      const released = await tx.escrow.updateMany({
        where: { orderId: payment.orderId, status: 'HELD' },
        data: { status: 'RELEASED', releasedAt: now },
      });

      /**
       * **وهنا وحده يُعترف بالإيراد** — لا عند القبض.
       *
       * والشرط `released.count > 0`: التسوية قد تُنادى مرّتين (ويبهوك
       * يتكرّر، أو إفراجٌ يُعاد)، والقيد يُكتب مرّة. ولو كُتب مرّتين
       * لتضاعف الإيراد في الدفتر بلا أن يقول شيءٌ إنه تضاعف.
       */
      if (released.count > 0) {
        const order = await tx.order.findUniqueOrThrow({
          where: { id: payment.orderId },
          select: {
            ref: true,
            buyerId: true, sellerId: true, totalAmount: true, depositApplied: true,
            commissionAmount: true, vatAmount: true, transferFee: true,
          },
        });

        /**
         * ═══ والعربون المخصوم جزءٌ من الثمن ═══
         *
         * `totalAmount` في طلب المزاد هو **الإجمالي ناقص العربون**،
         * فاحتسابُ الاستحقاق عليه وحده يُقيّد للبائع أقلّ ممّا باع به
         * بمقدار العربون — وقِيس على `ORD-2026-1023`: مطرقةٌ ٩٦٬٠٠٠،
         * وقُيّد ٩١٬٠٠٠، وشاشته تقول ٩٦٬٠٠٠.
         *
         * والتحصيل نفسه في `captureAppliedDeposit` خارج هذه المعاملة
         * (ينادي البوابة)، ويُستدعى **قبلها** — فالمبلغ هنا مجموعُ ما
         * دخل الضمان فعلًا.
         */
        const total = order.totalAmount.plus(order.depositApplied);

        await recordOrderEarned(
          tx,
          {
            orderId: payment.orderId,
            paymentId: payment.id,
            buyerId: order.buyerId,
            sellerId: order.sellerId,
            total,
            commission: order.commissionAmount,
            vat: order.vatAmount,
            govtFee: order.transferFee,
          },
          now,
        );

        /**
         * ═══ وحركةُ الخزينة مع الاستحقاق لا بعده ═══
         *
         * قرار المالك (٢٠٢٦-١٠-١٧): المالُ الذي حُصِّل ولم يُحوَّل إلى
         * البنك **مالٌ لنا**. والتسويةُ هي لحظةُ خروجه من الحجز إلى
         * رصيدنا لدى المزوّد — فالقيدان يقعان معًا في معاملةٍ واحدة
         * وتحت الحارس نفسه (`released.count > 0`)، وإلّا كُتب أحدهما
         * مرّتين بويبهوكٍ متكرّر.
         *
         * **وبالمبلغ الذي حُصِّل**: ما دخل الضمان فعلًا، بالعربون
         * المخصوم — فهو ما يظهر في كشف المزوّد.
         */
        const { recordOrderCaptured } = await import('./ledger-events');
        await recordOrderCaptured(
          tx,
          { orderId: payment.orderId, paymentId: payment.id, amount: total },
          now,
        );

        /**
         * **«حُوّل المبلغ إليك» — قالبٌ مزروع بلا كاتب.** أُفرج عن
         * مال البائع ولا شيء يقول له، فيبقى يفتح «مستحقّاتي» كلّ
         * يومٍ ليرى أتغيّر رقمٌ أم لا. والخبر يتبع المال في لحظته.
         */
        const { notifyEscrowReleased } = await import('./order-notify');
        await notifyEscrowReleased(
          tx,
          { ref: order.ref, sellerId: order.sellerId },
          total.toString(),
        );
      }
    }

    orderId = payment.orderId;

    return { ok: true, status: to };
  });

  /**
   * ═══ الفاتورة تشهد بواقعة ═══
   *
   * والإصدار **بعد** إغلاق المعاملة لا داخلها: الواقعة هي التسوية،
   * والمستند مشتقٌّ منها. فلو فشل الإصدار وجب أن تبقى التسوية قائمة
   * ويُعاد الإصدار — لا أن تُلغى تسويةٌ وقعت لأن ورقةً لم تُطبع.
   *
   * و`PENDING` لا تُصدر شيئًا: «ينتظر التأكيد» ليست واقعة بعد.
   *
   * // DESIGN-Q: `PARTIALLY_SETTLED` لا تُصدر — والمال تحرّك فيها جزئيًّا.
   * انظر docs/tax-model.md § 9.
   */
  if (result.ok && to === 'SETTLED' && orderId !== null) {
    /**
     * **الفشل هنا لا يُبطل التسوية.** المعاملة أُغلقت، والمال تحرّك —
     * ورميُ الخطأ يجعل المستدعي يرى فشلًا وقد نجح، فيعيد المحاولة على
     * دفعةٍ مُسوّاة. فيُبلَّغ ويُعاد الإصدار لاحقًا: `orderDocuments`
     * تُظهر المستند «ينتظر»، والقائمة هي طابور إعادة المحاولة.
     */
    try {
      const { issueSettlementDocuments } = await import('./documents');
      const documents = await issueSettlementDocuments(orderId, now);

      /**
       * ═══ والفاتورة المحجوبة تُعلَن ═══
       *
       * `issueSettlementDocuments` تبني `blocked` وتقول أيّ توريد لم
       * يُفوتَر ولماذا — **وكانت تُهمَل هنا**. فالطلب يكتمل والمال
       * يُفرَج والشاشة تقول «فاتورة ضريبية: صدرت»، ولا فاتورة.
       *
       * ولا أحد يعلم: لا سطر في الطلب، ولا بلاغ، ولا طابور. وأوّل
       * مطابقةٍ شهرية تكشف فرقًا بلا جوابٍ مكتوب — وهي الحال التي
       * حذّر منها التعليق داخل الدالّة نفسها.
       *
       * فيُكتب حدثًا على الطلب (يقرؤه الأدمن في خطّه الزمنيّ) **و**
       * يُبلَّغ: الأوّل للعامل على الطلب، والثاني لمن يراقب الامتثال.
       */
      if (documents.blocked.length > 0) {
        await db.orderEvent.create({
          data: {
            orderId,
            type: 'invoice.blocked',
            actorType: 'system',
            createdAt: now,
            payload: { blocked: documents.blocked },
          },
        });

        const { reportError } = await import('@/lib/observability/report');
        reportError(new Error('settlement invoices blocked'), {
          where: 'payments.applyState.issueDocuments',
          extra: { orderId, blocked: documents.blocked },
        });
      }
    } catch (error) {
      const { reportError } = await import('@/lib/observability/report');
      reportError(error, { where: 'payments.applyState.issueDocuments', extra: { orderId } });
    }
  }

  return result;
}

/** الافتراضيّ — والسارية من إعداد الأدمن. */
export const SETTLE_WINDOW_HOURS = DEADLINE_DEFAULTS.settleWindowHours;

/**
 * ═══ الإفراج عند تأكيد نقل الملكية — **تلقائيًّا** ═══
 *
 * قرار المصمّم: حين تصير المركبة باسم المشتري في المرور فقد وقع البيع،
 * فيُفرَج المال للبائع. واليدويّ بنصاب عضوين يبقى **للحالات الخاصّة**.
 *
 * ═══ ولماذا لا نصاب على هذا المسار ═══
 *
 * لأن **الواقعة هي الإذن**: لا يقرّر أحد الإفراج هنا حتى يُراجَع
 * قرارُه — تأكيدُ النقل من البائع هو ما أطلقه، وهو حدثٌ خارجيّ مسجَّل.
 * والنصاب يحرس **قرار إنسان**، لا انتقالًا تفرضه واقعة.
 *
 * وأثرُه يُكتب بـ`actorType: 'system'` ليُقرأ في التدقيق على حقيقته:
 * لم يضغطه أحد.
 *
 * **ولا يُنادى داخل معاملة**: نداء المزوّد بطيء وقد يتعثّر، وإبقاء
 * معاملةٍ مفتوحة عليه يحبس صفوفًا. وتعثّرُه لا يُبطل تأكيد النقل —
 * الوظيفة الدورية تلتقط ما لم يُفرَج.
 */
export async function settleOnTransferConfirmed(
  orderRef: string,
  now: Date = new Date(),
): Promise<SettleResult> {
  const order = await db.order.findUnique({
    where: { ref: orderRef },
    select: {
      stage: true,
      status: true,
      payments: {
        where: { status: 'HELD' },
        select: { id: true, holdRef: true, gatewayKey: true, environment: true, amount: true },
      },
      disputes: { where: { status: { in: ['OPEN', 'INVESTIGATING'] } }, select: { id: true } },
    },
  });
  if (order === null) return { ok: false, reason: 'ORDER_NOT_FOUND' };

  // النزاع يُفحص صراحةً — قد لا يبلغ `status` في كل مرحلة
  if (order.disputes.length > 0) return { ok: false, reason: 'DISPUTED' };

  const guard = canSettle(order);
  if (!guard.allowed) return { ok: false, reason: guard.reason };

  const payment = order.payments[0];
  if (payment?.holdRef == null) return { ok: false, reason: 'NO_HELD_PAYMENT' };

  const gateway = await resolveForPayment(payment.gatewayKey, payment.environment);
  const settled = await gateway.settle(payment.holdRef);

  if (settled.state === 'FAILED') {
    return { ok: false, reason: 'GATEWAY_FAILED', code: settled.code };
  }

  if (settled.state === 'CONFIRMED') {
    await applyState(payment.id, 'SETTLED', 'system', now, undefined, {
      settleRef: settled.settleRef,
      settledAmount: settled.settledAmount,
    });
  }

  await db.auditLog.create({
    data: {
      actorId: orderRef,
      actorType: 'system',
      entity: 'Order',
      entityId: orderRef,
      action: 'escrow.settled',
      before: { status: 'HELD' },
      after: {
        gatewayState: settled.state,
        amount: payment.amount.toString(),
        // **يُقال صراحةً**: هذا الإفراج تلقائيّ، ولا موافق له
        trigger: 'transfer.confirmed',
        quorum: 'none',
      },
      ip: null,
      createdAt: now,
    },
  });

  return settled.state === 'CONFIRMED'
    ? { ok: true, state: 'SETTLED' }
    : { ok: true, state: 'PENDING', approvals: 0, required: 0 };
}

export type SettleFailure =
  | 'ORDER_NOT_FOUND'
  | 'NO_HELD_PAYMENT'
  | 'NOT_TRANSFERRED'
  | 'DISPUTED'
  | 'ALREADY_PENDING'
  | 'SELF_APPROVAL'
  | 'NOT_PENDING'
  | 'EXPIRED'
  | 'GATEWAY_FAILED'
  /** بوابةُ الحجز بلا وصلة — فالإفراج يسقط ولو وافق عضوان. */
  | 'GATEWAY_UNAVAILABLE';

export type SettleResult =
  | { ok: true; state: 'PENDING'; approvals: number; required: number }
  | { ok: true; state: 'SETTLED' }
  | { ok: false; reason: SettleFailure; until?: string; code?: string };

/**
 * ═══ القاعدة ١٢ ═══ **الإفراج للبائع بموافقة عضوين.**
 *
 * وهي مبنيّة **مع** مسار الإفراج لا بعده: ما يحتاج حراسةً يُبنى محروسًا،
 * وبين البناء والحراسة نافذةٌ يعمل فيها بلا حارس — ونشرةٌ واحدة فيها
 * تكفي.
 *
 * وقبل الطلب يُفحص التوقيت: نافذة الاسترجاع مفتوحة ⇒ لا إفراج (قرار ٣٨).
 */
export async function requestSettle(
  adminId: string,
  orderRef: string,
  ip: string | null = null,
  now: Date = new Date(),
): Promise<SettleResult> {
  const order = await db.order.findUnique({
    where: { ref: orderRef },
    select: {
      id: true, stage: true, status: true,
      payments: { where: { status: 'HELD' }, select: { id: true, gatewayKey: true } },
    },
  });
  if (order === null) return { ok: false, reason: 'ORDER_NOT_FOUND' };
  if (order.payments.length === 0) return { ok: false, reason: 'NO_HELD_PAYMENT' };

  /**
   * **والبوابة تُفحص هنا لا في الشاشة وحدها.** حارسٌ في العميل اقتراح:
   * نداءٌ مباشر يفتح طلب موافقة، فيوافق عضوان ثمّ يفشل النداء عند
   * الإفراج — وموافقتان تُنفَقان على ما لا يقع.
   */
  if (order.payments.some((payment) => !gatewayImplemented(payment.gatewayKey))) {
    return { ok: false, reason: 'GATEWAY_UNAVAILABLE' };
  }

  const guard = canSettle(order);
  if (!guard.allowed) return { ok: false, reason: guard.reason };

  const existing = await db.approvalRequest.findFirst({
    where: { kind: 'ESCROW_RELEASE', entityType: 'Order', entityId: orderRef, status: 'PENDING' },
  });
  if (existing !== null) return { ok: false, reason: 'ALREADY_PENDING' };

  const request = await db.approvalRequest.create({
    data: {
      kind: 'ESCROW_RELEASE',
      entityType: 'Order',
      entityId: orderRef,
      payload: { paymentId: order.payments[0]?.id ?? null },
      requestedBy: adminId,
      approvedBy: [],
      requiredApprovals: REQUIRED_APPROVALS,
      status: 'PENDING',
      expiresAt: new Date(now.getTime() + SETTLE_WINDOW_HOURS * 3600 * 1000),
    },
  });

  /**
   * **والطالبُ هو النصاب حين يكون النصاب واحدًا** (قرار المالك
   * ٢٠٢٦-١٠-١٤): فلا يُترك صفٌّ معلَّق ينتظر الشخصَ نفسَه ليضغط
   * ثانيةً. والصفُّ يبقى مكتوبًا بمن طلب ومن نفّذ — وهو الأثر الذي
   * حلّ محلّ العضو الثاني.
   */
  if (soloQuorum()) return approveSettle(adminId, request.id, ip, now);

  return { ok: true, state: 'PENDING', approvals: 1, required: REQUIRED_APPROVALS };
}

/**
 * الموافقة الثانية — **وهي التي تُنادي البوابة**.
 *
 * والطالب لا يوافق على طلبه، وإلّا صار «عضوان» عضوًا يضغط مرّتين.
 * والفحوص تتكرّر عند التنفيذ: نزاعٌ فُتح بين الطلب والاعتماد هو الحالة
 * التي وُجد الفحص الثاني لأجلها.
 */
export async function approveSettle(
  adminId: string,
  requestId: string,
  ip: string | null,
  now: Date = new Date(),
): Promise<SettleResult> {
  const request = await db.approvalRequest.findUnique({ where: { id: requestId } });
  if (request === null || request.status !== 'PENDING') {
    return { ok: false, reason: 'NOT_PENDING' };
  }
  if (request.expiresAt.getTime() <= now.getTime()) {
    await db.approvalRequest.update({ where: { id: requestId }, data: { status: 'EXPIRED' } });
    return { ok: false, reason: 'EXPIRED' };
  }
  if (selfApprovalBlocked(request, adminId) || request.approvedBy.includes(adminId)) {
    return { ok: false, reason: 'SELF_APPROVAL' };
  }

  const approvals = [...request.approvedBy, adminId];
  // الطالب يُحسب واحدًا، والموافق الثاني يُكمل النصاب
  if (approvals.length + 1 < request.requiredApprovals) {
    await db.approvalRequest.update({ where: { id: requestId }, data: { approvedBy: approvals } });
    return { ok: true, state: 'PENDING', approvals: approvals.length + 1, required: request.requiredApprovals };
  }

  const order = await db.order.findUnique({
    where: { ref: request.entityId },
    select: {
      stage: true, status: true,
      payments: { where: { status: 'HELD' }, select: { id: true, holdRef: true, gatewayKey: true, environment: true, amount: true } },
    },
  });
  if (order === null) return { ok: false, reason: 'ORDER_NOT_FOUND' };

  // يُفحص ثانيةً: نزاعٌ قد يُفتح بين الطلب والاعتماد
  const guard = canSettle(order);
  if (!guard.allowed) return { ok: false, reason: guard.reason };

  const payment = order.payments[0];
  if (payment?.holdRef == null) return { ok: false, reason: 'NO_HELD_PAYMENT' };

  // **البوابة من لقطة المعاملة** — الحجز يُفرَج من حيث أُنشئ
  const gateway = await resolveForPayment(payment.gatewayKey, payment.environment);
  const settled = await gateway.settle(payment.holdRef);

  if (settled.state === 'FAILED') {
    return { ok: false, reason: 'GATEWAY_FAILED', code: settled.code };
  }

  // `PENDING` لا تُنهي الطلب: الويبهوك يُكمله، والنصاب قد اكتمل
  if (settled.state === 'CONFIRMED') {
    // **ومرجع المزوّد يُحفظ** — وبدونه تُطابق المطابقة اليومية بمرجع الحجز
    await applyState(payment.id, 'SETTLED', 'admin', now, undefined, {
      settleRef: settled.settleRef,
      settledAmount: settled.settledAmount,
    });
  }

  await db.approvalRequest.update({
    where: { id: requestId },
    data: { approvedBy: approvals, status: 'APPROVED', executedAt: now },
  });
  await db.auditLog.create({
    data: {
      actorId: adminId,
      actorType: 'admin',
      entity: 'Order',
      entityId: request.entityId,
      action: 'escrow.settled',
      before: { status: 'HELD' },
      after: {
        gatewayState: settled.state,
        amount: payment.amount.toString(),
        requestedBy: request.requestedBy,
        approvedBy: approvals,
      },
      ip,
      createdAt: now,
    },
  });

  return settled.state === 'CONFIRMED'
    ? { ok: true, state: 'SETTLED' }
    : { ok: true, state: 'PENDING', approvals: approvals.length + 1, required: request.requiredApprovals };
}

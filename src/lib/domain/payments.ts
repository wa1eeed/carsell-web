import { db } from '@/lib/db';
import { DEADLINE_DEFAULTS } from './deadlines';
import { recordOrderEarned, recordOrderPaid } from './ledger-events';
import type { Prisma } from '@/generated/prisma/client';
import type { PaymentPurpose, PaymentStatus } from '@/generated/prisma/enums';
import { resolveForPayment, resolveGateway } from '@/lib/payments/resolve';
import { canSettle } from './transfer-windows';

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
  | { ok: false; reason: 'PAYMENT_NOT_FOUND' | 'INVALID_TRANSITION' };

/**
 * نقل حالة الدفعة — **المدخل الوحيد**، ومنه يمرّ الويبهوك والأدمن معًا.
 *
 * وحين تصير `HELD` يُحجز الضمان في المعاملة نفسها: مبلغٌ محجوز بلا قيدٍ
 * يقول لمن هو مالٌ بلا صاحب في دفترنا.
 */
export async function applyState(
  paymentId: string,
  to: PaymentStatus,
  source: string,
  now: Date = new Date(),
  detail?: Prisma.InputJsonValue,
): Promise<AdvanceResult> {
  let orderId: string | null = null;

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
            buyerId: true, sellerId: true, totalAmount: true,
            commissionAmount: true, vatAmount: true, transferFee: true,
          },
        });

        await recordOrderEarned(
          tx,
          {
            orderId: payment.orderId,
            paymentId: payment.id,
            buyerId: order.buyerId,
            sellerId: order.sellerId,
            total: order.totalAmount,
            commission: order.commissionAmount,
            vat: order.vatAmount,
            govtFee: order.transferFee,
          },
          now,
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
      await issueSettlementDocuments(orderId, now);
    } catch (error) {
      const { reportError } = await import('@/lib/observability/report');
      reportError(error, { where: 'payments.applyState.issueDocuments', extra: { orderId } });
    }
  }

  return result;
}

/** الافتراضيّ — والسارية من إعداد الأدمن. */
export const SETTLE_WINDOW_HOURS = DEADLINE_DEFAULTS.settleWindowHours;

export type SettleFailure =
  | 'ORDER_NOT_FOUND'
  | 'NO_HELD_PAYMENT'
  | 'RETURN_WINDOW_OPEN'
  | 'NOT_TRANSFERRED'
  | 'DISPUTED'
  | 'ALREADY_PENDING'
  | 'SELF_APPROVAL'
  | 'NOT_PENDING'
  | 'EXPIRED'
  | 'GATEWAY_FAILED';

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
  now: Date = new Date(),
): Promise<SettleResult> {
  const order = await db.order.findUnique({
    where: { ref: orderRef },
    select: {
      id: true, stage: true, status: true, returnWindowEndsAt: true,
      payments: { where: { status: 'HELD' }, select: { id: true } },
    },
  });
  if (order === null) return { ok: false, reason: 'ORDER_NOT_FOUND' };
  if (order.payments.length === 0) return { ok: false, reason: 'NO_HELD_PAYMENT' };

  const guard = canSettle(order, now);
  if (!guard.allowed) {
    return {
      ok: false,
      reason: guard.reason === 'RETURN_WINDOW_OPEN' ? 'RETURN_WINDOW_OPEN'
        : guard.reason === 'DISPUTED' ? 'DISPUTED' : 'NOT_TRANSFERRED',
      ...(guard.reason === 'RETURN_WINDOW_OPEN' ? { until: guard.until } : {}),
    };
  }

  const existing = await db.approvalRequest.findFirst({
    where: { kind: 'ESCROW_RELEASE', entityType: 'Order', entityId: orderRef, status: 'PENDING' },
  });
  if (existing !== null) return { ok: false, reason: 'ALREADY_PENDING' };

  await db.approvalRequest.create({
    data: {
      kind: 'ESCROW_RELEASE',
      entityType: 'Order',
      entityId: orderRef,
      payload: { paymentId: order.payments[0]?.id ?? null },
      requestedBy: adminId,
      approvedBy: [],
      requiredApprovals: 2,
      status: 'PENDING',
      expiresAt: new Date(now.getTime() + SETTLE_WINDOW_HOURS * 3600 * 1000),
    },
  });

  return { ok: true, state: 'PENDING', approvals: 1, required: 2 };
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
  if (request.requestedBy === adminId || request.approvedBy.includes(adminId)) {
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
      stage: true, status: true, returnWindowEndsAt: true,
      payments: { where: { status: 'HELD' }, select: { id: true, holdRef: true, gatewayKey: true, environment: true, amount: true } },
    },
  });
  if (order === null) return { ok: false, reason: 'ORDER_NOT_FOUND' };

  // يُفحص ثانيةً: النافذة قد تكون فُتحت بنزاع بين الطلب والاعتماد
  const guard = canSettle(order, now);
  if (!guard.allowed) {
    return {
      ok: false,
      reason: guard.reason === 'DISPUTED' ? 'DISPUTED' : 'RETURN_WINDOW_OPEN',
      ...(guard.until === undefined ? {} : { until: guard.until }),
    };
  }

  const payment = order.payments[0];
  if (payment?.holdRef == null) return { ok: false, reason: 'NO_HELD_PAYMENT' };

  // **البوابة من لقطة المعاملة** — الحجز يُفرَج من حيث أُنشئ
  const gateway = await resolveForPayment(payment.gatewayKey, payment.environment);
  const settled = await gateway.settle(payment.holdRef);

  if (settled.state === 'FAILED') {
    return { ok: false, reason: 'GATEWAY_FAILED', code: settled.code };
  }

  // `PENDING` لا تُنهي الطلب: الويبهوك يُكمله، والنصاب قد اكتمل
  const target: PaymentStatus = settled.state === 'CONFIRMED' ? 'SETTLED' : 'PENDING';
  if (target === 'SETTLED') await applyState(payment.id, 'SETTLED', 'admin', now);

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

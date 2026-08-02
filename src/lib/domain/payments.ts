import { createHash } from 'node:crypto';
import { db } from '@/lib/db';
import type { Prisma } from '@/generated/prisma/client';
import type { PaymentStatus } from '@/generated/prisma/enums';
import type { PaymentProvider } from '@/lib/payments/provider';
import { PENDING_PROVIDER } from '@/lib/payments/provider';

/**
 * الدفع الحقيقي و3DS — المهمة ٢٧.
 *
 * **الحالة عندنا لا عند المزوّد.** المزوّد مصدر الحقيقة عن البطاقة،
 * ونحن مصدر الحقيقة عن الطلب. وقراءةُ حالة الطلب من المزوّد وقت العرض
 * تجعل الشاشة تتوقّف حين يتوقّف هو، والمال معلَّقًا بين النظامين.
 *
 * ولكل محاولة صفّها — لا صفّ للنجاح وحده: «دفعتُ ولم يصل» شكوى لا
 * يُردّ عليها إلا بسجلٍّ للمحاولة الفاشلة.
 */

/**
 * الانتقالات المسموحة.
 *
 * الجدول صريح لا مشتقّ: `CAPTURED ← FAILED` انتقالٌ يبدو مستحيلًا حتى
 * يصل ويب هوك متأخّر بعد أن انتهت المهلة، فيُقلب فشلٌ إلى نجاح ويُسلَّم
 * مبلغٌ لطلبٍ أُعيد نشره.
 */
const TRANSITIONS: Record<PaymentStatus, readonly PaymentStatus[]> = {
  CREATED: ['REQUIRES_3DS', 'AUTHORIZED', 'FAILED', 'CANCELLED'],
  REQUIRES_3DS: ['AUTHORIZED', 'FAILED', 'CANCELLED'],
  AUTHORIZED: ['CAPTURED', 'FAILED', 'CANCELLED'],
  CAPTURED: ['REFUNDED'],
  FAILED: [],
  CANCELLED: [],
  REFUNDED: [],
};

export function canTransition(from: PaymentStatus, to: PaymentStatus): boolean {
  return (TRANSITIONS[from] ?? []).includes(to);
}

/** الحالات التي تُعدّ محاولةً حيّة — لا تُبدأ ثانية بجانبها. */
const LIVE: readonly PaymentStatus[] = ['CREATED', 'REQUIRES_3DS', 'AUTHORIZED'];

export type StartResult =
  | { ok: true; paymentId: string; status: PaymentStatus; threeDsUrl: string | null }
  | {
      ok: false;
      reason:
        | 'ORDER_NOT_FOUND'
        | 'NOT_BUYER'
        | 'WRONG_STAGE'
        | 'WINDOW_PASSED'
        | 'ALREADY_PAID'
        | 'ATTEMPT_IN_FLIGHT'
        | 'PROVIDER_FAILED';
      code?: string;
    };

/**
 * بدء دفعة.
 *
 * **المبلغ من الطلب لا من الطلبِ الوارد**: قيمةٌ يرسلها المتصفّح تُدفَع
 * بها البطاقة هي بابٌ لدفع ريال واحد ثمنًا لسيارة. والطلب يحمل مبلغه
 * لقطةً منذ إنشائه.
 */
export async function startPayment(
  input: { orderRef: string; buyerId: string; method: string; returnUrl: string; idempotencyKey: string },
  provider: PaymentProvider = PENDING_PROVIDER,
  now: Date = new Date(),
): Promise<StartResult> {
  const order = await db.order.findUnique({
    where: { ref: input.orderRef },
    select: {
      id: true, buyerId: true, stage: true, status: true,
      totalAmount: true, paymentDueAt: true,
      payments: { select: { id: true, status: true } },
    },
  });

  if (order === null) return { ok: false, reason: 'ORDER_NOT_FOUND' };
  if (order.buyerId !== input.buyerId) return { ok: false, reason: 'NOT_BUYER' };
  if (order.stage !== 'PAYMENT') return { ok: false, reason: 'WRONG_STAGE' };
  if (order.paymentDueAt !== null && order.paymentDueAt.getTime() <= now.getTime()) {
    return { ok: false, reason: 'WINDOW_PASSED' };
  }
  if (order.payments.some((payment) => payment.status === 'CAPTURED')) {
    return { ok: false, reason: 'ALREADY_PAID' };
  }
  // محاولة حيّة قائمة ⇒ لا ثانية بجانبها، وإلّا خُصمت البطاقة مرّتين
  if (order.payments.some((payment) => LIVE.includes(payment.status))) {
    return { ok: false, reason: 'ATTEMPT_IN_FLIGHT' };
  }

  const payment = await db.payment.create({
    data: {
      orderId: order.id,
      amount: order.totalAmount,
      method: input.method,
      status: 'CREATED',
      createdAt: now,
    },
  });
  await record(payment.id, null, 'CREATED', 'payment.created', 'user', now);

  const charge = await provider.charge({
    amount: order.totalAmount.toString(),
    currency: 'SAR',
    method: input.method,
    orderRef: input.orderRef,
    returnUrl: input.returnUrl,
    idempotencyKey: input.idempotencyKey,
  });

  if (!charge.ok) {
    /**
     * فشل المزوّد **يُسجَّل ولا يُبتلع**. ولا مسار بديل للدفع، فالصمت
     * هنا شاشةٌ تدور بلا نهاية ومستخدمٌ لا يعرف أدُفع أم لا.
     */
    await db.payment.update({
      where: { id: payment.id },
      data: { status: 'FAILED', failedAt: now, failureCode: charge.code },
    });
    await record(payment.id, 'CREATED', 'FAILED', 'payment.failed', 'provider', now, {
      code: charge.code,
    });
    return { ok: false, reason: 'PROVIDER_FAILED', code: charge.code };
  }

  const next: PaymentStatus = charge.requires3ds ? 'REQUIRES_3DS' : 'AUTHORIZED';
  await db.payment.update({
    where: { id: payment.id },
    data: {
      status: next,
      providerRef: charge.providerRef,
      threeDsUrl: charge.requires3ds ? charge.threeDsUrl : null,
      ...(next === 'AUTHORIZED' ? { authorizedAt: now } : {}),
    },
  });
  await record(payment.id, 'CREATED', next, `payment.${next.toLowerCase()}`, 'provider', now);

  return {
    ok: true,
    paymentId: payment.id,
    status: next,
    threeDsUrl: charge.requires3ds ? charge.threeDsUrl : null,
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
      paymentId,
      type,
      fromStatus: from,
      toStatus: to,
      source,
      ...(detail === undefined ? {} : { detail }),
      createdAt: now,
    },
  });
}

export type AdvanceResult =
  | { ok: true; status: PaymentStatus }
  | { ok: false; reason: 'PAYMENT_NOT_FOUND' | 'INVALID_TRANSITION' };

/**
 * نقل حالة الدفعة — **المدخل الوحيد**، ومنه يمرّ الويب هوك والأدمن معًا.
 *
 * وحين تصير `CAPTURED` يُحجز الضمان في المعاملة نفسها: مبلغٌ قُبض ولم
 * يُحجز هو مالٌ في حسابنا بلا قيدٍ يقول لمن.
 */
export async function advancePayment(
  paymentId: string,
  to: PaymentStatus,
  source: string,
  now: Date = new Date(),
  detail?: Prisma.InputJsonValue,
): Promise<AdvanceResult> {
  return db.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({
      where: { id: paymentId },
      select: { id: true, status: true, orderId: true, amount: true },
    });
    if (payment === null) return { ok: false, reason: 'PAYMENT_NOT_FOUND' };
    if (!canTransition(payment.status, to)) return { ok: false, reason: 'INVALID_TRANSITION' };

    await tx.payment.update({
      where: { id: paymentId },
      data: {
        status: to,
        ...(to === 'AUTHORIZED' ? { authorizedAt: now } : {}),
        ...(to === 'CAPTURED' ? { capturedAt: now } : {}),
        ...(to === 'FAILED' ? { failedAt: now } : {}),
      },
    });

    await tx.paymentEvent.create({
      data: {
        paymentId,
        type: `payment.${to.toLowerCase()}`,
        fromStatus: payment.status,
        toStatus: to,
        source,
        ...(detail === undefined ? {} : { detail }),
        createdAt: now,
      },
    });

    if (to === 'CAPTURED') {
      const existing = await tx.escrow.findUnique({ where: { orderId: payment.orderId } });
      if (existing === null) {
        await tx.escrow.create({
          data: {
            orderId: payment.orderId,
            amount: payment.amount,
            status: 'HELD',
            heldAt: now,
            providerRef: null,
          },
        });
      } else if (existing.status === 'PENDING') {
        await tx.escrow.update({
          where: { orderId: payment.orderId },
          data: { status: 'HELD', heldAt: now },
        });
      }

      // الطلب يتقدّم إلى نقل الملكية — الدفع تمّ ودوره انتهى
      await tx.order.update({
        where: { id: payment.orderId },
        data: { stage: 'TRANSFER', stageEnteredAt: now },
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

    return { ok: true, status: to };
  });
}

export type ReleaseResult =
  | { ok: true; state: 'PENDING'; approvals: number; required: number }
  | { ok: true; state: 'RELEASED' }
  | {
      ok: false;
      reason: 'ESCROW_NOT_FOUND' | 'NOT_HELD' | 'ORDER_DISPUTED' | 'ALREADY_PENDING'
        | 'SELF_APPROVAL' | 'NOT_PENDING' | 'STAGE_TOO_EARLY';
    };

export const RELEASE_WINDOW_HOURS = 72;

/**
 * ═══ القاعدة ١٢ ═══ **الإفراج عن الضمان يحتاج موافقة عضوين.**
 *
 * وهي القاعدة الوحيدة في القسم ٧ التي بقيت بلا تنفيذ. والآلية نفسها
 * التي تدوّر المفاتيح (`ApprovalRequest`) — آلية واحدة لكل إجراء ثنائي،
 * وثانيةٌ بجانبها تعني قاعدتين تتباعدان.
 *
 * وثلاثة شروط قبل أن يُطلب الإفراج أصلًا:
 *   · المبلغ محتجز فعلًا — لا إفراج عمّا لم يُقبض.
 *   · الطلب بلغ نقل الملكية — الوعد للمشتري أن ماله لا يصل البائع قبلها.
 *   · لا نزاع مفتوح — النزاع يجمّد، والإفراج أثناءه يُفرغ محلّ الخصومة.
 */
export async function requestEscrowRelease(
  adminId: string,
  orderRef: string,
  now: Date = new Date(),
): Promise<ReleaseResult> {
  const order = await db.order.findUnique({
    where: { ref: orderRef },
    select: { id: true, stage: true, status: true, escrow: true },
  });
  if (order?.escrow == null) return { ok: false, reason: 'ESCROW_NOT_FOUND' };
  if (order.escrow.status !== 'HELD') return { ok: false, reason: 'NOT_HELD' };
  if (order.status === 'DISPUTED') return { ok: false, reason: 'ORDER_DISPUTED' };
  if (order.stage !== 'TRANSFER' && order.stage !== 'DONE') {
    return { ok: false, reason: 'STAGE_TOO_EARLY' };
  }

  const existing = await db.approvalRequest.findFirst({
    where: { kind: 'ESCROW_RELEASE', entityType: 'Escrow', entityId: order.escrow.id, status: 'PENDING' },
  });
  if (existing !== null) return { ok: false, reason: 'ALREADY_PENDING' };

  await db.approvalRequest.create({
    data: {
      kind: 'ESCROW_RELEASE',
      entityType: 'Escrow',
      entityId: order.escrow.id,
      payload: { orderRef, amount: order.escrow.amount.toString() },
      requestedBy: adminId,
      approvedBy: [],
      requiredApprovals: 2,
      status: 'PENDING',
      expiresAt: new Date(now.getTime() + RELEASE_WINDOW_HOURS * 3600 * 1000),
    },
  });

  return { ok: true, state: 'PENDING', approvals: 1, required: 2 };
}

export async function approveEscrowRelease(
  adminId: string,
  requestId: string,
  ip: string | null,
  now: Date = new Date(),
): Promise<ReleaseResult> {
  return db.$transaction(async (tx) => {
    const request = await tx.approvalRequest.findUnique({ where: { id: requestId } });
    if (request === null) return { ok: false, reason: 'NOT_PENDING' };
    if (request.status !== 'PENDING') return { ok: false, reason: 'NOT_PENDING' };
    // الطالب لا يعتمد طلبه — وإلّا صار «عضوان» عضوًا يضغط مرّتين
    if (request.requestedBy === adminId || request.approvedBy.includes(adminId)) {
      return { ok: false, reason: 'SELF_APPROVAL' };
    }

    const approvals = [...request.approvedBy, adminId];
    const total = approvals.length + 1;

    if (total < request.requiredApprovals) {
      await tx.approvalRequest.update({
        where: { id: requestId },
        data: { approvedBy: approvals },
      });
      return { ok: true, state: 'PENDING', approvals: total, required: request.requiredApprovals };
    }

    const escrow = await tx.escrow.findUnique({ where: { id: request.entityId } });
    if (escrow === null) return { ok: false, reason: 'ESCROW_NOT_FOUND' };
    // فُحصت عند الطلب وتُفحص عند التنفيذ: نزاعٌ فُتح بينهما يوقفه
    if (escrow.status !== 'HELD') return { ok: false, reason: 'NOT_HELD' };
    const order = await tx.order.findUnique({ where: { id: escrow.orderId } });
    if (order?.status === 'DISPUTED') return { ok: false, reason: 'ORDER_DISPUTED' };

    await tx.escrow.update({
      where: { id: escrow.id },
      data: { status: 'RELEASED', releasedAt: now },
    });
    await tx.approvalRequest.update({
      where: { id: requestId },
      data: { approvedBy: approvals, status: 'APPROVED', executedAt: now },
    });
    await tx.auditLog.create({
      data: {
        actorId: adminId,
        actorType: 'admin',
        entity: 'Escrow',
        entityId: escrow.id,
        action: 'escrow.released',
        before: { status: 'HELD' },
        after: {
          status: 'RELEASED',
          amount: escrow.amount.toString(),
          requestedBy: request.requestedBy,
          approvedBy: approvals,
        },
        ip,
        createdAt: now,
      },
    });

    return { ok: true, state: 'RELEASED' };
  });
}

/** بصمة الجسم — نفس المفتاح بجسم مختلف خطأٌ لا إعادة. */
export function hashBody(body: unknown): string {
  return createHash('sha256').update(JSON.stringify(body ?? null)).digest('hex');
}

export type IdempotencyHit =
  | { kind: 'fresh' }
  | { kind: 'replay'; response: unknown; status: number }
  | { kind: 'conflict' };

/**
 * القسم ٦ — **كل `POST` يقبل `Idempotency-Key`، وهو إلزامي للدفع**.
 *
 * الشبكة تُعيد الطلب بلا أن يعرف المستخدم، والمتصفّح يُعيده بضغطة
 * تحديث. وبلا هذا الجدول تُخصم البطاقة مرّتين — وهو أسوأ خطأ ممكن في
 * منتَج يبيع سيارات.
 */
export async function checkIdempotency(
  key: string,
  scope: string,
  body: unknown,
): Promise<IdempotencyHit> {
  const existing = await db.idempotencyKey.findUnique({ where: { key } });
  if (existing === null) return { kind: 'fresh' };

  // نفس المفتاح بجسم مختلف: خطأ في العميل لا إعادة — والإعادة الصامتة تُخفيه
  if (existing.bodyHash !== hashBody(body) || existing.scope !== scope) {
    return { kind: 'conflict' };
  }
  return { kind: 'replay', response: existing.response, status: existing.status };
}

export async function rememberIdempotency(
  key: string,
  scope: string,
  body: unknown,
  response: Prisma.InputJsonValue,
  status: number,
  now: Date = new Date(),
): Promise<void> {
  await db.idempotencyKey
    .create({
      data: { key, scope, bodyHash: hashBody(body), response, status, createdAt: now },
    })
    // سباقٌ بين طلبين متزامنين: الأوّل كتب، والثاني يقرأ ما كتبه
    .catch(() => undefined);
}

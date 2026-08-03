import { db } from '@/lib/db';
import { Prisma } from '@/generated/prisma/client';

/**
 * النزاعات — ثلاث قواعد مُلزِمة.
 *
 * ١. **فتح النزاع يجمّد الطلب في مرحلته ويوقف عدّاد الإلغاء.** لا يتقدّم
 *    ولا يسقط ما دام مفتوحًا.
 * ٢. **القرار يحتاج موافقة عضوين ثم يُنفَّذ تلقائيًا على الضمان** — لا
 *    تحويل يدوي بعده.
 * ٣. **مهلة الردّ ٤٨ ساعة من فتح النزاع لا من آخر رسالة.** صمت أحد
 *    الطرفين لا يمدّدها، وإلّا صار التجاهل استراتيجية.
 */

export const DISPUTE_SLA_HOURS = 48;
export const REQUIRED_APPROVALS = 2;

/** أقلّ ما يُمنَح عند استئناف مهلة الدفع بعد نزاع (قرار ٣). */
export const MIN_RESUMED_PAYMENT_MS = 6 * 3600 * 1000;

export type Resolution = 'FULL_REFUND' | 'PARTIAL_SETTLEMENT' | 'RELEASE_TO_SELLER';

export type OpenResult =
  | { ok: true; disputeId: string; slaDueAt: Date }
  | {
      ok: false;
      reason: 'ORDER_NOT_FOUND' | 'NOT_BUYER' | 'ALREADY_OPEN' | 'ORDER_CLOSED' | 'BEFORE_PAYMENT';
    };

/** المراحل التي يجوز فيها النزاع — المال في الضمان فصاعدًا. */
const DISPUTABLE_STAGES = ['PAYMENT', 'TRANSFER', 'DONE'] as const;

/**
 * فتح نزاع.
 *
 * التجميد يقع **في نفس المعاملة**: نزاعٌ يُفتح ثم يُجمَّد في خطوة ثانية
 * يترك نافذةً يمرّ فيها عدّاد الإلغاء ويُسقط الطلب — وهي بالضبط اللحظة
 * التي يفتح فيها المشتري نزاعه.
 */
/**
 * **المشتري وحده، وبعد دخول الطلب مرحلة الدفع.**
 *
 * البائع ليس له نزاع — له إلغاء بسبب، وبلاغ. وفتحُه نزاعًا مبكّرًا
 * يجمّد إعلانًا بلا كلفة، فيصير أداة تعطيل لا وسيلة إنصاف.
 *
 * وقبل الدفع لا مال في الضمان، فلا شيء يُتنازع عليه: النزاع أداةُ
 * فضٍّ لمالٍ محتجَز، لا اعتراضٌ على صفقة لم تبدأ.
 */
export async function openDispute(
  input: { orderRef: string; openedBy: string; reason: string },
  now: Date = new Date(),
): Promise<OpenResult> {
  return db.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { ref: input.orderRef },
      select: {
        id: true, status: true, buyerId: true, sellerId: true, stage: true, paymentDueAt: true,
      },
    });

    if (order === null) return { ok: false, reason: 'ORDER_NOT_FOUND' };
    if (order.buyerId !== input.openedBy) return { ok: false, reason: 'NOT_BUYER' };
    if (order.status === 'COMPLETED' || order.status === 'CANCELLED') {
      return { ok: false, reason: 'ORDER_CLOSED' };
    }
    if (!(DISPUTABLE_STAGES as readonly string[]).includes(order.stage)) {
      return { ok: false, reason: 'BEFORE_PAYMENT' };
    }

    const existing = await tx.dispute.findFirst({
      where: { orderId: order.id, status: { in: ['OPEN', 'INVESTIGATING'] } },
      select: { id: true },
    });
    if (existing !== null) return { ok: false, reason: 'ALREADY_OPEN' };

    // القاعدة ٣ — المهلة من الفتح، وتُثبَّت هنا ولا تُمسّ بعدها
    const slaDueAt = new Date(now.getTime() + DISPUTE_SLA_HOURS * 3600 * 1000);

    const dispute = await tx.dispute.create({
      data: {
        orderId: order.id,
        openedBy: input.openedBy,
        reason: input.reason,
        status: 'OPEN',
        openedAt: now,
        slaDueAt,
        messages: [],
      },
    });

    /**
     * ═══ القاعدة ١ + قرار ٣ ═══ التجميد **يحفظ المتبقّي**.
     *
     * إيقاف العدّاد بلا حفظ ما تبقّى يعني أنّ الاستئناف يمنح مهلة
     * كاملة جديدة — فيصير فتحُ نزاعٍ ثم إغلاقه وسيلةَ تمديد. والحفظ
     * يجعل الاستئناف من حيث توقّف بالضبط.
     */
    const remainingMs =
      order.paymentDueAt === null
        ? null
        : Math.max(0, order.paymentDueAt.getTime() - now.getTime());

    await tx.order.update({
      where: { id: order.id },
      data: {
        status: 'DISPUTED',
        ...(remainingMs === null ? {} : { paymentPausedRemainingMs: remainingMs }),
      },
    });

    await tx.orderEvent.create({
      data: {
        orderId: order.id,
        type: 'dispute.opened',
        fromStage: order.stage,
        actorId: input.openedBy,
        actorType: 'user',
        payload: { disputeId: dispute.id },
        createdAt: now,
      },
    });

    await tx.notification.create({
      data: {
        userId: order.sellerId,
        templateKey: 'dispute.opened',
        // فوات المهلة يُحسم النزاع بلا ردّه — فالإشعار حرج (قاعدة ١٧)
        priority: 'critical',
        entityType: 'Dispute',
        entityId: dispute.id,
      },
    });

    return { ok: true, disputeId: dispute.id, slaDueAt };
  });
}

/**
 * رسالة في النزاع — **لا تمسّ المهلة**.
 *
 * وهذا هو جوهر القاعدة ٣: لو جدّدت الرسائل المهلة لصار من يريد إطالة
 * النزاع يرسل رسالةً كل يوم، ومن يريد تجاهله يصمت فتمتدّ عليه المهلة
 * بلا نهاية. المهلة ثابتة، والصمت لا يفيد صاحبه.
 */
export async function addDisputeMessage(
  input: { disputeId: string; authorId: string; body: string },
  now: Date = new Date(),
): Promise<{ ok: boolean }> {
  const dispute = await db.dispute.findUnique({
    where: { id: input.disputeId },
    include: { order: { select: { buyerId: true, sellerId: true } } },
  });
  if (dispute === null) return { ok: false };
  if (dispute.order.buyerId !== input.authorId && dispute.order.sellerId !== input.authorId) {
    return { ok: false };
  }
  if (dispute.status !== 'OPEN' && dispute.status !== 'INVESTIGATING') return { ok: false };

  await db.dispute.update({
    where: { id: dispute.id },
    data: {
      status: 'INVESTIGATING',
      messages: {
        push: { authorId: input.authorId, body: input.body, at: now.toISOString() },
      },
      // `slaDueAt` **غير مذكور** عمدًا — الرسالة لا تمدّد المهلة
    },
  });

  return { ok: true };
}

export type ProposeResult =
  | { ok: true; approvalId: string }
  | { ok: false; reason: 'DISPUTE_NOT_FOUND' | 'NOT_OPEN' | 'AMOUNT_REQUIRED' | 'AMOUNT_INVALID' };

/**
 * ═══ القاعدة ٢، الشطر الأول ═══ اقتراح قرار ⇒ طلب موافقة.
 *
 * القرار **لا يُنفَّذ هنا**. يُنشأ `ApprovalRequest` بعضوين مطلوبين،
 * والتنفيذ يقع تلقائيًّا حين تكتمل الموافقات — لا تحويل يدوي بعده.
 *
 * وفصل الاقتراح عن التنفيذ هو ما يجعل «عضوين» شرطًا حقيقيًّا: لو نفّذ
 * المقترِح ثم طُلبت الموافقة لصارت الموافقة توثيقًا لما وقع.
 */
export async function proposeResolution(
  input: {
    disputeId: string;
    adminId: string;
    resolution: Resolution;
    amount?: number;
  },
  now: Date = new Date(),
): Promise<ProposeResult> {
  const dispute = await db.dispute.findUnique({
    where: { id: input.disputeId },
    include: { order: { select: { id: true, totalAmount: true } } },
  });

  if (dispute === null) return { ok: false, reason: 'DISPUTE_NOT_FOUND' };
  if (dispute.status !== 'OPEN' && dispute.status !== 'INVESTIGATING') {
    return { ok: false, reason: 'NOT_OPEN' };
  }

  if (input.resolution === 'PARTIAL_SETTLEMENT') {
    if (input.amount === undefined) return { ok: false, reason: 'AMOUNT_REQUIRED' };
    // تسوية جزئية تساوي الكل أو تتجاوزه ليست جزئية
    if (input.amount <= 0 || input.amount >= Number(dispute.order.totalAmount)) {
      return { ok: false, reason: 'AMOUNT_INVALID' };
    }
  }

  const approval = await db.approvalRequest.create({
    data: {
      kind: 'DISPUTE_RESOLUTION',
      entityType: 'Dispute',
      entityId: dispute.id,
      payload: {
        resolution: input.resolution,
        ...(input.amount === undefined ? {} : { amount: input.amount }),
      },
      requestedBy: input.adminId,
      approvedBy: [],
      requiredApprovals: REQUIRED_APPROVALS,
      status: 'PENDING',
      // الموافقة المعلّقة لا تبقى إلى الأبد — سبعة أيام ثم تسقط
      expiresAt: new Date(now.getTime() + 7 * 24 * 3600 * 1000),
    },
  });

  await db.dispute.update({
    where: { id: dispute.id },
    data: { approvalId: approval.id, status: 'INVESTIGATING' },
  });

  return { ok: true, approvalId: approval.id };
}

export type ApproveResult =
  | { ok: true; executed: boolean; approvals: number }
  | { ok: false; reason: 'APPROVAL_NOT_FOUND' | 'NOT_PENDING' | 'ALREADY_APPROVED' | 'SELF_APPROVAL' | 'EXPIRED' };

/**
 * ═══ القاعدة ٢، الشطر الثاني ═══ الموافقة، والتنفيذ التلقائي عند اكتمالها.
 *
 * **المقترِح لا يوافق على اقتراحه.** «عضوان» تعني عينين مستقلّتين، لا
 * ضغطتين من شخص واحد — وبلا هذا الشرط يصير العدد شكليًّا.
 */
export async function approveResolution(
  input: { approvalId: string; adminId: string },
  now: Date = new Date(),
): Promise<ApproveResult> {
  return db.$transaction(async (tx) => {
    const approval = await tx.approvalRequest.findUnique({ where: { id: input.approvalId } });

    if (approval === null) return { ok: false, reason: 'APPROVAL_NOT_FOUND' };
    if (approval.status !== 'PENDING') return { ok: false, reason: 'NOT_PENDING' };
    if (approval.expiresAt <= now) return { ok: false, reason: 'EXPIRED' };
    if (approval.requestedBy === input.adminId) return { ok: false, reason: 'SELF_APPROVAL' };
    if (approval.approvedBy.includes(input.adminId)) return { ok: false, reason: 'ALREADY_APPROVED' };

    const approvedBy = [...approval.approvedBy, input.adminId];
    const complete = approvedBy.length >= approval.requiredApprovals;

    await tx.approvalRequest.update({
      where: { id: approval.id },
      data: {
        approvedBy,
        ...(complete ? { status: 'APPROVED' as const, executedAt: now } : {}),
      },
    });

    if (!complete) return { ok: true, executed: false, approvals: approvedBy.length };

    // ═══ التنفيذ التلقائي على الضمان — لا تحويل يدوي بعده ═══
    await executeResolution(tx, approval.entityId, approval.payload, input.adminId, now);

    return { ok: true, executed: true, approvals: approvedBy.length };
  });
}

/**
 * تنفيذ القرار على حساب الضمان.
 *
 * الثلاثة وأثر كلٍّ منها على `Escrow`:
 *   · استرجاع كامل    ⇒ `REFUNDED`
 *   · تسوية جزئية     ⇒ `PARTIAL_REFUND` بمبلغ
 *   · إفراج للبائع    ⇒ `RELEASED`
 *
 * والطلب يخرج من التجميد في الحالات الثلاث — النزاع حُسم، فلا معنى
 * لإبقائه مجمَّدًا. والحسم يُنهي الطلب لا يعيده إلى مساره: قرارٌ صدر.
 */
async function executeResolution(
  tx: Prisma.TransactionClient,
  disputeId: string,
  payload: Prisma.JsonValue,
  adminId: string,
  now: Date,
): Promise<void> {
  const parsed = payload as { resolution?: Resolution; amount?: number };
  const resolution = parsed.resolution;
  if (resolution === undefined) return;

  const dispute = await tx.dispute.findUniqueOrThrow({
    where: { id: disputeId },
    include: {
      order: {
        select: {
          id: true, buyerId: true, sellerId: true, stage: true,
          totalAmount: true, paymentPausedRemainingMs: true,
        },
      },
    },
  });
  const order = dispute.order;

  if (resolution === 'PARTIAL_SETTLEMENT') {
    const refund = parsed.amount ?? 0;

    /**
     * ═══ التسوية تُكمل البيع ولا تُلغيه ═══
     *
     * الطرفان اتّفقا على سعر يعالج العيب: المشتري يبقي المركبة وتُنقَل
     * الملكية. وإلغاء الطلب يعني ردّ المركبة — وذاك «استرجاع كامل» لا
     * تسوية. والحال الذي كان مبنيًّا (مركبة بيد المشتري لا يملكها
     * نظامًا) أسوأ احتمال في المنصّة.
     *
     * والفرق يُرَد إلى **محفظة** المشتري لا إلى بطاقته: الردّ إلى
     * وسيلة الدفع يحتاج مزوّدًا ويستغرق أيامًا، والمحفظة قيدٌ فوريّ
     * يملكه صاحبه.
     */
    const wallet = await tx.wallet.upsert({
      where: { userId: order.buyerId },
      update: {},
      create: { userId: order.buyerId },
    });

    await tx.walletEntry.create({
      data: {
        walletId: wallet.id,
        amount: new Prisma.Decimal(refund),
        kind: 'settlement_refund',
        orderId: order.id,
        note: `dispute:${disputeId}`,
        createdAt: now,
      },
    });

    await tx.escrow.updateMany({
      where: { orderId: order.id },
      // الباقي يُفرَج للبائع — والحالة تقول إن جزءًا رُدّ
      data: { status: 'PARTIAL_REFUND', releasedAt: now },
    });

    await tx.order.update({
      where: { id: order.id },
      data: {
        // السعر الأصلي يبقى في `agreedPrice` — التدقيق يحتاج الاثنين
        settlementAmount: new Prisma.Decimal(Number(order.totalAmount) - refund),
        status: 'ACTIVE',
        stage: 'TRANSFER',
        stageEnteredAt: now,
        paymentPausedRemainingMs: null,
      },
    });
  } else if (resolution === 'FULL_REFUND') {
    await tx.escrow.updateMany({
      where: { orderId: order.id },
      data: { status: 'REFUNDED' },
    });
    await tx.order.update({
      where: { id: order.id },
      data: {
        status: 'CANCELLED',
        cancelledBy: 'admin',
        cancelReason: 'dispute.full_refund',
        paymentPausedRemainingMs: null,
      },
    });
  } else {
    await tx.escrow.updateMany({
      where: { orderId: order.id },
      data: { status: 'RELEASED', releasedAt: now },
    });

    /**
     * ═══ قرار ٣ ═══ الإفراج للبائع **يستأنف** مهلة الدفع إن كان
     * الطلب فيها، ولا يُنهي الطلب: النزاع رُفض، فيعود إلى مساره.
     *
     * ومن قضى نزاعًا لا يُطلب منه الدفع في نصف ساعة — فإن كان
     * المتبقّي أقلّ من ستّ ساعات مُنح ستًّا.
     */
    const resumed =
      order.stage === 'PAYMENT'
        ? new Date(
            now.getTime() +
              Math.max(
                MIN_RESUMED_PAYMENT_MS,
                order.paymentPausedRemainingMs ?? MIN_RESUMED_PAYMENT_MS,
              ),
          )
        : null;

    await tx.order.update({
      where: { id: order.id },
      data: {
        status: 'ACTIVE',
        paymentPausedRemainingMs: null,
        ...(resumed === null ? {} : { paymentDueAt: resumed }),
      },
    });
  }

  await tx.dispute.update({
    where: { id: disputeId },
    data: {
      status: resolution === 'RELEASE_TO_SELLER' ? 'RESOLVED_SELLER' : 'RESOLVED_BUYER',
      resolution,
      ...(parsed.amount === undefined
        ? {}
        : { resolutionAmount: new Prisma.Decimal(parsed.amount) }),
      resolvedBy: adminId,
      resolvedAt: now,
    },
  });

  await tx.orderEvent.create({
    data: {
      orderId: order.id,
      type: 'dispute.resolved',
      actorId: adminId,
      actorType: 'admin',
      payload: { resolution, ...(parsed.amount === undefined ? {} : { amount: parsed.amount }) },
      createdAt: now,
    },
  });

  for (const userId of [order.buyerId, order.sellerId]) {
    await tx.notification.create({
      data: {
        userId,
        templateKey: 'dispute.resolved',
        priority: 'critical',
        payload: { resolution },
        entityType: 'Dispute',
        entityId: disputeId,
      },
    });
  }
}

/**
 * النزاعات التي فاتت مهلتها — للطابور التشغيلي (A17).
 * **لا تُحسم تلقائيًّا**: قرارٌ ماليّ لا يصدر بانقضاء وقت، بل يُعرض على
 * الفريق كطابور متأخّر.
 */
export async function overdueDisputes(now: Date = new Date()) {
  return db.dispute.findMany({
    where: { status: { in: ['OPEN', 'INVESTIGATING'] }, slaDueAt: { lte: now } },
    orderBy: { slaDueAt: 'asc' },
    include: { order: { select: { ref: true, totalAmount: true } } },
  });
}

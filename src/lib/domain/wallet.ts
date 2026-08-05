import { Prisma } from '@/generated/prisma/client';
import { db } from '@/lib/db';
import { postEntries } from './ledger';

/**
 * ═══ محفظة العميل ═══
 *
 * `Wallet` و`WalletEntry` مزروعان منذ اليوم الأوّل، **ولا شاشة تقرؤهما
 * ولا دالّة تكتبهما**: صفٌّ يوجد لكل عميل ولا يتحرّك أبدًا. فمن رُدّ
 * إليه مبلغ، أو استُحقّ له تعويض، لا مكان يذهب إليه.
 *
 * ═══ والرصيد مجموع القيود ═══
 *
 * لا عمود `balance` — ولو وُجد لتباعد عن قيوده أوّل كتابةٍ تفشل في
 * منتصفها. والمجموع بطيءٌ ألفَ قيدٍ وصادقٌ دائمًا، والعمود عكسُه.
 *
 * ═══ وما يمسّ مال عميلٍ يُبنى محروسًا ═══
 *
 * إضافة رصيدٍ أو خصمُه تمرّ بموافقة شخصين — **تُبنى كذلك من أوّل سطر**
 * لا تُحرَس لاحقًا: بين البناء والحراسة نافذةٌ يعمل فيها بلا حارس،
 * ونشرةٌ واحدة في تلك النافذة تكفي.
 */

/** الحدّ الذي لا تُقبل فوقه منحةٌ بلا سببٍ مكتوب أطول. */
export const WALLET_REASON_MIN = 10;

export type WalletLine = {
  id: string;
  amount: string;
  /** موجبٌ إضافة وسالبٌ خصم — والإشارة في المبلغ لا في حقلٍ ثانٍ */
  kind: string;
  note: string | null;
  orderRef: string | null;
  at: string;
  /** الرصيد بعد هذا القيد — يُحسب بالتراكم لا يُخزَّن */
  runningBalance: string;
};

export type WalletView = {
  balance: string;
  lines: WalletLine[];
};

/**
 * كشف المحفظة برصيدٍ متراكم.
 *
 * **والتراكم من الأقدم**: قراءةُ الأحدث أوّلًا ثم الجمع تُنتج رصيدًا
 * معكوسًا — يبدأ من الصفر عند آخر قيدٍ وينتهي عند الرصيد الحاليّ في
 * أوّل صفٍّ من العمر.
 */
export async function walletView(userId: string): Promise<WalletView> {
  const wallet = await db.wallet.findUnique({
    where: { userId },
    select: { id: true },
  });

  if (wallet === null) return { balance: '0.00', lines: [] };

  const entries = await db.walletEntry.findMany({
    where: { walletId: wallet.id },
    orderBy: { createdAt: 'asc' },
    take: 200,
  });

  const orderIds = entries.map((entry) => entry.orderId).filter((id) => id !== null);
  const orders =
    orderIds.length === 0
      ? []
      : await db.order.findMany({
          where: { id: { in: orderIds } },
          select: { id: true, ref: true },
        });

  let running = new Prisma.Decimal(0);
  const lines = entries.map((entry) => {
    running = running.plus(entry.amount);
    return {
      id: entry.id,
      amount: entry.amount.toFixed(2),
      kind: entry.kind,
      note: entry.note,
      orderRef: orders.find((order) => order.id === entry.orderId)?.ref ?? null,
      at: entry.createdAt.toISOString(),
      runningBalance: running.toFixed(2),
    };
  });

  // الأحدث أوّلًا في العرض، والتراكم حُسب من الأقدم
  lines.reverse();

  return { balance: running.toFixed(2), lines };
}

export async function walletBalance(userId: string): Promise<string> {
  const wallet = await db.wallet.findUnique({ where: { userId }, select: { id: true } });
  if (wallet === null) return '0.00';

  const sum = await db.walletEntry.aggregate({
    where: { walletId: wallet.id },
    _sum: { amount: true },
  });

  return (sum._sum.amount ?? new Prisma.Decimal(0)).toFixed(2);
}

export type AdjustDirection = 'CREDIT' | 'DEBIT';

export type AdjustRequestResult =
  | { ok: true; requestId: string }
  | {
      ok: false;
      reason:
        | 'USER_NOT_FOUND'
        | 'BAD_AMOUNT'
        | 'REASON_TOO_SHORT'
        | 'INSUFFICIENT_BALANCE'
        | 'ALREADY_PENDING';
    };

/**
 * طلبُ تعديلِ رصيد — **ولا يُنفَّذ هنا**.
 *
 * يُنشئ `ApprovalRequest` بشخصين مطلوبين، والتنفيذ في `approveWalletAdjustment`
 * بيد الثاني. وطالبُ التعديل لا يوافق على نفسه.
 */
export async function requestWalletAdjustment(
  input: {
    userId: string;
    direction: AdjustDirection;
    amount: number;
    reason: string;
    adminId: string;
    ip: string | null;
  },
  now: Date = new Date(),
): Promise<AdjustRequestResult> {
  if (!Number.isFinite(input.amount) || input.amount <= 0) return { ok: false, reason: 'BAD_AMOUNT' };
  if (input.reason.trim().length < WALLET_REASON_MIN) {
    return { ok: false, reason: 'REASON_TOO_SHORT' };
  }

  const user = await db.user.findUnique({ where: { id: input.userId }, select: { id: true } });
  if (user === null) return { ok: false, reason: 'USER_NOT_FOUND' };

  /**
   * **والخصم لا يُنزل الرصيد تحت الصفر.** ورصيدٌ سالب يعني أن العميل
   * مدينٌ لنا بمالٍ لا سبيل لتحصيله، وشاشتُه تعرض رقمًا لا يفهمه.
   */
  if (input.direction === 'DEBIT') {
    const balance = new Prisma.Decimal(await walletBalance(input.userId));
    if (balance.lessThan(input.amount)) return { ok: false, reason: 'INSUFFICIENT_BALANCE' };
  }

  const pending = await db.approvalRequest.findFirst({
    where: {
      kind: 'WALLET_ADJUSTMENT',
      entityType: 'User',
      entityId: input.userId,
      status: 'PENDING',
    },
  });
  if (pending !== null) return { ok: false, reason: 'ALREADY_PENDING' };

  const request = await db.approvalRequest.create({
    data: {
      kind: 'WALLET_ADJUSTMENT',
      entityType: 'User',
      entityId: input.userId,
      payload: {
        direction: input.direction,
        amount: input.amount.toFixed(2),
        reason: input.reason.trim(),
      },
      requestedBy: input.adminId,
      approvedBy: [],
      requiredApprovals: 2,
      status: 'PENDING',
      expiresAt: new Date(now.getTime() + 72 * 3600 * 1000),
    },
  });

  await db.auditLog.create({
    data: {
      actorId: input.adminId,
      actorType: 'admin',
      entity: 'User',
      entityId: input.userId,
      action: 'wallet.adjustment_requested',
      before: {},
      after: {
        requestId: request.id,
        direction: input.direction,
        amount: input.amount.toFixed(2),
        reason: input.reason.trim(),
      },
      ip: input.ip,
      createdAt: now,
    },
  });

  return { ok: true, requestId: request.id };
}

export type AdjustApplyResult =
  | { ok: true; balance: string }
  | {
      ok: false;
      reason: 'REQUEST_NOT_FOUND' | 'NOT_PENDING' | 'SELF_APPROVAL' | 'EXPIRED' | 'INSUFFICIENT_BALANCE';
    };

/**
 * موافقةُ الثاني — **وهي التي تُنفّذ**.
 *
 * وتكتب ثلاثة في معاملةٍ واحدة: قيد المحفظة، وقيدَي الدفتر المتوازنين،
 * والأثر. **وفصلُها يترك رصيدًا بلا قيدٍ يفسّره** — وهو ما يجعل الدفتر
 * غير موثوقٍ به بين مراجعتين.
 */
export async function approveWalletAdjustment(
  input: { requestId: string; adminId: string; ip: string | null },
  now: Date = new Date(),
): Promise<AdjustApplyResult> {
  const request = await db.approvalRequest.findUnique({ where: { id: input.requestId } });
  if (request === null || request.kind !== 'WALLET_ADJUSTMENT') {
    return { ok: false, reason: 'REQUEST_NOT_FOUND' };
  }
  if (request.status !== 'PENDING') return { ok: false, reason: 'NOT_PENDING' };
  if (request.expiresAt !== null && request.expiresAt.getTime() < now.getTime()) {
    return { ok: false, reason: 'EXPIRED' };
  }

  // **ولا يوافق طالبُه على نفسه** — وإلّا فالنصاب واحدٌ بلباس اثنين
  if (request.requestedBy === input.adminId || request.approvedBy.includes(input.adminId)) {
    return { ok: false, reason: 'SELF_APPROVAL' };
  }

  const payload = request.payload as { direction: AdjustDirection; amount: string; reason: string };
  const userId = request.entityId;
  const amount = new Prisma.Decimal(payload.amount);
  const isCredit = payload.direction === 'CREDIT';

  /**
   * **ويُعاد فحص الرصيد عند التنفيذ لا عند الطلب وحده.** فبين الطلب
   * والموافقة قد يسحب العميل رصيده، فيصير الخصم المعتمَد سالبًا.
   */
  if (!isCredit) {
    const balance = new Prisma.Decimal(await walletBalance(userId));
    if (balance.lessThan(amount)) return { ok: false, reason: 'INSUFFICIENT_BALANCE' };
  }

  await db.$transaction(async (tx) => {
    const wallet = await tx.wallet.upsert({
      where: { userId },
      create: { userId },
      update: {},
      select: { id: true },
    });

    await tx.walletEntry.create({
      data: {
        walletId: wallet.id,
        // الإشارة في المبلغ — والاتّجاه لا يُخزَّن في حقلٍ ثانٍ يتباعد عنه
        amount: isCredit ? amount : amount.negated(),
        kind: isCredit ? 'admin_credit' : 'admin_debit',
        note: payload.reason,
        createdAt: now,
      },
    });

    /**
     * ═══ والطرف الثاني في الدفتر ═══
     *
     * منحةٌ للعميل: مصروفٌ علينا (مدين) والتزامٌ له (دائن).
     * وخصمٌ منه: يسقط التزامُنا (مدين) ويعود المصروف (دائن).
     */
    /**
     * **و`userId` على الطرف الذي يخصّه لا على المعاملة.** فطرفُ المحفظة
     * يحمل اسم العميل، وطرفُ المصروف حسابُنا نحن — ووسمُ الاثنين به
     * يجعل جمعَ «ما على العميل» يعدّ مصروفَنا معه.
     */
    const walletSide = { account: 'WALLET_PAYABLE' as const, userId, note: payload.reason, amount };
    const expenseSide = { account: 'GOODWILL_EXPENSE' as const, note: payload.reason, amount };

    await postEntries(tx, {
      event: isCredit ? 'wallet.admin_credit' : 'wallet.admin_debit',
      postings: isCredit
        ? [
            { ...expenseSide, direction: 'DEBIT' as const },
            { ...walletSide, direction: 'CREDIT' as const },
          ]
        : [
            { ...walletSide, direction: 'DEBIT' as const },
            { ...expenseSide, direction: 'CREDIT' as const },
          ],
    });

    await tx.approvalRequest.update({
      where: { id: request.id },
      data: {
        approvedBy: [...request.approvedBy, input.adminId],
        status: 'APPROVED',
        executedAt: now,
      },
    });
  });

  await db.auditLog.create({
    data: {
      actorId: input.adminId,
      actorType: 'admin',
      entity: 'User',
      entityId: userId,
      action: isCredit ? 'wallet.credited' : 'wallet.debited',
      before: {},
      after: {
        requestId: request.id,
        amount: payload.amount,
        reason: payload.reason,
        requestedBy: request.requestedBy,
      },
      ip: input.ip,
      createdAt: now,
    },
  });

  return { ok: true, balance: await walletBalance(userId) };
}

export type PendingAdjustment = {
  id: string;
  direction: AdjustDirection;
  amount: string;
  reason: string;
  requestedBy: string;
  expiresAt: string | null;
};

/** ما ينتظر موافقةً ثانية لهذا العميل. */
export async function pendingAdjustment(userId: string): Promise<PendingAdjustment | null> {
  const request = await db.approvalRequest.findFirst({
    where: {
      kind: 'WALLET_ADJUSTMENT',
      entityType: 'User',
      entityId: userId,
      status: 'PENDING',
    },
    orderBy: { id: 'desc' },
  });

  if (request === null) return null;

  const payload = request.payload as { direction: AdjustDirection; amount: string; reason: string };
  return {
    id: request.id,
    direction: payload.direction,
    amount: payload.amount,
    reason: payload.reason,
    requestedBy: request.requestedBy,
    expiresAt: request.expiresAt?.toISOString() ?? null,
  };
}

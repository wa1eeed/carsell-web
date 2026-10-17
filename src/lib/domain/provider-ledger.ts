import { Prisma } from '@/generated/prisma/client';
import { db } from '@/lib/db';
import { postEntries } from './ledger';

/**
 * ═══ حسابُ المزوّد — وكان دَينًا بلا صاحب ═══
 *
 * `PROVIDER_PAYABLE` يُقيَّد عند كل خدمةٍ تُنجَز **ولا شيء يخصمه**،
 * و`LedgerEntry` كان بلا `providerId` — فنعرف كم علينا للمزوّدين
 * مجموعين ولا نعرف لمن، ولا نعرف ما سُدّد منه. فلا رصيدَ ولا كشف.
 *
 * **والحسابُ هو الدفتر نفسه لا جدولٌ ثانٍ.** محفظةُ العميل لها
 * `Wallet` ومرآتُها في الدفتر — وذاك إرثٌ قائم. وهنا لا داعي لمصدرَي
 * حقيقةٍ يتباعدان: الرصيد مجموعُ قيوده، والكشف قيودُه.
 *
 * ═══ والإشارة ═══
 *
 * الحسابُ التزامٌ علينا: **الدائن يزيد ما له، والمدين ينقصه**. فحين
 * نسدّد له يُقيَّد مدينًا، وحين نستحقّ له يُقيَّد دائنًا.
 */

/** أدنى طولٍ لسبب القيد — سببٌ من كلمةٍ لا يُفهَم بعد سنة. */
export const PROVIDER_REASON_MIN = 10;

export type ProviderLedgerLine = {
  id: string;
  /** موجبٌ يزيد ما له علينا، وسالبٌ ينقصه — والإشارة في المبلغ وحدها. */
  amount: string;
  event: string;
  note: string | null;
  at: string;
  /** الرصيد بعد هذا القيد — يُحسب بالتراكم لا يُخزَّن. */
  runningBalance: string;
};

export type ProviderLedgerView = {
  /** ما له علينا الآن. */
  balance: string;
  /** مجموعُ ما استُحقّ له منذ البداية — لا ينقص بالسداد. */
  credited: string;
  /** مجموعُ ما سُدِّد أو خُصم. */
  debited: string;
  lines: ProviderLedgerLine[];
};

function zero(): Prisma.Decimal {
  return new Prisma.Decimal(0);
}

/**
 * كشفُ حساب المزوّد برصيدٍ متراكم.
 *
 * **والتراكم من الأقدم** — قراءةُ الأحدث أوّلًا ثم الجمع تُنتج رصيدًا
 * معكوسًا يبدأ من الصفر عند آخر قيد.
 */
export async function providerLedger(
  providerId: string,
  limit = 200,
): Promise<ProviderLedgerView> {
  const rows = await db.ledgerEntry.findMany({
    where: { providerId, account: 'PROVIDER_PAYABLE' },
    orderBy: { createdAt: 'asc' },
    select: { id: true, amount: true, direction: true, event: true, note: true, createdAt: true },
  });

  let running = zero();
  let credited = zero();
  let debited = zero();
  const lines: ProviderLedgerLine[] = [];

  for (const row of rows) {
    const signed = row.direction === 'CREDIT' ? row.amount : row.amount.negated();
    running = running.plus(signed);
    if (row.direction === 'CREDIT') credited = credited.plus(row.amount);
    else debited = debited.plus(row.amount);

    lines.push({
      id: row.id,
      amount: signed.toFixed(2),
      event: row.event,
      note: row.note,
      at: row.createdAt.toISOString(),
      runningBalance: running.toFixed(2),
    });
  }

  /** **والأحدث أوّلًا في العرض** — والتراكم حُسب من الأقدم. */
  return {
    balance: running.toFixed(2),
    credited: credited.toFixed(2),
    debited: debited.toFixed(2),
    lines: lines.reverse().slice(0, limit),
  };
}

export async function providerBalance(providerId: string): Promise<string> {
  const grouped = await db.ledgerEntry.groupBy({
    by: ['direction'],
    where: { providerId, account: 'PROVIDER_PAYABLE' },
    _sum: { amount: true },
  });

  let balance = zero();
  for (const row of grouped) {
    const sum = row._sum.amount ?? zero();
    balance = row.direction === 'CREDIT' ? balance.plus(sum) : balance.minus(sum);
  }
  return balance.toFixed(2);
}

export type ProviderAdjustDirection = 'CREDIT' | 'DEBIT';

export type ProviderAdjustRequestResult =
  | { ok: true; requestId: string }
  | {
      ok: false;
      reason:
        | 'PROVIDER_NOT_FOUND'
        | 'BAD_AMOUNT'
        | 'REASON_TOO_SHORT'
        | 'INSUFFICIENT_BALANCE'
        | 'ALREADY_PENDING';
    };

/**
 * طلبُ قيدٍ يدويّ — **ولا يقع هنا**.
 *
 * يُنشأ `ApprovalRequest` بشخصين، والتنفيذ بيد الثاني. وطالبُه لا
 * يوافق على نفسه، كما في محفظة العميل حرفيًّا.
 */
export async function requestProviderAdjustment(
  input: {
    providerId: string;
    direction: ProviderAdjustDirection;
    amount: number;
    reason: string;
    adminId: string;
    ip: string | null;
  },
  now: Date = new Date(),
): Promise<ProviderAdjustRequestResult> {
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return { ok: false, reason: 'BAD_AMOUNT' };
  }
  if (input.reason.trim().length < PROVIDER_REASON_MIN) {
    return { ok: false, reason: 'REASON_TOO_SHORT' };
  }

  const provider = await db.serviceProvider.findUnique({
    where: { id: input.providerId },
    select: { id: true },
  });
  if (provider === null) return { ok: false, reason: 'PROVIDER_NOT_FOUND' };

  /**
   * **والخصم لا يُنزل الحساب تحت الصفر.** رصيدٌ سالب يعني أنّ المزوّد
   * مدينٌ لنا، وذاك مطالبةٌ لا قيدٌ في حساب دائن — ولها بابُها حين
   * يُقرَّر، لا بابٌ خلفيّ من أداة التسوية.
   */
  if (input.direction === 'DEBIT') {
    const balance = new Prisma.Decimal(await providerBalance(input.providerId));
    if (balance.lessThan(input.amount)) return { ok: false, reason: 'INSUFFICIENT_BALANCE' };
  }

  const pending = await db.approvalRequest.findFirst({
    where: {
      kind: 'PROVIDER_ADJUSTMENT',
      entityType: 'ServiceProvider',
      entityId: input.providerId,
      status: 'PENDING',
    },
  });
  if (pending !== null) return { ok: false, reason: 'ALREADY_PENDING' };

  const request = await db.approvalRequest.create({
    data: {
      kind: 'PROVIDER_ADJUSTMENT',
      entityType: 'ServiceProvider',
      entityId: input.providerId,
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
      entity: 'ServiceProvider',
      entityId: input.providerId,
      action: 'provider.adjustment_requested',
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

export type ProviderAdjustApplyResult =
  | { ok: true; balance: string }
  | {
      ok: false;
      reason:
        | 'REQUEST_NOT_FOUND'
        | 'NOT_PENDING'
        | 'EXPIRED'
        | 'SELF_APPROVAL'
        | 'INSUFFICIENT_BALANCE';
    };

export async function approveProviderAdjustment(
  input: { requestId: string; adminId: string; ip: string | null },
  now: Date = new Date(),
): Promise<ProviderAdjustApplyResult> {
  const request = await db.approvalRequest.findUnique({ where: { id: input.requestId } });
  if (request === null || request.kind !== 'PROVIDER_ADJUSTMENT') {
    return { ok: false, reason: 'REQUEST_NOT_FOUND' };
  }
  if (request.status !== 'PENDING') return { ok: false, reason: 'NOT_PENDING' };
  if (request.expiresAt !== null && request.expiresAt.getTime() < now.getTime()) {
    return { ok: false, reason: 'EXPIRED' };
  }
  /** **ولا يوافق طالبُه على نفسه** — وإلّا فالنصاب واحدٌ بلباس اثنين. */
  if (request.requestedBy === input.adminId || request.approvedBy.includes(input.adminId)) {
    return { ok: false, reason: 'SELF_APPROVAL' };
  }

  const payload = request.payload as {
    direction: ProviderAdjustDirection;
    amount: string;
    reason: string;
  };
  const providerId = request.entityId;
  const amount = new Prisma.Decimal(payload.amount);
  const isCredit = payload.direction === 'CREDIT';

  /** **ويُعاد الفحص عند التنفيذ**: بين الطلب والموافقة قد يتغيّر الرصيد. */
  if (!isCredit) {
    const balance = new Prisma.Decimal(await providerBalance(providerId));
    if (balance.lessThan(amount)) return { ok: false, reason: 'INSUFFICIENT_BALANCE' };
  }

  await db.$transaction(async (tx) => {
    /**
     * ═══ والطرف الثاني في الدفتر ═══
     *
     * زيادةُ ما له: مصروفٌ علينا (مدين) والتزامٌ له (دائن).
     * ونقصُه: يسقط التزامُنا (مدين) ويعود المصروف (دائن).
     *
     * **والاسمُ على طرفه وحده**: `GOODWILL_EXPENSE` حسابُنا نحن، ووسمُه
     * بالمزوّد يجعل جمعَ «ما له علينا» يعدّ مصروفَنا معه فيتضاعف.
     */
    const providerSide = {
      account: 'PROVIDER_PAYABLE' as const,
      providerId,
      note: payload.reason,
      amount,
    };
    const expenseSide = {
      account: 'GOODWILL_EXPENSE' as const,
      note: payload.reason,
      amount,
    };

    await postEntries(tx, {
      event: isCredit ? 'provider.admin_credit' : 'provider.admin_debit',
      postings: isCredit
        ? [
            { ...expenseSide, direction: 'DEBIT' as const },
            { ...providerSide, direction: 'CREDIT' as const },
          ]
        : [
            { ...providerSide, direction: 'DEBIT' as const },
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
      entity: 'ServiceProvider',
      entityId: providerId,
      action: isCredit ? 'provider.credited' : 'provider.debited',
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

  return { ok: true, balance: await providerBalance(providerId) };
}

export type PendingProviderAdjustment = {
  id: string;
  direction: ProviderAdjustDirection;
  amount: string;
  reason: string;
  requestedBy: string;
  /** مهلةُ الطلب — و`ApprovalRequest` بلا `createdAt` فلا يُختلق. */
  expiresAt: string | null;
};

export async function pendingProviderAdjustment(
  providerId: string,
): Promise<PendingProviderAdjustment | null> {
  const row = await db.approvalRequest.findFirst({
    where: {
      kind: 'PROVIDER_ADJUSTMENT',
      entityType: 'ServiceProvider',
      entityId: providerId,
      status: 'PENDING',
    },
    orderBy: { id: 'desc' },
  });
  if (row === null) return null;

  const payload = row.payload as {
    direction: ProviderAdjustDirection;
    amount: string;
    reason: string;
  };
  return {
    id: row.id,
    direction: payload.direction,
    amount: payload.amount,
    reason: payload.reason,
    requestedBy: row.requestedBy,
    expiresAt: row.expiresAt.toISOString(),
  };
}

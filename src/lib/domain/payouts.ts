import { Prisma } from '@/generated/prisma/client';
import { db } from '@/lib/db';
import { ibanLast4 } from './iban';
import { accountBalance } from './ledger';
import { recordSellerPayout } from './ledger-events';
import { REQUIRED_APPROVALS, selfApprovalBlocked } from './approvals';

/**
 * ═══ تحويل مستحقّات البائع — الطرف الأخير من رحلة البيع ═══
 *
 * **ولم يكن له باب.** `recordSellerPayout` مكتوبة منذ بُني الدفتر،
 * وتعليقها يقول إن `SELLER_PAYABLE` يبقى موجبًا إلى الأبد ما لم
 * تُنادى — **ولا شيء في المنتج كلّه كان يناديها**. فدفتر البائع
 * يعرض «جاهز للصرف» ينمو مع كل بيعة، و«حُوِّل إليك: ٠٫٠٠» إلى
 * الأبد. والشاشة تقول «وصل آيبانك» عن مالٍ لم يخرج.
 *
 * ═══ والمال يخرج بيدٍ لا بتكامل ═══
 *
 * التحويل البنكيّ إلى آيبان البائع تفعله المالية من بنكها (التكاملات
 * مؤجَّلة بقرار المالك). فهذا **سجلٌّ يُطابَق به كشف البنك**: من اعتمد،
 * وبأيّ مرجع، وإلى أيّ آيبان — ثم يُكتب القيد فيُصفَّر الحقّ.
 *
 * ═══ ونصابه اثنان ═══
 *
 * مالٌ يخرج إلى حسابٍ خارج النظام لا يُخرجه واحد، وهو أخطر من تعديل
 * رصيدٍ داخليّ (`WALLET_ADJUSTMENT`) لأنه لا يُستردّ. فالطلب يُنشئ
 * `ApprovalRequest` بنصاب اثنين، والاعتماد بيد الثاني — وهو الذي
 * يكتب القيد.
 */

const zero = new Prisma.Decimal(0);

/** يُقاس على نصاب `WALLET_ADJUSTMENT` — والمهلة ٧٢ ساعة كأخواتها. */
const APPROVAL_HOURS = 72;

export type PayableSeller = {
  sellerId: string;
  name: string;
  /** حقُّه القائم من الدفتر — لا من مجموع طلباته */
  payable: string;
  /** آخر أربع من آيبانه، و`null` يعني أنه لم يُدخله */
  ibanLast4: string | null;
  /** تحويلٌ ينتظر الموافقة الثانية — فلا يُطلب ثانٍ فوقه */
  pendingPayoutId: string | null;
  pendingAmount: string | null;
};

/**
 * من له مالٌ قائم — **قراءةٌ لا تكتب**.
 *
 * ودالّةٌ تمرّ على كل المتأخّرين وتكتب هي الشكل الذي يُفرِج عن مئة
 * مبلغ بخطأ سطر: فالقائمة تُقرأ، والتحويل استدعاءٌ مفرد صريح لكلّ
 * بائع (`requestPayout`).
 */
export async function payableSellers(): Promise<PayableSeller[]> {
  /**
   * الأرصدة من الدفتر بتجميعةٍ واحدة — لا استعلام لكل بائع. والصافي
   * `CREDIT − DEBIT` لأن `SELLER_PAYABLE` حسابٌ دائنُ الطبيعة.
   */
  const rows = await db.ledgerEntry.groupBy({
    by: ['userId', 'direction'],
    where: { account: 'SELLER_PAYABLE', userId: { not: null } },
    _sum: { amount: true },
  });

  const balances = new Map<string, Prisma.Decimal>();
  for (const row of rows) {
    if (row.userId === null) continue;
    const amount = row._sum.amount ?? zero;
    const current = balances.get(row.userId) ?? zero;
    balances.set(
      row.userId,
      row.direction === 'CREDIT' ? current.plus(amount) : current.minus(amount),
    );
  }

  const owed = [...balances.entries()].filter(([, balance]) => balance.greaterThan(zero));
  if (owed.length === 0) return [];

  const ids = owed.map(([sellerId]) => sellerId);
  const [users, pending] = await Promise.all([
    db.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, iban: true },
    }),
    db.payout.findMany({
      where: { sellerId: { in: ids }, status: 'PENDING' },
      select: { id: true, sellerId: true, amount: true },
    }),
  ]);

  const byId = new Map(users.map((user) => [user.id, user]));
  const pendingBySeller = new Map(pending.map((row) => [row.sellerId, row]));

  return owed
    .map(([sellerId, balance]) => {
      const user = byId.get(sellerId);
      const waiting = pendingBySeller.get(sellerId) ?? null;
      return {
        sellerId,
        name: user?.name ?? '',
        payable: balance.toFixed(2),
        ibanLast4: ibanLast4(user?.iban ?? null),
        pendingPayoutId: waiting?.id ?? null,
        pendingAmount: waiting === null ? null : waiting.amount.toFixed(2),
      };
    })
    .sort((a, b) => Number(b.payable) - Number(a.payable));
}

export type PayoutRequestResult =
  | { ok: true; payoutId: string; requestId: string }
  | {
      ok: false;
      reason: 'SELLER_NOT_FOUND' | 'NO_IBAN' | 'BAD_AMOUNT' | 'EXCEEDS_PAYABLE' | 'ALREADY_PENDING';
    };

/**
 * طلبُ تحويل — **ولا مال يخرج هنا ولا قيد يُكتب**.
 *
 * والمبلغ يُفحص مقابل الدفتر لا مقابل ما أرسلته الشاشة: حارسٌ في
 * العميل ليس حارسًا.
 */
export async function requestPayout(
  input: { sellerId: string; amount: number | string; adminId: string; ip: string | null; note?: string },
  now: Date = new Date(),
): Promise<PayoutRequestResult> {
  const amount = new Prisma.Decimal(input.amount);
  if (!amount.isFinite() || amount.lessThanOrEqualTo(zero)) return { ok: false, reason: 'BAD_AMOUNT' };

  const seller = await db.user.findUnique({
    where: { id: input.sellerId },
    select: { id: true, iban: true },
  });
  if (seller === null) return { ok: false, reason: 'SELLER_NOT_FOUND' };

  /**
   * **ولا تحويل بلا آيبان.** والشرط يُفحص هنا لا عند الاعتماد وحده:
   * طلبٌ يُعتمد ثمّ يتعذّر تنفيذه يترك النصاب مستهلَكًا على لا شيء.
   */
  const last4 = ibanLast4(seller.iban);
  if (last4 === null) return { ok: false, reason: 'NO_IBAN' };

  const payable = await accountBalance('SELLER_PAYABLE', { userId: input.sellerId });
  if (amount.greaterThan(payable)) return { ok: false, reason: 'EXCEEDS_PAYABLE' };

  const waiting = await db.payout.findFirst({
    where: { sellerId: input.sellerId, status: 'PENDING' },
    select: { id: true },
  });
  if (waiting !== null) return { ok: false, reason: 'ALREADY_PENDING' };

  const created = await db.$transaction(async (tx) => {
    const request = await tx.approvalRequest.create({
      data: {
        kind: 'SELLER_PAYOUT',
        entityType: 'User',
        entityId: input.sellerId,
        payload: { amount: amount.toFixed(2), ibanLast4: last4 },
        requestedBy: input.adminId,
        approvedBy: [],
        requiredApprovals: REQUIRED_APPROVALS,
        status: 'PENDING',
        expiresAt: new Date(now.getTime() + APPROVAL_HOURS * 3600 * 1000),
      },
    });

    const payout = await tx.payout.create({
      data: {
        sellerId: input.sellerId,
        amount,
        status: 'PENDING',
        ibanLast4: last4,
        ...(input.note === undefined ? {} : { note: input.note }),
        approvalRequestId: request.id,
        requestedBy: input.adminId,
        createdAt: now,
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: input.adminId,
        actorType: 'admin',
        entity: 'Payout',
        entityId: payout.id,
        action: 'payout.requested',
        before: {},
        after: { sellerId: input.sellerId, amount: amount.toFixed(2), requestId: request.id },
        ip: input.ip,
        createdAt: now,
      },
    });

    return { payoutId: payout.id, requestId: request.id };
  });

  return { ok: true, ...created };
}

export type PayoutApplyResult =
  | { ok: true; payoutId: string; remaining: string }
  | {
      ok: false;
      reason:
        | 'PAYOUT_NOT_FOUND'
        | 'NOT_PENDING'
        | 'SELF_APPROVAL'
        | 'EXPIRED'
        | 'EXCEEDS_PAYABLE'
        | 'BANK_REF_REQUIRED';
    };

/**
 * اعتمادُ الثاني — **وهو الذي يكتب القيد**.
 *
 * ويكتب ثلاثةً في معاملةٍ واحدة: الصفّ `SENT`، وقيدَي الدفتر
 * المتوازنين، والأثر. **وفصلُها يترك حوالةً بلا قيدٍ يفسّرها** —
 * فيبقى حقُّ البائع موجبًا وقد وصله ماله.
 */
export async function approvePayout(
  input: { payoutId: string; adminId: string; bankRef: string; ip: string | null },
  now: Date = new Date(),
): Promise<PayoutApplyResult> {
  const bankRef = input.bankRef.trim();
  /**
   * **ومرجع الحوالة شرطٌ لا حقلٌ اختياريّ.** حوالةٌ بلا مرجع لا
   * تُطابَق بكشف البنك، فالدفتر يقول إنها خرجت ولا سبيل إلى إثباتها.
   */
  if (bankRef.length < 4) return { ok: false, reason: 'BANK_REF_REQUIRED' };

  const payout = await db.payout.findUnique({ where: { id: input.payoutId } });
  if (payout === null) return { ok: false, reason: 'PAYOUT_NOT_FOUND' };
  if (payout.status !== 'PENDING') return { ok: false, reason: 'NOT_PENDING' };

  const request =
    payout.approvalRequestId === null
      ? null
      : await db.approvalRequest.findUnique({ where: { id: payout.approvalRequestId } });

  if (request !== null) {
    if (request.status !== 'PENDING') return { ok: false, reason: 'NOT_PENDING' };
    if (request.expiresAt.getTime() < now.getTime()) return { ok: false, reason: 'EXPIRED' };
  }

  // **ولا يعتمد طالبُه على نفسه** — وإلّا فالنصاب واحدٌ بلباس اثنين
  /**
   * ═══ والصرفُ مرحلتان بطبعه لا بنصابه ═══
   *
   * `bankRef` مرجعُ حوالةٍ وقعت فعلًا، ولا يملكه الطالبُ ساعةَ الطلب.
   * فالمرحلتان تبقيان بعد نصاب الواحد — **لكنّهما لشخصٍ واحد**: يَطلب
   * ثمّ يُدخل المرجعَ حين يُحوّل. والممنوعُ هو العضو الثاني لا الخطوة
   * الثانية.
   */
  if (
    (request !== null && selfApprovalBlocked(request, input.adminId)) ||
    (request?.approvedBy ?? []).includes(input.adminId)
  ) {
    return { ok: false, reason: 'SELF_APPROVAL' };
  }

  /**
   * **ويُعاد فحص الحقّ عند الاعتماد لا عند الطلب وحده.** فبين الطلب
   * والاعتماد قد يُردّ طلبٌ أو يُحسم نزاعٌ فينقص رصيد البائع، فيصير
   * التحويل المعتمَد أكبر من حقّه — ويخرج مالٌ لا يقابله التزام.
   */
  const payable = await accountBalance('SELLER_PAYABLE', { userId: payout.sellerId });
  if (payout.amount.greaterThan(payable)) return { ok: false, reason: 'EXCEEDS_PAYABLE' };

  await db.$transaction(async (tx) => {
    await tx.payout.update({
      where: { id: payout.id },
      data: { status: 'SENT', bankRef, sentBy: input.adminId, sentAt: now },
    });

    if (request !== null) {
      await tx.approvalRequest.update({
        where: { id: request.id },
        data: {
          approvedBy: [...request.approvedBy, input.adminId],
          status: 'APPROVED',
          executedAt: now,
        },
      });
    }

    await recordSellerPayout(
      tx,
      {
        sellerId: payout.sellerId,
        amount: payout.amount,
        note: `payout ${payout.id} · ${bankRef}`,
      },
      now,
    );

    await tx.auditLog.create({
      data: {
        actorId: input.adminId,
        actorType: 'admin',
        entity: 'Payout',
        entityId: payout.id,
        action: 'payout.sent',
        before: { status: 'PENDING' },
        after: { status: 'SENT', amount: payout.amount.toFixed(2), bankRef },
        ip: input.ip,
        createdAt: now,
      },
    });
  });

  const remaining = await accountBalance('SELLER_PAYABLE', { userId: payout.sellerId });
  return { ok: true, payoutId: payout.id, remaining: remaining.toFixed(2) };
}

export type PayoutRejectResult =
  | { ok: true }
  | { ok: false; reason: 'PAYOUT_NOT_FOUND' | 'NOT_PENDING' };

/**
 * الردّ — **ويملكه طالبُه أيضًا**. فالطالب قد يكتشف خطأه، وإلزامه
 * بانتظار ثانٍ ليُلغي ما لم يقع ليس حراسةً بل عرقلة. والنصاب على
 * **خروج** المال لا على إلغائه.
 */
export async function rejectPayout(
  input: { payoutId: string; adminId: string; reason: string; ip: string | null },
  now: Date = new Date(),
): Promise<PayoutRejectResult> {
  const payout = await db.payout.findUnique({ where: { id: input.payoutId } });
  if (payout === null) return { ok: false, reason: 'PAYOUT_NOT_FOUND' };
  if (payout.status !== 'PENDING') return { ok: false, reason: 'NOT_PENDING' };

  await db.$transaction(async (tx) => {
    await tx.payout.update({
      where: { id: payout.id },
      data: { status: 'CANCELLED', note: input.reason.trim(), failedAt: now },
    });

    if (payout.approvalRequestId !== null) {
      await tx.approvalRequest.updateMany({
        where: { id: payout.approvalRequestId, status: 'PENDING' },
        data: { status: 'REJECTED', executedAt: now },
      });
    }

    await tx.auditLog.create({
      data: {
        actorId: input.adminId,
        actorType: 'admin',
        entity: 'Payout',
        entityId: payout.id,
        action: 'payout.cancelled',
        before: { status: 'PENDING' },
        after: { status: 'CANCELLED', reason: input.reason.trim() },
        ip: input.ip,
        createdAt: now,
      },
    });
  });

  return { ok: true };
}

export type PayoutRow = {
  id: string;
  sellerId: string;
  sellerName: string | null;
  amount: string;
  status: 'PENDING' | 'SENT' | 'FAILED' | 'CANCELLED';
  ibanLast4: string | null;
  bankRef: string | null;
  requestedBy: string;
  createdAt: string;
  sentAt: string | null;
};

/** آخر التحويلات — للأدمن، بكل حالاتها. */
export async function recentPayouts(take = 50): Promise<PayoutRow[]> {
  const rows = await db.payout.findMany({
    orderBy: { createdAt: 'desc' },
    take,
    include: { seller: { select: { name: true } } },
  });

  return rows.map((row) => ({
    id: row.id,
    sellerId: row.sellerId,
    sellerName: row.seller.name,
    amount: row.amount.toFixed(2),
    status: row.status,
    ibanLast4: row.ibanLast4,
    bankRef: row.bankRef,
    requestedBy: row.requestedBy,
    createdAt: row.createdAt.toISOString(),
    sentAt: row.sentAt === null ? null : row.sentAt.toISOString(),
  }));
}

export type SellerPayoutLine = {
  id: string;
  amount: string;
  ibanLast4: string | null;
  sentAt: string;
};

/**
 * ما وصل البائع — **المُرسَل وحده**. وطلبٌ ينتظر اعتمادًا ليس مالًا
 * وصل، وعرضُه للبائع وعدٌ بما لم يقع بعد.
 */
export async function sellerPayouts(sellerId: string, take = 20): Promise<SellerPayoutLine[]> {
  const rows = await db.payout.findMany({
    where: { sellerId, status: 'SENT' },
    orderBy: { sentAt: 'desc' },
    take,
    select: { id: true, amount: true, ibanLast4: true, sentAt: true },
  });

  return rows.flatMap((row) =>
    row.sentAt === null
      ? []
      : [
          {
            id: row.id,
            amount: row.amount.toFixed(2),
            ibanLast4: row.ibanLast4,
            sentAt: row.sentAt.toISOString(),
          },
        ],
  );
}

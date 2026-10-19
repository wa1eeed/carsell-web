import { Prisma } from '@/generated/prisma/client';
import type { PayoutStatus, ProviderType } from '@/generated/prisma/enums';
import { db } from '@/lib/db';
import { encryptSecret } from '@/lib/crypto/secrets';
import { checkIban, ibanLast4, ibanMasked, type IbanFailure } from './iban';
import { recordProviderPayout } from './ledger-events';
import { providerBalance } from './provider-ledger';
import { REQUIRED_APPROVALS, selfApprovalBlocked } from './approvals';

/**
 * ═══ صرفُ مستحقّات المزوّدين — الطرف الذي لم يُبنَ ═══
 *
 * `PROVIDER_PAYABLE` يُقيَّد دائنًا عند كل خدمةٍ تُنجَز
 * (`service.provider_due`) **ولا شيء يخصمه**: الفاحصُ يفحص، ونُقيّد
 * له دَينًا، **ولا مسارَ في المنتج كلّه يُحوّل له ريالًا**. وشاشةُ
 * المزوّد تقول «مستحقّ» عن مجموع ما كسبه منذ بدأ — لا عمّا بقي له.
 *
 * والبائعون لهم `Payout` بنصابٍ من اثنين منذ المهمة ٤٥، والمزوّدون
 * يلزمهم المثل: طابورُ صرف، وقيدٌ يخصم الدَّين، وكشفٌ يراه المزوّد في
 * لوحته.
 *
 * ═══ ولمَ جدولٌ ثانٍ لا `Payout` واحد ═══
 *
 * الطرفُ `ServiceProvider` لا `User`، والحسابُ `PROVIDER_PAYABLE` لا
 * `SELLER_PAYABLE`. ومفتاحٌ أجنبيٌّ واحد لا يشير إلى جدولين، وعمودان
 * اختياريّان يجعلان كل قراءةٍ تسأل «أيُّهما؟» ويسمحان بصفٍّ بلا طرف.
 *
 * ═══ والمال يخرج بيدٍ لا بتكامل ═══
 *
 * بوّابةُ المزوّدين (التوزيع عند الدفع) قرارُ المالك ٢٠٢٦-١٠-١٤،
 * ومفاتيحُها لم تصل. فاليوم يُقبض المال عندنا ويبقى دَينًا، والتحويل
 * البنكيّ تفعله المالية من بنكها — وهذا **سجلٌّ يُطابَق به كشف البنك**:
 * من اعتمد، وبأيّ مرجع، وإلى أيّ آيبان. وحين يُفتح التوزيع فما يصل
 * المزوّد منه لا يُقيَّد هنا أصلًا، فلا يُصرف مرّتين.
 *
 * ═══ ونصابه اثنان ═══
 *
 * مالٌ يخرج إلى حسابٍ خارج النظام لا يُخرجه واحد — ولا يُستردّ. فالطلب
 * يُنشئ `ApprovalRequest` بنصاب اثنين، والاعتماد بيد الثاني، **وهو
 * الذي يكتب القيد**.
 */

const zero = new Prisma.Decimal(0);

/** كأخواتها: `WALLET_ADJUSTMENT` و`SELLER_PAYOUT` و`PROVIDER_ADJUSTMENT`. */
const APPROVAL_HOURS = 72;

/** مرجعُ الحوالة — أدنى طولٍ يُطابَق به كشفُ بنك. */
const BANK_REF_MIN = 4;

export type ProviderIbanResult = { ok: true; last4: string } | { ok: false; reason: IbanFailure | 'PROVIDER_NOT_FOUND' };

/**
 * ═══ البابُ الذي يُستوفى منه الشرط ═══
 *
 * `requestProviderPayout` تردّ `NO_IBAN`، **ولم يكن في المنتج كلّه
 * مسارٌ يكتب آيبان مزوّد** — فكلّ مزوّد ممنوعٌ من الصرف إلى الأبد:
 * قفلٌ بلا مفتاح، وهو الصنف الذي وقع في `profileCompletion`.
 *
 * **ويُخزَّن مشفَّرًا** كآيبان البائع حرفيًّا، وفحصُه بـ`checkIban`
 * نفسها — خانتا التحقّق (mod-97) هما ما يمسك الخانة المقلوبة، ومالٌ
 * يذهب إلى حسابٍ آخر لا يُستردّ بقيد.
 *
 * **ولا يُكتب في الأثر إلّا آخر أربع**: `AuditLog` يُقرأ في الأدمن،
 * وكتابةُ الآيبان كاملًا فيه تُبطل تشفير العمود.
 */
export async function setProviderIban(
  input: { providerId: string; iban: string; adminId: string; ip: string | null },
  now: Date = new Date(),
): Promise<ProviderIbanResult> {
  const checked = checkIban(input.iban);
  if (!checked.ok) return checked;

  const provider = await db.serviceProvider.findUnique({
    where: { id: input.providerId },
    select: { id: true, iban: true },
  });
  if (provider === null) return { ok: false, reason: 'PROVIDER_NOT_FOUND' };

  const last4 = checked.value.slice(-4);
  const before = ibanLast4(provider.iban);

  await db.$transaction(async (tx) => {
    await tx.serviceProvider.update({
      where: { id: input.providerId },
      data: { iban: encryptSecret(checked.value) },
    });

    await tx.auditLog.create({
      data: {
        actorId: input.adminId,
        actorType: 'admin',
        entity: 'ServiceProvider',
        entityId: input.providerId,
        action: 'provider.iban_set',
        before: { ibanLast4: before },
        after: { ibanLast4: last4 },
        ip: input.ip,
        createdAt: now,
      },
    });
  });

  return { ok: true, last4 };
}

/**
 * الآيبان كما يُعرض للمشغّل — `SA03••••7519`.
 *
 * **ولا يخرج كاملًا من الخادم أبدًا**: المشغّل يطابق به حوالةً، ولا
 * يحتاج الأربعةَ والعشرين. وصفٌّ لا يُفكّ يُقرأ «لا آيبان» فيُعاد
 * إدخالُه — لا يُعرض نصًّا مشفَّرًا على أنه رقمُ حساب.
 */
export async function providerIbanMasked(providerId: string): Promise<string | null> {
  const row = await db.serviceProvider.findUnique({
    where: { id: providerId },
    select: { iban: true },
  });
  return row === null ? null : ibanMasked(row.iban);
}

export type PayableProvider = {
  providerId: string;
  nameAr: string;
  type: ProviderType;
  /** حقُّه القائم من الدفتر — لا مجموعُ ما كسبه */
  payable: string;
  /** آخر أربع من آيبانه، و`null` يعني أنه لم يُدخَل */
  ibanLast4: string | null;
  /** تحويلٌ ينتظر الموافقة الثانية — فلا يُطلب ثانٍ فوقه */
  pendingPayoutId: string | null;
  pendingAmount: string | null;
};

/**
 * من له مالٌ قائم — **قراءةٌ لا تكتب**.
 *
 * ودالّةٌ تمرّ على كل المستحقّين وتكتب هي الشكل الذي يُفرِج عن مئة
 * مبلغ بخطأ سطر: فالقائمة تُقرأ، والتحويل استدعاءٌ مفرد صريح لكلّ
 * مزوّد (`requestProviderPayout`).
 */
export async function payableProviders(): Promise<PayableProvider[]> {
  /**
   * الأرصدة بتجميعةٍ واحدة — لا استعلام لكل مزوّد. والصافي
   * `CREDIT − DEBIT` لأن `PROVIDER_PAYABLE` حسابٌ دائنُ الطبيعة.
   */
  const rows = await db.ledgerEntry.groupBy({
    by: ['providerId', 'direction'],
    where: { account: 'PROVIDER_PAYABLE', providerId: { not: null } },
    _sum: { amount: true },
  });

  const balances = new Map<string, Prisma.Decimal>();
  for (const row of rows) {
    if (row.providerId === null) continue;
    const amount = row._sum.amount ?? zero;
    const current = balances.get(row.providerId) ?? zero;
    balances.set(
      row.providerId,
      row.direction === 'CREDIT' ? current.plus(amount) : current.minus(amount),
    );
  }

  const owed = [...balances.entries()].filter(([, balance]) => balance.greaterThan(zero));
  if (owed.length === 0) return [];

  const ids = owed.map(([providerId]) => providerId);
  const [providers, pending] = await Promise.all([
    db.serviceProvider.findMany({
      where: { id: { in: ids } },
      select: { id: true, nameAr: true, type: true, iban: true },
    }),
    db.providerPayout.findMany({
      where: { providerId: { in: ids }, status: 'PENDING' },
      select: { id: true, providerId: true, amount: true },
    }),
  ]);

  const byId = new Map(providers.map((provider) => [provider.id, provider]));
  const waitingBy = new Map(pending.map((row) => [row.providerId, row]));

  return owed
    .flatMap(([providerId, balance]) => {
      const provider = byId.get(providerId);
      /**
       * **ولا يُعرض صفٌّ بلا مزوّد.** معرّفٌ في الدفتر لا يقابله صفّ
       * يعني حذفًا أو عطلًا، وسطرٌ باسمٍ فارغ يُطلَب تحويله هو أسوأ ما
       * يُعرض في شاشةٍ تصرف مالًا.
       */
      if (provider === undefined) return [];
      const waiting = waitingBy.get(providerId) ?? null;
      return [
        {
          providerId,
          nameAr: provider.nameAr,
          type: provider.type,
          payable: balance.toFixed(2),
          ibanLast4: ibanLast4(provider.iban),
          pendingPayoutId: waiting?.id ?? null,
          pendingAmount: waiting === null ? null : waiting.amount.toFixed(2),
        },
      ];
    })
    .sort((a, b) => Number(b.payable) - Number(a.payable));
}

export type ProviderPayoutRequestResult =
  | { ok: true; payoutId: string; requestId: string }
  | {
      ok: false;
      reason:
        | 'PROVIDER_NOT_FOUND'
        | 'NO_IBAN'
        | 'BAD_AMOUNT'
        | 'EXCEEDS_PAYABLE'
        | 'ALREADY_PENDING';
    };

/**
 * طلبُ تحويل — **ولا مال يخرج هنا ولا قيد يُكتب**.
 *
 * والمبلغ يُفحص مقابل الدفتر لا مقابل ما أرسلته الشاشة: حارسٌ في
 * العميل ليس حارسًا.
 */
export async function requestProviderPayout(
  input: {
    providerId: string;
    amount: number | string;
    adminId: string;
    ip: string | null;
    note?: string;
  },
  now: Date = new Date(),
): Promise<ProviderPayoutRequestResult> {
  let amount: Prisma.Decimal;
  try {
    amount = new Prisma.Decimal(input.amount);
  } catch {
    return { ok: false, reason: 'BAD_AMOUNT' };
  }
  if (!amount.isFinite() || amount.lessThanOrEqualTo(zero)) {
    return { ok: false, reason: 'BAD_AMOUNT' };
  }

  const provider = await db.serviceProvider.findUnique({
    where: { id: input.providerId },
    select: { id: true, iban: true },
  });
  if (provider === null) return { ok: false, reason: 'PROVIDER_NOT_FOUND' };

  /**
   * **ولا تحويل بلا آيبان.** والشرط يُفحص هنا لا عند الاعتماد وحده:
   * طلبٌ يُعتمد ثمّ يتعذّر تنفيذه يترك النصاب مستهلَكًا على لا شيء.
   */
  const last4 = ibanLast4(provider.iban);
  if (last4 === null) return { ok: false, reason: 'NO_IBAN' };

  const payable = new Prisma.Decimal(await providerBalance(input.providerId));
  if (amount.greaterThan(payable)) return { ok: false, reason: 'EXCEEDS_PAYABLE' };

  const waiting = await db.providerPayout.findFirst({
    where: { providerId: input.providerId, status: 'PENDING' },
    select: { id: true },
  });
  if (waiting !== null) return { ok: false, reason: 'ALREADY_PENDING' };

  const created = await db.$transaction(async (tx) => {
    const request = await tx.approvalRequest.create({
      data: {
        kind: 'PROVIDER_PAYOUT',
        entityType: 'ServiceProvider',
        entityId: input.providerId,
        payload: { amount: amount.toFixed(2), ibanLast4: last4 },
        requestedBy: input.adminId,
        approvedBy: [],
        requiredApprovals: REQUIRED_APPROVALS,
        status: 'PENDING',
        expiresAt: new Date(now.getTime() + APPROVAL_HOURS * 3600 * 1000),
      },
    });

    const payout = await tx.providerPayout.create({
      data: {
        providerId: input.providerId,
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
        entity: 'ProviderPayout',
        entityId: payout.id,
        action: 'provider_payout.requested',
        before: {},
        after: {
          providerId: input.providerId,
          amount: amount.toFixed(2),
          requestId: request.id,
        },
        ip: input.ip,
        createdAt: now,
      },
    });

    return { payoutId: payout.id, requestId: request.id };
  });

  return { ok: true, ...created };
}

export type ProviderPayoutApplyResult =
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
 * فيبقى حقُّ المزوّد موجبًا وقد وصله ماله، فيُصرف مرّتين.
 */
export async function approveProviderPayout(
  input: { payoutId: string; adminId: string; bankRef: string; ip: string | null },
  now: Date = new Date(),
): Promise<ProviderPayoutApplyResult> {
  const bankRef = input.bankRef.trim();
  /**
   * **ومرجع الحوالة شرطٌ لا حقلٌ اختياريّ.** حوالةٌ بلا مرجع لا
   * تُطابَق بكشف البنك، فالدفتر يقول إنها خرجت ولا سبيل إلى إثباتها.
   */
  if (bankRef.length < BANK_REF_MIN) return { ok: false, reason: 'BANK_REF_REQUIRED' };

  const payout = await db.providerPayout.findUnique({ where: { id: input.payoutId } });
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

  /** **ولا يعتمد طالبُه على نفسه** — وإلّا فالنصاب واحدٌ بلباس اثنين. */
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
   * والاعتماد قد يُخصم من حسابه بتسويةٍ يدوية
   * (`approveProviderAdjustment`) فينقص رصيدُه، فيصير التحويل المعتمَد
   * أكبر من حقّه — ويخرج مالٌ لا يقابله التزام.
   */
  const payable = new Prisma.Decimal(await providerBalance(payout.providerId));
  if (payout.amount.greaterThan(payable)) return { ok: false, reason: 'EXCEEDS_PAYABLE' };

  await db.$transaction(async (tx) => {
    await tx.providerPayout.update({
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

    await recordProviderPayout(
      tx,
      {
        providerId: payout.providerId,
        amount: payout.amount,
        note: `payout ${payout.id} · ${bankRef}`,
      },
      now,
    );

    await tx.auditLog.create({
      data: {
        actorId: input.adminId,
        actorType: 'admin',
        entity: 'ProviderPayout',
        entityId: payout.id,
        action: 'provider_payout.sent',
        before: { status: 'PENDING' },
        after: { status: 'SENT', amount: payout.amount.toFixed(2), bankRef },
        ip: input.ip,
        createdAt: now,
      },
    });
  });

  return { ok: true, payoutId: payout.id, remaining: await providerBalance(payout.providerId) };
}

export type ProviderPayoutRejectResult =
  | { ok: true }
  | { ok: false; reason: 'PAYOUT_NOT_FOUND' | 'NOT_PENDING' | 'REASON_REQUIRED' };

/**
 * الردّ — **ويملكه طالبُه أيضًا**. فالطالب قد يكتشف خطأه، وإلزامه
 * بانتظار ثانٍ ليُلغي ما لم يقع ليس حراسةً بل عرقلة. والنصاب على
 * **خروج** المال لا على إلغائه.
 */
export async function rejectProviderPayout(
  input: { payoutId: string; adminId: string; reason: string; ip: string | null },
  now: Date = new Date(),
): Promise<ProviderPayoutRejectResult> {
  const reason = input.reason.trim();
  if (reason === '') return { ok: false, reason: 'REASON_REQUIRED' };

  const payout = await db.providerPayout.findUnique({ where: { id: input.payoutId } });
  if (payout === null) return { ok: false, reason: 'PAYOUT_NOT_FOUND' };
  if (payout.status !== 'PENDING') return { ok: false, reason: 'NOT_PENDING' };

  await db.$transaction(async (tx) => {
    await tx.providerPayout.update({
      where: { id: payout.id },
      data: { status: 'CANCELLED', note: reason, failedAt: now },
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
        entity: 'ProviderPayout',
        entityId: payout.id,
        action: 'provider_payout.cancelled',
        before: { status: 'PENDING' },
        after: { status: 'CANCELLED', reason },
        ip: input.ip,
        createdAt: now,
      },
    });
  });

  return { ok: true };
}

export type ProviderPayoutRow = {
  id: string;
  providerId: string;
  providerName: string;
  amount: string;
  status: PayoutStatus;
  ibanLast4: string | null;
  bankRef: string | null;
  requestedBy: string;
  createdAt: string;
  sentAt: string | null;
};

/** آخر التحويلات — للأدمن، بكل حالاتها. */
export async function recentProviderPayouts(take = 50): Promise<ProviderPayoutRow[]> {
  const rows = await db.providerPayout.findMany({
    orderBy: { createdAt: 'desc' },
    take,
    include: { provider: { select: { nameAr: true } } },
  });

  return rows.map((row) => ({
    id: row.id,
    providerId: row.providerId,
    providerName: row.provider.nameAr,
    amount: row.amount.toFixed(2),
    status: row.status,
    ibanLast4: row.ibanLast4,
    bankRef: row.bankRef,
    requestedBy: row.requestedBy,
    createdAt: row.createdAt.toISOString(),
    sentAt: row.sentAt === null ? null : row.sentAt.toISOString(),
  }));
}

export type ProviderPayoutLine = {
  id: string;
  amount: string;
  ibanLast4: string | null;
  bankRef: string | null;
  sentAt: string;
};

/**
 * ما وصل المزوّد — **المُرسَل وحده**. وطلبٌ ينتظر اعتمادًا ليس مالًا
 * وصل، وعرضُه للمزوّد وعدٌ بما لم يقع بعد.
 */
export async function providerPayoutLines(
  providerId: string,
  take = 20,
): Promise<ProviderPayoutLine[]> {
  const rows = await db.providerPayout.findMany({
    where: { providerId, status: 'SENT' },
    orderBy: { sentAt: 'desc' },
    take,
    select: { id: true, amount: true, ibanLast4: true, bankRef: true, sentAt: true },
  });

  return rows.flatMap((row) =>
    row.sentAt === null
      ? []
      : [
          {
            id: row.id,
            amount: row.amount.toFixed(2),
            ibanLast4: row.ibanLast4,
            bankRef: row.bankRef,
            sentAt: row.sentAt.toISOString(),
          },
        ],
  );
}

export type PendingProviderPayout = {
  id: string;
  amount: string;
  ibanLast4: string | null;
  requestedBy: string;
  createdAt: string;
  expiresAt: string | null;
};

/**
 * التحويلُ المنتظر لمزوّدٍ واحد — لصفحته في الأدمن.
 *
 * **ومهلتُه تُعرض معه**: نصابٌ ينقضي بلا ثانٍ يترك الطلب معلَّقًا،
 * ومن يفتح الصفحة بعد ثلاثة أيّام يجب أن يعرف أنه مات لا أنه ينتظره.
 */
export async function pendingProviderPayout(
  providerId: string,
): Promise<PendingProviderPayout | null> {
  const row = await db.providerPayout.findFirst({
    where: { providerId, status: 'PENDING' },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      amount: true,
      ibanLast4: true,
      requestedBy: true,
      createdAt: true,
      approvalRequestId: true,
    },
  });
  if (row === null) return null;

  /** و`approvalRequestId` عمودٌ لا علاقة — كما في `Payout` حرفيًّا. */
  const request =
    row.approvalRequestId === null
      ? null
      : await db.approvalRequest.findUnique({
          where: { id: row.approvalRequestId },
          select: { expiresAt: true },
        });

  return {
    id: row.id,
    amount: row.amount.toFixed(2),
    ibanLast4: row.ibanLast4,
    requestedBy: row.requestedBy,
    createdAt: row.createdAt.toISOString(),
    expiresAt: request?.expiresAt.toISOString() ?? null,
  };
}

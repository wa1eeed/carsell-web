import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { Prisma } from '@/generated/prisma/client';
import { encryptSecret } from '@/lib/crypto/secrets';
import { recordProviderPayout } from '@/lib/domain/ledger-events';
import { providerBalance } from '@/lib/domain/provider-ledger';
import {
  approveProviderPayout,
  payableProviders,
  pendingProviderPayout,
  providerIbanMasked,
  providerPayoutLines,
  rejectProviderPayout,
  requestProviderPayout,
  setProviderIban,
} from '@/lib/domain/provider-payouts';
import type { AdminUser } from '@/generated/prisma/client';

/**
 * ═══ صرفُ مستحقّات المزوّدين ═══
 *
 * `PROVIDER_PAYABLE` كان يُقيَّد دائنًا عند كل خدمةٍ تُنجَز **ولا شيء
 * يخصمه**: الفاحصُ يفحص ونُقيّد له دَينًا، ولا مسارَ يُحوّل له ريالًا.
 *
 * وتقيس هذه: البابَ (الآيبان)، والنصابَ (اثنان لا واحد)، والقيدَ
 * (الدَّين يُخصم فعلًا)، والحقَّ المُعاد فحصُه عند الاعتماد.
 */

/**
 * **ومزوّدٌ خاصٌّ بهذا الملفّ** — فلا يُقاس على رصيدٍ يحرّكه جاره، ولا
 * يُفترض فيه ما تزرعه البذرة.
 *
 * **واسمُه يحمل شكلَ الاختبار** (تسع خانات): تنظيفُ `global-setup`
 * بالشكل، فاسمٌ بلا أرقام يسكن قاعدة التطوير إلى الأبد ويضخّم عدّاد
 * «مزوّدون نشطون» — وهو التسرّب الصامت الذي يُقاس لا يُلاحَظ.
 */
const NAME_EN = 'Payout Test Provider 900000001';

let providerId: string;
let requester: AdminUser;
let approver: AdminUser;

const payouts: string[] = [];
const requests: string[] = [];

/** آيبانٌ صحيحُ الخانتين — ومقلوبُه يفشل بـ`CHECKSUM`. */
const GOOD_IBAN = 'SA0380000000608010167519';

beforeAll(async () => {
  requester = await db.adminUser.findFirstOrThrow({ where: { role: 'SUPER_ADMIN' } });
  approver = await db.adminUser.findFirstOrThrow({ where: { role: 'FINANCE' } });

  const existing = await db.serviceProvider.findFirst({ where: { nameEn: NAME_EN } });
  providerId =
    existing?.id ??
    (
      await db.serviceProvider.create({
        data: {
          nameAr: 'مزوّد قياس الصرف',
          nameEn: NAME_EN,
          type: 'INSPECTION',
          cities: ['الرياض'],
          active: true,
        },
      })
    ).id;
});

/**
 * **وما يُكتب بمعاملةٍ يُحذف بها** — والقيد المفرد يترك الدفتر غير
 * متوازن فيُسقط كل اختبارٍ يفحص التوازن.
 */
afterEach(async () => {
  const rows = await db.ledgerEntry.findMany({
    where: { event: { in: ['provider.test_credit', 'provider_payout.sent'] }, providerId },
    select: { txnId: true },
  });
  const txnIds = [...new Set(rows.map((row) => row.txnId))];
  if (txnIds.length > 0) await db.ledgerEntry.deleteMany({ where: { txnId: { in: txnIds } } });

  if (payouts.length > 0) {
    await db.providerPayout.deleteMany({ where: { id: { in: payouts } } });
    payouts.length = 0;
  }
  if (requests.length > 0) {
    await db.approvalRequest.deleteMany({ where: { id: { in: requests } } });
    requests.length = 0;
  }
  await db.auditLog.deleteMany({ where: { entityId: { in: [providerId] } } });
  await db.auditLog.deleteMany({ where: { entity: 'ProviderPayout' } });
});

/** يُقيَّد له حقٌّ بمعاملةٍ متوازنة — كما يفعل `service.provider_due`. */
async function credit(amount: string): Promise<void> {
  const { postEntries } = await import('@/lib/domain/ledger');
  const result = await postEntries(db, {
    event: 'provider.test_credit',
    postings: [
      { account: 'PROVIDER_COST', direction: 'DEBIT', amount },
      { account: 'PROVIDER_PAYABLE', direction: 'CREDIT', amount, providerId },
    ],
  });
  expect(result.ok).toBe(true);
}

async function ask(amount: string): Promise<string> {
  const result = await requestProviderPayout({
    providerId,
    amount,
    adminId: requester.id,
    ip: null,
  });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.reason);
  payouts.push(result.payoutId);
  requests.push(result.requestId);
  return result.payoutId;
}

describe('الآيبان — البابُ الذي يُستوفى منه الشرط', () => {
  it('لا تحويل بلا آيبان، ثم يُحفظ فيُفتح الباب', async () => {
    await db.serviceProvider.update({ where: { id: providerId }, data: { iban: null } });
    await credit('500.00');

    const blocked = await requestProviderPayout({
      providerId,
      amount: '100.00',
      adminId: requester.id,
      ip: null,
    });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.reason).toBe('NO_IBAN');

    const saved = await setProviderIban({
      providerId,
      iban: 'SA03 8000 0000 6080 1016 7519',
      adminId: requester.id,
      ip: null,
    });
    expect(saved.ok).toBe(true);
    if (saved.ok) expect(saved.last4).toBe('7519');

    /** **ويُعرض مقنَّعًا لا كاملًا** — والعمود مشفَّر فلا يُقصّ خامًا. */
    expect(await providerIbanMasked(providerId)).toBe('SA03••••7519');

    const opened = await ask('100.00');
    expect(opened).toBeTruthy();
  });

  it('خانتا التحقّق تمسكان الخانة المقلوبة', async () => {
    const flipped = await setProviderIban({
      providerId,
      iban: 'SA03 8000 0000 6080 1016 7511',
      adminId: requester.id,
      ip: null,
    });
    expect(flipped.ok).toBe(false);
    if (!flipped.ok) expect(flipped.reason).toBe('CHECKSUM');
  });
});

describe('النصاب — اثنان لا واحد', () => {
  beforeAll(async () => {
    await db.serviceProvider.update({
      where: { id: providerId },
      data: { iban: encryptSecret(GOOD_IBAN) },
    });
  });

  it('طالبُ التحويل لا يعتمده، والثاني يعتمده فيُخصم الدَّين', async () => {
    await credit('700.00');
    const before = new Prisma.Decimal(await providerBalance(providerId));

    const payoutId = await ask('450.00');

    /** **ولا مال يخرج عند الطلب** — الرصيد كما كان. */
    expect(await providerBalance(providerId)).toBe(before.toFixed(2));

    const self = await approveProviderPayout({
      payoutId,
      adminId: requester.id,
      bankRef: 'TRF-9001',
      ip: null,
    });
    expect(self.ok).toBe(false);
    if (!self.ok) expect(self.reason).toBe('SELF_APPROVAL');

    const done = await approveProviderPayout({
      payoutId,
      adminId: approver.id,
      bankRef: 'TRF-9001',
      ip: null,
    });
    expect(done.ok).toBe(true);
    if (done.ok) expect(done.remaining).toBe(before.minus(450).toFixed(2));

    /**
     * والقيد يخصم `PROVIDER_PAYABLE` ويُخرج المال من صندوقنا.
     *
     * **ومعاملةُ صفِّنا وحدها**: `event` عامٌّ، والبذرة تزرع حوالةً
     * مُرسَلة لمزوّدٍ آخر — فبحثٌ به يقرأ قيدَ غيرنا ويسقط على ما لا
     * يقيسه. فالمعاملة تُبلَغ من قيد المزوّد المعنيّ ثم تُقرأ كاملةً.
     */
    const mine = await db.ledgerEntry.findFirstOrThrow({
      where: { event: 'provider_payout.sent', providerId },
      select: { txnId: true },
    });
    const entries = await db.ledgerEntry.findMany({
      where: { txnId: mine.txnId },
      select: { account: true, direction: true, amount: true, providerId: true },
    });
    const debit = entries.find((row) => row.account === 'PROVIDER_PAYABLE');
    const cash = entries.find((row) => row.account === 'PLATFORM_CASH');
    expect(debit?.direction).toBe('DEBIT');
    expect(debit?.providerId).toBe(providerId);
    expect(cash?.direction).toBe('CREDIT');
    expect(debit?.amount.toFixed(2)).toBe('450.00');

    /** **وما وصله يُقرأ في كشفه** — والمُرسَل وحده. */
    const lines = await providerPayoutLines(providerId);
    expect(lines.some((row) => row.bankRef === 'TRF-9001')).toBe(true);
  });

  it('مرجع الحوالة شرطٌ لا حقلٌ اختياريّ', async () => {
    await credit('300.00');
    const payoutId = await ask('120.00');

    const empty = await approveProviderPayout({
      payoutId,
      adminId: approver.id,
      bankRef: '  ',
      ip: null,
    });
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.reason).toBe('BANK_REF_REQUIRED');
  });

  it('طلبٌ ثانٍ فوق طلبٍ منتظر يُردّ', async () => {
    await credit('400.00');
    await ask('100.00');

    const second = await requestProviderPayout({
      providerId,
      amount: '50.00',
      adminId: approver.id,
      ip: null,
    });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.reason).toBe('ALREADY_PENDING');
  });
});

describe('الحقُّ يُفحص عند الطلب وعند الاعتماد', () => {
  beforeAll(async () => {
    await db.serviceProvider.update({
      where: { id: providerId },
      data: { iban: encryptSecret(GOOD_IBAN) },
    });
  });

  it('أكبرُ من الحقّ يُردّ عند الطلب', async () => {
    await credit('200.00');
    const payable = new Prisma.Decimal(await providerBalance(providerId));

    const over = await requestProviderPayout({
      providerId,
      amount: payable.plus(1).toFixed(2),
      adminId: requester.id,
      ip: null,
    });
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.reason).toBe('EXCEEDS_PAYABLE');
  });

  /**
   * **وبين الطلب والاعتماد ينقص الرصيد.** تسويةٌ يدوية تخصم من حسابه،
   * فيصير التحويلُ المعتمَد أكبر من حقّه — ويخرج مالٌ لا يقابله التزام.
   */
  it('ينقص الرصيد بعد الطلب فيُردّ الاعتماد', async () => {
    await credit('300.00');
    const payable = new Prisma.Decimal(await providerBalance(providerId));
    const payoutId = await ask(payable.toFixed(2));

    /** خصمٌ يقع بعد الطلب — بمعاملةٍ متوازنة كما تكتبها الأداة. */
    const { postEntries } = await import('@/lib/domain/ledger');
    await postEntries(db, {
      event: 'provider.test_credit',
      postings: [
        { account: 'PROVIDER_PAYABLE', direction: 'DEBIT', amount: '50.00', providerId },
        { account: 'PROVIDER_COST', direction: 'CREDIT', amount: '50.00' },
      ],
    });

    const late = await approveProviderPayout({
      payoutId,
      adminId: approver.id,
      bankRef: 'TRF-9002',
      ip: null,
    });
    expect(late.ok).toBe(false);
    if (!late.ok) expect(late.reason).toBe('EXCEEDS_PAYABLE');
  });
});

describe('القوائم والإلغاء', () => {
  beforeAll(async () => {
    await db.serviceProvider.update({
      where: { id: providerId },
      data: { iban: encryptSecret(GOOD_IBAN) },
    });
  });

  it('المستحقّون يُقرأون من الدفتر — والمزوّد المعنيّ فيهم بحقّه', async () => {
    await credit('615.50');
    const payable = await providerBalance(providerId);

    const rows = await payableProviders();
    const mine = rows.find((row) => row.providerId === providerId);
    expect(mine).toBeDefined();
    /** **والحقُّ بالهللات** — رقمٌ يُطابَق بطرفٍ خارجيّ. */
    expect(mine?.payable).toBe(payable);
    expect(mine?.ibanLast4).toBe('7519');
    expect(mine?.pendingPayoutId).toBeNull();

    const payoutId = await ask('15.50');
    const after = await payableProviders();
    expect(after.find((row) => row.providerId === providerId)?.pendingPayoutId).toBe(payoutId);

    const waiting = await pendingProviderPayout(providerId);
    expect(waiting?.amount).toBe('15.50');
    /** ومهلتُه تُعرض — فمن يفتح الصفحة يعرف أنه مات لا أنه ينتظره. */
    expect(waiting?.expiresAt).not.toBeNull();
  });

  it('الإلغاء بيد طالبه، ويفتح الباب لطلبٍ جديد', async () => {
    await credit('250.00');
    const payoutId = await ask('80.00');

    const cancelled = await rejectProviderPayout({
      payoutId,
      adminId: requester.id,
      reason: 'مرجعٌ خاطئ',
      ip: null,
    });
    expect(cancelled.ok).toBe(true);

    const again = await requestProviderPayout({
      providerId,
      amount: '80.00',
      adminId: requester.id,
      ip: null,
    });
    expect(again.ok).toBe(true);
    if (again.ok) {
      payouts.push(again.payoutId);
      requests.push(again.requestId);
    }
  });

  it('المُرسَل وحده يُعرض للمزوّد — لا ما ينتظر اعتمادًا', async () => {
    await credit('900.00');
    await ask('200.00');

    const lines = await providerPayoutLines(providerId);
    expect(lines.every((row) => row.sentAt !== null)).toBe(true);
    expect(lines.some((row) => row.amount === '200.00')).toBe(false);
  });
});

describe('القيد وحدَه', () => {
  it('حوالةٌ تُخصم من دَينه وتُخرج المال من صندوقنا', async () => {
    await credit('1000.00');
    const before = new Prisma.Decimal(await providerBalance(providerId));

    const result = await recordProviderPayout(db, { providerId, amount: '400.00' });
    expect(result.ok).toBe(true);

    expect(await providerBalance(providerId)).toBe(before.minus(400).toFixed(2));

    /** **ولا معاملةَ غير متوازنة** — والفحص على الدفتر كلِّه. */
    const { unbalancedTransactions } = await import('@/lib/domain/ledger');
    expect(await unbalancedTransactions()).toEqual([]);
  });
});

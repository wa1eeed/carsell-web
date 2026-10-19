import { afterAll, describe, expect, it } from 'vitest';
import { Prisma } from '@/generated/prisma/client';
import { db } from '@/lib/db';
import { encryptSecret } from '@/lib/crypto/secrets';
import { ibanLast4, ibanMasked } from '@/lib/domain/iban';
import { accountBalance, postEntries } from '@/lib/domain/ledger';
import { approvePayout, payableSellers, rejectPayout, requestPayout } from '@/lib/domain/payouts';

/**
 * ═══ تحويل مستحقّات البائع ═══
 *
 * العطل الذي وُلد منه هذا الملف: **`recordSellerPayout` بلا منادٍ.**
 * مكتوبةٌ منذ بُني الدفتر، وتعليقها يقول إن `SELLER_PAYABLE` يبقى
 * موجبًا إلى الأبد ما لم تُنادى — ولم يكن في المنتج كلّه منادٍ. فدفتر
 * البائع يعرض «حُوِّل إليك: ٠٫٠٠» مهما باع.
 */

const PAYOUT_IDS: string[] = [];
/**
 * **والقيد يُحذف بمعاملته لا بصاحبه.** حذفٌ بـ`userId` يمحو طرفًا
 * واحدًا — وهو الوحيد الذي يحمله — فتبقى في الدفتر معاملةٌ غير
 * متوازنة تُسقط كل اختبارٍ جارٍ يفحص التوازن. و`txnId` هو المعاملة.
 */
const TXN_IDS: string[] = [];
/**
 * **والطقم يشترط ما يفترضه.** أوّل صياغةٍ أخذت «أوّل مستخدمٍ بلا
 * آيبان» في كل حالة، فعاد الطقم إلى البائع نفسه وتراكم حقُّه — فسقط
 * فحصُ «٧٠٠ باقية» على ١٦٠٠، وهو رقمٌ صحيح لا يقيسه الاختبار. فكلّ
 * حالةٍ تأخذ بائعًا **لم يُستعمل ولا رصيد له**، لا بائعًا تأمل أنه كذلك.
 */
const USED_SELLERS: string[] = [];

afterAll(async () => {
  /** وقيودُ `payout.sent` التي كتبها الاعتماد — تُجمع بمعاملاتها. */
  const sent =
    PAYOUT_IDS.length === 0
      ? []
      : await db.ledgerEntry.findMany({
          where: { event: 'payout.sent', OR: PAYOUT_IDS.map((id) => ({ note: { contains: id } })) },
          select: { txnId: true },
        });
  const ids = [...new Set([...TXN_IDS, ...sent.map((row) => row.txnId)])];
  if (ids.length > 0) await db.ledgerEntry.deleteMany({ where: { txnId: { in: ids } } });

  if (PAYOUT_IDS.length > 0) {
    const rows = await db.payout.findMany({
      where: { id: { in: PAYOUT_IDS } },
      select: { approvalRequestId: true },
    });
    await db.payout.deleteMany({ where: { id: { in: PAYOUT_IDS } } });
    const requests = rows.flatMap((row) => (row.approvalRequestId === null ? [] : [row.approvalRequestId]));
    if (requests.length > 0) {
      await db.approvalRequest.deleteMany({ where: { id: { in: requests } } });
    }
  }
  await db.auditLog.deleteMany({ where: { entity: 'Payout', entityId: { in: PAYOUT_IDS } } });
  if (USED_SELLERS.length > 0) {
    await db.user.updateMany({ where: { id: { in: USED_SELLERS } }, data: { iban: null } });
  }
  await db.$disconnect();
});

/** بائعٌ له حقٌّ قائم — يُصنع بقيدٍ حقيقيّ لا بصفٍّ مُفتعل. */
async function sellerWithPayable(amount: number): Promise<{ sellerId: string }> {
  /** من له قيدٌ على `SELLER_PAYABLE` يُستبعد — فالرصيد يبدأ صفرًا يقينًا. */
  const booked = await db.ledgerEntry.findMany({
    where: { account: 'SELLER_PAYABLE', userId: { not: null } },
    select: { userId: true },
    distinct: ['userId'],
  });
  const taken = [...USED_SELLERS, ...booked.flatMap((row) => (row.userId === null ? [] : [row.userId]))];

  const seller = await db.user.findFirstOrThrow({
    where: { iban: null, status: 'ACTIVE', id: { notIn: taken } },
    select: { id: true },
  });
  const buyer = await db.user.findFirstOrThrow({
    where: { id: { not: seller.id } },
    select: { id: true },
  });

  USED_SELLERS.push(seller.id);
  await db.user.update({
    where: { id: seller.id },
    data: { iban: encryptSecret('SA0380000000608010167519') },
  });

  /**
   * القيد يُكتب بمدخله الوحيد — و`postEntries` يفحص التوازن، فالحقّ
   * الذي نختبر صرفَه حقٌّ نشأ كما ينشأ في الإنتاج.
   */
  const posted = await postEntries(db, {
    event: 'order.earned',
    postings: [
      { account: 'BUYER_ADVANCE', direction: 'DEBIT', amount, userId: buyer.id },
      { account: 'SELLER_PAYABLE', direction: 'CREDIT', amount, userId: seller.id },
    ],
  });
  if (!posted.ok) throw new Error(posted.reason);
  TXN_IDS.push(posted.txnId);

  return { sellerId: seller.id };
}

describe('قراءة الآيبان', () => {
  /**
   * الصنف الذي وُلدت منه البوابة ٢٩: العمود يُكتب مشفَّرًا، وثلاثة
   * مواضع تقصّه كنصٍّ صريح — فتعرض `v1._••••w4Ij` على أنها آيبان.
   */
  it('تفكّ قبل أن تقصّ', () => {
    const stored = encryptSecret('SA0380000000608010167519');
    expect(ibanLast4(stored)).toBe('7519');
    expect(ibanMasked(stored)).toBe('SA03••••7519');
  });

  /** **والفشل غياب لا خطأ** — فالتحويل يقف بأمان ولا تسقط الصفحة. */
  it('قيمةٌ لا تُفكّ تُقرأ «لا آيبان»', () => {
    expect(ibanLast4('SA0380000000608010167519')).toBeNull();
    expect(ibanLast4(null)).toBeNull();
    expect(ibanMasked('v1.tampered.values.here')).toBeNull();
  });
});

describe('نصاب التحويل', () => {
  it('يُصفّر حقّ البائع بقيدٍ متوازن', async () => {
    const { sellerId } = await sellerWithPayable(4000);

    const before = await accountBalance('SELLER_PAYABLE', { userId: sellerId });
    expect(Number(before)).toBe(4000);

    const listed = await payableSellers();
    const mine = listed.find((row) => row.sellerId === sellerId);
    expect(mine?.payable).toBe('4000.00');
    expect(mine?.ibanLast4).toBe('7519');

    const requested = await requestPayout({
      sellerId,
      amount: '4000',
      adminId: 'admin-requester',
      ip: null,
    });
    if (!requested.ok) throw new Error(requested.reason);
    PAYOUT_IDS.push(requested.payoutId);

    /** **ولا مال يخرج بالطلب** — الضغطة الأولى لا تحرّك ريالًا. */
    expect(Number(await accountBalance('SELLER_PAYABLE', { userId: sellerId }))).toBe(4000);

    const approved = await approvePayout({
      payoutId: requested.payoutId,
      adminId: 'admin-approver',
      bankRef: 'FT26101100991',
      ip: null,
    });
    expect(approved).toMatchObject({ ok: true, remaining: '0.00' });

    const entry = await db.ledgerEntry.findFirst({
      where: { userId: sellerId, account: 'SELLER_PAYABLE', event: 'payout.sent' },
      select: { direction: true, amount: true },
    });
    expect(entry?.direction).toBe('DEBIT');
    expect(Number(entry?.amount)).toBe(4000);
  });

  /**
   * ═══ ونصابُ الواحد: الطالبُ يُتمّ تحويلَه ═══
   *
   * قرار المالك ٢٠٢٦-١٠-١٤ («الأدمن يملك صلاحية مطلقة»). **والمرحلتان
   * تبقيان بطبع الصرف لا بنصابه**: `bankRef` مرجعُ حوالةٍ وقعت فعلًا،
   * ولا يملكه الطالبُ ساعةَ الطلب — فالممنوعُ العضوُ الثاني لا الخطوة
   * الثانية.
   */
  it('يعتمد الطالبُ طلبَ نفسه، ومرجعُ الحوالة يُكتب', async () => {
    const { sellerId } = await sellerWithPayable(1500);
    const requested = await requestPayout({
      sellerId,
      amount: '1500',
      adminId: 'admin-solo',
      ip: null,
    });
    if (!requested.ok) throw new Error(requested.reason);
    PAYOUT_IDS.push(requested.payoutId);

    const approved = await approvePayout({
      payoutId: requested.payoutId,
      adminId: 'admin-solo',
      bankRef: 'FT26101100992',
      ip: null,
    });
    expect(approved.ok).toBe(true);

    const row = await db.payout.findUniqueOrThrow({ where: { id: requested.payoutId } });
    expect(row.status).toBe('SENT');
    expect(row.bankRef).toBe('FT26101100992');
  });

  it('لا يتجاوز حقَّه القائم ولا يخرج بلا آيبان', async () => {
    const { sellerId } = await sellerWithPayable(900);

    expect(
      await requestPayout({ sellerId, amount: '901', adminId: 'admin-requester', ip: null }),
    ).toEqual({ ok: false, reason: 'EXCEEDS_PAYABLE' });

    await db.user.update({ where: { id: sellerId }, data: { iban: null } });
    expect(
      await requestPayout({ sellerId, amount: '900', adminId: 'admin-requester', ip: null }),
    ).toEqual({ ok: false, reason: 'NO_IBAN' });

    /** **والاختبار يعيد ما غيّره** — وإلّا ورث جارُه آيبانًا محذوفًا. */
    await db.user.update({
      where: { id: sellerId },
      data: { iban: encryptSecret('SA0380000000608010167519') },
    });
  });

  /**
   * **ومرجع الحوالة شرطٌ لا حقل**: حوالةٌ بلا مرجع لا تُطابَق بكشف
   * البنك، فالدفتر يقول إنها خرجت ولا سبيل إلى إثباتها.
   */
  it('لا يُسجَّل اعتمادٌ بلا مرجع حوالة', async () => {
    const { sellerId } = await sellerWithPayable(700);
    const requested = await requestPayout({
      sellerId,
      amount: '700',
      adminId: 'admin-requester',
      ip: null,
    });
    if (!requested.ok) throw new Error(requested.reason);
    PAYOUT_IDS.push(requested.payoutId);

    expect(
      await approvePayout({
        payoutId: requested.payoutId,
        adminId: 'admin-approver',
        bankRef: '  ',
        ip: null,
      }),
    ).toEqual({ ok: false, reason: 'BANK_REF_REQUIRED' });

    /** والحقّ باقٍ كما كان — لم يُكتب قيدٌ على فشل. */
    expect(Number(await accountBalance('SELLER_PAYABLE', { userId: sellerId }))).toBe(700);

    await rejectPayout({
      payoutId: requested.payoutId,
      adminId: 'admin-requester',
      reason: 'تنظيف',
      ip: null,
    });
  });

  /** تحويلٌ مرّتين يُضاعف ما خرج — والثانية تُردّ. */
  it('اعتمادٌ ثانٍ على الصفّ نفسه يُردّ', async () => {
    const { sellerId } = await sellerWithPayable(2200);
    const requested = await requestPayout({
      sellerId,
      amount: '2200',
      adminId: 'admin-requester',
      ip: null,
    });
    if (!requested.ok) throw new Error(requested.reason);
    PAYOUT_IDS.push(requested.payoutId);

    await approvePayout({
      payoutId: requested.payoutId,
      adminId: 'admin-approver',
      bankRef: 'FT26101100993',
      ip: null,
    });
    expect(
      await approvePayout({
        payoutId: requested.payoutId,
        adminId: 'admin-approver',
        bankRef: 'FT26101100993',
        ip: null,
      }),
    ).toEqual({ ok: false, reason: 'NOT_PENDING' });

    const entries = await db.ledgerEntry.count({
      where: { userId: sellerId, account: 'SELLER_PAYABLE', event: 'payout.sent' },
    });
    expect(entries).toBe(1);
  });

  it('لا طلبان قائمان لبائعٍ واحد', async () => {
    const { sellerId } = await sellerWithPayable(1200);
    const first = await requestPayout({
      sellerId,
      amount: '600',
      adminId: 'admin-requester',
      ip: null,
    });
    if (!first.ok) throw new Error(first.reason);
    PAYOUT_IDS.push(first.payoutId);

    expect(
      await requestPayout({ sellerId, amount: '600', adminId: 'admin-requester', ip: null }),
    ).toEqual({ ok: false, reason: 'ALREADY_PENDING' });

    await rejectPayout({
      payoutId: first.payoutId,
      adminId: 'admin-requester',
      reason: 'تنظيف',
      ip: null,
    });
  });
});

describe('الدفتر بعد التحويل', () => {
  it('يبقى متوازنًا', async () => {
    const totals = await db.ledgerEntry.groupBy({ by: ['direction'], _sum: { amount: true } });
    const zero = new Prisma.Decimal(0);
    const debit = totals.find((row) => row.direction === 'DEBIT')?._sum.amount ?? zero;
    const credit = totals.find((row) => row.direction === 'CREDIT')?._sum.amount ?? zero;
    expect(debit.equals(credit)).toBe(true);
  });
});

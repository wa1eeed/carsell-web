import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { Prisma } from '@/generated/prisma/client';
import { db } from '@/lib/db';
import { recordServiceEarned, recordServicePaid } from '@/lib/domain/ledger-events';
import { applyStep } from '@/lib/domain/provider-queue';

/**
 * ═══ الخدمة تصل الدفتر ═══
 *
 * قِيس: يدفع العميل خمسَ مئةٍ وتُحجز لدى البوّابة، **ولا سطر في
 * الدفتر** — فلا إيرادٌ يُعترف به، ولا دَينٌ للمزوّد يُسجَّل، ولا
 * ضريبةٌ تُرصد. ولم يكن في `ledgerEntry` حسابٌ واحد يخصّ الخدمات.
 *
 * والقاعدة الضريبية `SERVICE` تحسم من المورِّد: `supplierIsPlatform`
 * و`invoiceIssuer: PLATFORM` — فالعميل يشتري منّا، والمزوّد مقاولٌ من
 * الباطن. فكامل القيمة إيرادٌ وسعرُه تكلفة.
 */

const refs: string[] = [];

async function wipe(): Promise<void> {
  if (refs.length === 0) return;
  /** **والقيد يُحذف بمعاملته لا بسطره** — وإلّا بقي طرفٌ يتيم يُسقط فحص التوازن. */
  const rows = await db.ledgerEntry.findMany({
    where: { note: { in: refs } },
    select: { txnId: true },
  });
  const txns = [...new Set(rows.map((row) => row.txnId))];
  if (txns.length > 0) await db.ledgerEntry.deleteMany({ where: { txnId: { in: txns } } });
  await db.serviceRequest.deleteMany({ where: { ref: { in: refs } } });
  refs.length = 0;
}

afterEach(wipe);
afterAll(async () => {
  await wipe();
  await db.$disconnect();
});

async function entries(ref: string): Promise<{ account: string; direction: string; amount: string; event: string }[]> {
  const rows = await db.ledgerEntry.findMany({
    where: { note: ref },
    orderBy: [{ createdAt: 'asc' }, { account: 'asc' }],
    select: { account: true, direction: true, amount: true, event: true },
  });
  return rows.map((row) => ({
    account: row.account,
    direction: row.direction,
    amount: row.amount.toString(),
    event: row.event,
  }));
}

/** فحصٌ ٤٥٠ + رسمُنا ٥٠ + ضريبةُ الخمسمئة ٧٥ = ٥٧٥. */
const MONEY = { total: '575.00', platformFee: '50.00', vat: '75.00' };

describe('قيدا الخدمة', () => {
  it('الدفع يُقيَّد قبضًا لا إيرادًا', async () => {
    const ref = `SRV-LDG-${String(Date.now()).slice(-9)}`;
    refs.push(ref);
    const user = await db.user.findFirstOrThrow({ where: { role: 'USER' }, select: { id: true } });

    const result = await recordServicePaid(db, {
      ref,
      requesterId: user.id,
      total: MONEY.total,
    });
    expect(result.ok).toBe(true);

    const rows = await entries(ref);
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.account).sort()).toEqual(['BUYER_ADVANCE', 'ESCROW_AT_PROVIDER']);
    /** **ولا إيراد بعد** — الخدمة لم تقع، وقد تفشل. */
    expect(rows.some((row) => row.account === 'PLATFORM_REVENUE')).toBe(false);
  });

  it('والإنجاز يعترف بالإيراد كاملًا ويُنشئ دَين المزوّد', async () => {
    const ref = `SRV-LDG-${String(Date.now()).slice(-9)}`;
    refs.push(ref);
    const user = await db.user.findFirstOrThrow({ where: { role: 'USER' }, select: { id: true } });

    expect((await recordServiceEarned(db, { ref, requesterId: user.id, ...MONEY })).ok).toBe(true);

    const rows = await entries(ref);
    const by = (account: string): string =>
      rows.find((row) => row.account === account)?.amount ?? '';

    /** الإيراد القيمةُ كلُّها — فالمنصّة هي المورِّد لا الوسيط. */
    expect(by('PLATFORM_REVENUE')).toBe('500');
    expect(by('VAT_PAYABLE')).toBe('75');
    /** وحصّةُ المزوّد تُشتقّ طرحًا: ٥٧٥ − ٧٥ − ٥٠. */
    expect(by('PROVIDER_PAYABLE')).toBe('450');
    expect(by('PROVIDER_COST')).toBe('450');
  });

  /**
   * **والمعاملتان منفصلتان**: استحقاقُ إيرادنا حدثٌ، ودَينُ المزوّد
   * حدثٌ آخر يُسدَّد في موعدٍ آخر — وخلطُهما يجعل تسويةَ المزوّد تبدو
   * ردًّا للعميل.
   */
  it('ولكلِّ حدثٍ معاملتُه، وكلتاهما متوازنة', async () => {
    const ref = `SRV-LDG-${String(Date.now()).slice(-9)}`;
    refs.push(ref);
    const user = await db.user.findFirstOrThrow({ where: { role: 'USER' }, select: { id: true } });
    await recordServiceEarned(db, { ref, requesterId: user.id, ...MONEY });

    const rows = await db.ledgerEntry.findMany({
      where: { note: ref },
      select: { txnId: true, direction: true, amount: true, event: true },
    });
    const txns = [...new Set(rows.map((row) => row.txnId))];
    expect(txns).toHaveLength(2);
    expect(new Set(rows.map((row) => row.event))).toEqual(
      new Set(['service.earned', 'service.provider_due']),
    );

    for (const txn of txns) {
      const side = (direction: string): Prisma.Decimal =>
        rows
          .filter((row) => row.txnId === txn && row.direction === direction)
          .reduce((total, row) => total.plus(row.amount), new Prisma.Decimal(0));
      expect(side('DEBIT').equals(side('CREDIT')), txn).toBe(true);
    }
  });

  it('ورسمٌ يبتلع القيمة كلَّها لا يُنتج دَينًا سالبًا', async () => {
    const ref = `SRV-LDG-${String(Date.now()).slice(-9)}`;
    refs.push(ref);
    const user = await db.user.findFirstOrThrow({ where: { role: 'USER' }, select: { id: true } });

    const result = await recordServiceEarned(db, {
      ref,
      requesterId: user.id,
      total: '575.00',
      platformFee: '600.00',
      vat: '75.00',
    });
    expect(result.ok).toBe(false);
    expect(await entries(ref)).toHaveLength(0);
  });
});

/**
 * ═══ والمسار يكتبه ═══
 *
 * فالقيد لا ينفع مبنيًّا بلا من ينادِيه — وهو الصنف الذي أُغلق بالبوابة ٥٠.
 */
describe('إنجازُ المزوّد يكتب القيد', () => {
  it('وطلبٌ بلا دفعة لا يُقيَّد — فالزرع يُنجز طلباتٍ لم تُدفع', async () => {
    const provider = await db.serviceProvider.findFirstOrThrow({
      where: { type: 'INSPECTION', active: true, accountStatus: { in: ['ACTIVE', 'SEMI_ACTIVE'] } },
      select: { id: true, cities: true },
    });
    const service = await db.service.findFirstOrThrow({
      where: { providerType: 'INSPECTION', active: true },
      select: { id: true },
    });
    const city = provider.cities[0] ?? 'الرياض';
    const listing = await db.listing.findFirstOrThrow({
      where: { status: 'PUBLISHED', city },
      select: { id: true, vehicleId: true, sellerId: true },
    });
    const buyer = await db.user.findFirstOrThrow({
      where: { id: { not: listing.sellerId }, role: 'USER' },
      select: { id: true },
    });

    const ref = `SRV-LDG-${String(Date.now()).slice(-9)}`;
    refs.push(ref);
    await db.serviceRequest.create({
      data: {
        ref,
        serviceId: service.id,
        userId: buyer.id,
        sellerId: listing.sellerId,
        listingId: listing.id,
        vehicleId: listing.vehicleId,
        status: 'IN_PROGRESS',
        providerId: provider.id,
        amount: 575,
        adminFee: 50,
        vatAmount: 75,
        city,
      },
    });

    const result = await applyStep({
      ref,
      providerId: provider.id,
      step: 'complete',
      reason: null,
    });
    expect(result.ok).toBe(true);
    /** `paymentId` فارغ — فلا قيد. */
    expect(await entries(ref)).toHaveLength(0);

    await db.notification.deleteMany({ where: { entityType: 'ServiceRequest', entityId: ref } });
  });
});

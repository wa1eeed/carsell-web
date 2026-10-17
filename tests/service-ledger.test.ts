import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { Prisma } from '@/generated/prisma/client';
import { db } from '@/lib/db';
import { recordServiceEarned, recordServicePaid } from '@/lib/domain/ledger-events';
import { applyStep } from '@/lib/domain/provider-queue';
import { makeCompletable } from './helpers/completable';

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
/** ودفعاتُ الاختبار تُحذف معها — وإلّا تراكمت في جدولٍ تقرؤه الشاشات. */
const payments: string[] = [];

async function wipe(): Promise<void> {
  if (refs.length === 0) return;

  /**
   * **والوثيقة تُحذف بطلبها لا بشكلها.** حذفُ «كل فاتورة خدمة» يطال
   * ما لم يصنعه هذا الملفّ — ونظافةُ الاختبار تعيد ما غيّرته هي.
   */
  const mine = await db.serviceRequest.findMany({
    where: { ref: { in: refs } },
    select: { id: true },
  });
  const ids = mine.map((row) => row.id);
  if (ids.length > 0) {
    await db.taxInvoiceLine.deleteMany({
      where: { invoice: { serviceRequestId: { in: ids } } },
    });
    await db.taxInvoice.deleteMany({ where: { serviceRequestId: { in: ids } } });
  }
  /** **والقيد يُحذف بمعاملته لا بسطره** — وإلّا بقي طرفٌ يتيم يُسقط فحص التوازن. */
  const rows = await db.ledgerEntry.findMany({
    where: { note: { in: refs } },
    select: { txnId: true },
  });
  const txns = [...new Set(rows.map((row) => row.txnId))];
  if (txns.length > 0) await db.ledgerEntry.deleteMany({ where: { txnId: { in: txns } } });
  await db.serviceRequest.deleteMany({ where: { ref: { in: refs } } });
  refs.length = 0;
  if (payments.length > 0) {
    await db.payment.deleteMany({ where: { id: { in: payments } } });
    payments.length = 0;
  }
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

    await makeCompletable(ref);
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

/**
 * ═══ والفشل يردّ المال ═══
 *
 * الإشعار الحرج يقول «وما دُفع يُردّ» — وكان `REFUNDED` في التعداد بلا
 * كاتب، فيبقى مالُ من تعذّرت خدمتُه محجوزًا ومعه وعدٌ مكتوب.
 */
describe('ردُّ الخدمة المتعذّرة', () => {
  it('يُلغى الحجز ويُقيَّد الردّ — والحالُ يبقى «فشل» لا «مُسترَدّ»', async () => {
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

    /** دفعةٌ محجوزة بلا مرجع حجزٍ لدى بوّابة — فلا نداءَ شبكة في الاختبار. */
    const payment = await db.payment.create({
      data: {
        purpose: 'SERVICE_PURCHASE',
        gatewayKey: 'sandbox',
        environment: 'TEST',
        amount: 575,
        method: 'card',
        status: 'HELD',
      },
      select: { id: true },
    });
    payments.push(payment.id);

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
        paymentId: payment.id,
        amount: 575,
        adminFee: 50,
        vatAmount: 75,
        city,
      },
    });

    const result = await applyStep({
      ref,
      providerId: provider.id,
      step: 'fail',
      reason: 'تعذّر الوصول إلى المركبة بعد محاولتين متّفقٍ عليهما',
    });
    expect(result.ok).toBe(true);

    const rows = await entries(ref);
    expect(rows.map((row) => row.event)).toEqual(['service.refunded', 'service.refunded']);
    expect(rows.find((row) => row.account === 'BUYER_ADVANCE')?.direction).toBe('DEBIT');
    expect(rows.find((row) => row.account === 'ESCROW_AT_PROVIDER')?.direction).toBe('CREDIT');

    const after = await db.payment.findUniqueOrThrow({
      where: { id: payment.id },
      select: { status: true, returnedAmount: true },
    });
    expect(after.status).toBe('CANCELLED');
    expect(after.returnedAmount?.toString()).toBe('575');

    /**
     * **والحالُ «فشل» لا «مُسترَدّ»**: الثاني في التعداد نفسه فيمحو
     * سببَ التوقّف — وحالُ المال على الدفعة لا على العمل (درس قرار ١٧).
     */
    const request = await db.serviceRequest.findUniqueOrThrow({
      where: { ref },
      select: { status: true },
    });
    expect(request.status).toBe('FAILED');

    await db.notification.deleteMany({ where: { entityType: 'ServiceRequest', entityId: ref } });
  });

  it('ولا يُردّ مرّتين', async () => {
    const { refundFailedService } = await import('@/lib/domain/service-lifecycle');
    const service = await db.service.findFirstOrThrow({
      where: { providerType: 'INSPECTION' },
      select: { id: true },
    });
    const buyer = await db.user.findFirstOrThrow({ where: { role: 'USER' }, select: { id: true } });

    const payment = await db.payment.create({
      data: {
        purpose: 'SERVICE_PURCHASE',
        gatewayKey: 'sandbox',
        environment: 'TEST',
        amount: 100,
        method: 'card',
        status: 'HELD',
      },
      select: { id: true },
    });
    payments.push(payment.id);

    const ref = `SRV-LDG-${String(Date.now()).slice(-9)}`;
    refs.push(ref);
    await db.serviceRequest.create({
      data: {
        ref,
        serviceId: service.id,
        userId: buyer.id,
        status: 'FAILED',
        paymentId: payment.id,
        amount: 100,
      },
    });

    expect((await refundFailedService(ref)).ok).toBe(true);
    const second = await refundFailedService(ref);
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.reason).toBe('NOT_HELD');
    expect(await entries(ref)).toHaveLength(2);
  });
});

/**
 * ═══ وفاتورةُ الخدمة تُصدَر بدفعتها ═══
 *
 * تسويةُ المركبة تدرج الخدمات في المحجوب بسبب
 * `INVOICED_WITH_ITS_OWN_PAYMENT` — «مُفوتَرةٌ بدفعتها» — **ولم تكن**:
 * لا شيء في المنتج يُصدر فاتورةَ خدمة، فيُقبض المال وتُرصد ضريبتُه في
 * الدفتر بلا وثيقةٍ تخرج لمن دفع.
 */
describe('فاتورةُ الخدمة', () => {
  async function completed(): Promise<{ ref: string; providerId: string }> {
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

    const payment = await db.payment.create({
      data: {
        purpose: 'SERVICE_PURCHASE',
        gatewayKey: 'sandbox',
        environment: 'TEST',
        amount: 575,
        method: 'card',
        status: 'HELD',
      },
      select: { id: true },
    });
    payments.push(payment.id);

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
        paymentId: payment.id,
        amount: 575,
        adminFee: 50,
        vatAmount: 75,
        city,
      },
    });
    /**
     * **والإنجاز صار يشترط إثباتَه** (`FORM_INCOMPLETE`) — و`form` كان
     * مكتوبًا في الجدول ولا يُفرَض، فهذه الاختبارات تقيس ما بعد
     * الإنجاز وتمرّ من بابٍ لم يكن مغلقًا. والشرطُ يُستوفى في الطقم
     * مرّةً لا في كلّ `it`.
     */
    await makeCompletable(ref);
    return { ref, providerId: provider.id };
  }

  it('الإنجاز يُصدرها — ومبالغُها من القاعدة الضريبية لا من الطلب', async () => {
    const made = await completed();
    expect(
      (await applyStep({ ref: made.ref, providerId: made.providerId, step: 'complete', reason: null }))
        .ok,
    ).toBe(true);

    const request = await db.serviceRequest.findUniqueOrThrow({
      where: { ref: made.ref },
      select: { id: true },
    });
    const invoice = await db.taxInvoice.findUnique({
      where: { serviceRequestId: request.id },
      select: { number: true, total: true, taxTotal: true, ruleSupplyType: true, orderId: true },
    });
    expect(invoice).not.toBeNull();
    expect(invoice?.ruleSupplyType).toBe('SERVICE');
    expect(invoice?.total.toString()).toBe('575');
    expect(invoice?.taxTotal.toString()).toBe('75');
    /** **ولا تتعلّق بطلبِ مركبة** — فهي فاتورةُ دفعتها هي. */
    expect(invoice?.orderId).toBeNull();

    await db.notification.deleteMany({
      where: { entityType: 'ServiceRequest', entityId: made.ref },
    });
  });

  /** **ولا تُصدَر مرّتين** — والقيد في القاعدة لا في فحصٍ يسبقه. */
  it('ولا تُصدَر مرّتين', async () => {
    const made = await completed();
    await applyStep({ ref: made.ref, providerId: made.providerId, step: 'complete', reason: null });

    const { issueServiceInvoice } = await import('@/lib/domain/service-lifecycle');
    const again = await issueServiceInvoice(made.ref);
    expect(again.ok).toBe(true);

    const request = await db.serviceRequest.findUniqueOrThrow({
      where: { ref: made.ref },
      select: { id: true },
    });
    expect(await db.taxInvoice.count({ where: { serviceRequestId: request.id } })).toBe(1);

    await db.notification.deleteMany({
      where: { entityType: 'ServiceRequest', entityId: made.ref },
    });
  });

  it('وطلبٌ لم يُدفع لا يُفوتَر', async () => {
    const { issueServiceInvoice } = await import('@/lib/domain/service-lifecycle');
    const service = await db.service.findFirstOrThrow({
      where: { providerType: 'INSPECTION' },
      select: { id: true },
    });
    const buyer = await db.user.findFirstOrThrow({ where: { role: 'USER' }, select: { id: true } });

    const ref = `SRV-LDG-${String(Date.now()).slice(-9)}`;
    refs.push(ref);
    await db.serviceRequest.create({
      data: { ref, serviceId: service.id, userId: buyer.id, status: 'DONE', amount: 575 },
    });

    const result = await issueServiceInvoice(ref);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('NOT_PAID');
  });
});

/**
 * ═══ وتحصيلُ المحجوز ═══
 *
 * قِيس على شاشة الطلب: خدمةٌ `DONE`، وفاتورةٌ `INV-2026-000001`،
 * وإيرادٌ مُعترَفٌ به في الدفتر — **ودفعةٌ `HELD`**. والحجز ينقضي بعد
 * أيّام فيعود المال إلى بطاقة من دفع، وقد أدّينا الخدمة وأصدرنا له
 * وثيقةً بها.
 */
describe('تحصيلُ خدمةٍ أُنجزت', () => {
  /** وبحجزٍ حقيقيّ لدى التجريبية — فالتحصيل بلا مرجعٍ لا يُقاس. */
  async function heldInSandbox(): Promise<{ ref: string; providerId: string; paymentId: string }> {
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
    const { resolveForPayment } = await import('@/lib/payments/resolve');
    const gateway = await resolveForPayment('sandbox', 'TEST');
    const held = await gateway.hold({
      purpose: 'SERVICE_PURCHASE',
      ref,
      amount: MONEY.total,
      currency: 'SAR',
      method: 'card',
      returnUrl: 'http://localhost/ar/account/reports',
      idempotencyKey: `cap-${ref}`,
    });
    if (held.state === 'FAILED') throw new Error(`hold failed: ${held.code}`);

    const payment = await db.payment.create({
      data: {
        purpose: 'SERVICE_PURCHASE',
        gatewayKey: 'sandbox',
        environment: 'TEST',
        amount: MONEY.total,
        method: 'card',
        status: 'HELD',
        holdRef: held.holdRef,
      },
      select: { id: true },
    });
    payments.push(payment.id);

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
        paymentId: payment.id,
        amount: MONEY.total,
        adminFee: MONEY.platformFee,
        vatAmount: MONEY.vat,
        city,
      },
    });
    /**
     * **والإنجاز صار يشترط إثباتَه** (`FORM_INCOMPLETE`) — و`form` كان
     * مكتوبًا في الجدول ولا يُفرَض، فهذه الاختبارات تقيس ما بعد
     * الإنجاز وتمرّ من بابٍ لم يكن مغلقًا. والشرطُ يُستوفى في الطقم
     * مرّةً لا في كلّ `it`.
     */
    await makeCompletable(ref);
    return { ref, providerId: provider.id, paymentId: payment.id };
  }

  it('الإنجاز يُحصّله ويُقيّده خزينةً — لا إيرادًا ثانيًا', async () => {
    const made = await heldInSandbox();
    expect(
      (await applyStep({ ref: made.ref, providerId: made.providerId, step: 'complete', reason: null }))
        .ok,
    ).toBe(true);

    const after = await db.payment.findUniqueOrThrow({
      where: { id: made.paymentId },
      select: { status: true, settledAt: true, settledAmount: true, settleRef: true },
    });
    expect(after.status).toBe('SETTLED');
    expect(after.settledAmount?.toString()).toBe('575');
    expect(after.settledAt).not.toBeNull();
    /** **ومرجعُ التحصيل يُحفظ** — المطابقة تقرأ `settleRef ?? holdRef`. */
    expect(after.settleRef).not.toBeNull();

    const rows = await entries(made.ref);
    const captured = rows.filter((row) => row.event === 'service.captured');
    expect(captured.map((row) => `${row.account}:${row.direction}`).sort()).toEqual([
      'ESCROW_AT_PROVIDER:CREDIT',
      'PLATFORM_CASH:DEBIT',
    ]);
    expect(captured.every((row) => row.amount === '575')).toBe(true);

    /**
     * **والتحصيل حركةُ خزينة لا استحقاق**: الإيراد والضريبة اعتُرف
     * بهما عند الإنجاز، فقيدٌ ثانٍ يمسّهما يُضاعف إيرادَ يومٍ واحد.
     */
    expect(captured.some((row) => row.account === 'PLATFORM_REVENUE')).toBe(false);
    expect(captured.some((row) => row.account === 'VAT_PAYABLE')).toBe(false);

    await db.notification.deleteMany({ where: { entityType: 'ServiceRequest', entityId: made.ref } });
  });

  it('ولا يُحصَّل مرّتين — والحالُ يقول إنه حُصِّل', async () => {
    const made = await heldInSandbox();
    expect(
      (await applyStep({ ref: made.ref, providerId: made.providerId, step: 'complete', reason: null }))
        .ok,
    ).toBe(true);

    const { captureServicePayment } = await import('@/lib/domain/service-lifecycle');
    const again = await captureServicePayment(made.ref);
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.reason).toBe('NOT_HELD');

    const rows = await entries(made.ref);
    expect(rows.filter((row) => row.event === 'service.captured')).toHaveLength(2);

    await db.notification.deleteMany({ where: { entityType: 'ServiceRequest', entityId: made.ref } });
  });

  it('وما تعثّر تحصيلُه يُقرأ ليُعاد — والوظيفةُ مُسجَّلة', async () => {
    const made = await heldInSandbox();
    /** طلبٌ `DONE` ومالُه محجوز — وهو ما تلتقطه شبكةُ الأمان. */
    await db.serviceRequest.update({ where: { ref: made.ref }, data: { status: 'DONE' } });

    const { capturableServices, captureServicePayment } = await import(
      '@/lib/domain/service-lifecycle'
    );
    expect(await capturableServices()).toContain(made.ref);

    expect((await captureServicePayment(made.ref)).ok).toBe(true);
    /** **وما حُصِّل لا يُقرأ ثانيةً** — وإلّا دار المُجدوِل عليه كل مرّة. */
    expect(await capturableServices()).not.toContain(made.ref);

    const { JOB_NAMES } = await import('@/lib/jobs/run');
    expect(JOB_NAMES).toContain('captureDoneServices');
  });
});

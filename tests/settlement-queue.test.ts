import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { settlementQueue } from '@/lib/domain/settlement-queue';
import { netToSeller } from '@/lib/domain/money';

/**
 * ═══ طابور الإفراج ═══
 *
 * المسار والنصاب والنطاق كانت قائمة ومختبَرة، **ولا شاشة تناديها** —
 * فالمال يدخل الضمان ولا يخرج. وهذه القراءة هي ما تُغذّي الشاشة، فما
 * تُخطئ فيه يظهر زرًّا يَعِد بما يرفضه الخادم.
 *
 * **والحارس هنا هو `canSettle` نفسها** لا نسخةٌ منها: شاشةٌ تقول
 * «جاهز» وخادمٌ يقول «لا» أسوأ من شاشةٍ لا تقول شيئًا.
 */

const T0 = new Date('2026-07-20T10:00:00Z');
const days = (n: number): Date => new Date(T0.getTime() + n * 86_400_000);
const stamp = String(Date.now()).slice(-9);
const TAG = `QUE${stamp}`;

let buyerId: string;
let sellerId: string;
let adminId: string;
const listingIds: string[] = [];
const vehicleIds: string[] = [];
const orderIds: string[] = [];

type Case = {
  key: string;
  window: Date | null;
  stage: 'PAYMENT' | 'DONE';
  status: 'ACTIVE' | 'COMPLETED' | 'DISPUTED';
  dispute?: boolean;
  held?: boolean;
};

async function make(cases: readonly Case[]): Promise<void> {
  const model = await db.model.findFirstOrThrow({ include: { brand: true } });

  for (const c of cases) {
    const vehicle = await db.vehicle.create({
      data: {
        ownerId: sellerId, brandId: model.brandId, modelId: model.id,
        brandName: model.brand.nameAr, modelName: model.nameAr, year: 2022,
        bodyType: 'SEDAN', transmission: 'AUTOMATIC', fuel: 'PETROL', drivetrain: 'FWD',
        seats: 5, mileageKm: 60_000, colorExterior: 'أزرق', spec: 'SAUDI',
        condition: 'USED', city: 'الرياض', entryMode: 'MANUAL',
      },
    });
    vehicleIds.push(vehicle.id);

    const listing = await db.listing.create({
      data: {
        ref: `${TAG}L${c.key}`, vehicleId: vehicle.id, sellerId, type: 'DIRECT',
        status: 'RESERVED', askPrice: 80_000, city: 'الرياض', publishedAt: days(-30),
      },
    });
    listingIds.push(listing.id);

    const order = await db.order.create({
      data: {
        ref: `${TAG}-${c.key}`, listingId: listing.id, buyerId, sellerId,
        source: 'DIRECT', stage: c.stage, status: c.status,
        agreedPrice: 80_000, commissionPct: 2.5,
        commissionAmount: 2_000, sellerCommission: 2_000, buyerCommission: 0,
        transferFee: 350, vatAmount: 300, totalAmount: 80_650,
        createdAt: days(-20), stageEnteredAt: days(-10),
        returnWindowEndsAt: c.window,
      },
    });
    orderIds.push(order.id);

    if (c.held !== false) {
      await db.payment.create({
        data: {
          orderId: order.id, purpose: 'VEHICLE_ESCROW', gatewayKey: 'sandbox',
          environment: 'TEST', amount: 80_650, method: 'mada', status: 'HELD',
          holdRef: `${TAG}_h_${c.key}`, heldAt: days(-10),
        },
      });
    }

    if (c.dispute === true) {
      await db.dispute.create({
        data: {
          orderId: order.id, openedBy: buyerId, status: 'OPEN',
          reason: 'المركبة تخالف الوصف بما يكفي لاختبار الحجب',
          openedAt: days(-2), slaDueAt: days(0),
        },
      });
    }
  }
}

function only(rows: readonly { orderRef: string }[]): string[] {
  return rows.filter((row) => row.orderRef.startsWith(TAG)).map((row) => row.orderRef);
}

beforeEach(async () => {
  const [buyer, seller, admin] = await Promise.all([
    db.user.create({ data: { phone: `+96652${stamp}` } }),
    db.user.create({ data: { phone: `+96653${stamp}` } }),
    db.adminUser.create({
      data: { email: `q${stamp}@carsell.one`, name: 'قاسم', role: 'FINANCE', passwordHash: 'x' },
    }),
  ]);
  buyerId = buyer.id;
  sellerId = seller.id;
  adminId = admin.id;
});

afterEach(async () => {
  await db.approvalRequest.deleteMany({ where: { entityId: { startsWith: TAG } } });
  await db.dispute.deleteMany({ where: { orderId: { in: orderIds } } });
  await db.payment.deleteMany({ where: { orderId: { in: orderIds } } });
  await db.order.deleteMany({ where: { id: { in: orderIds } } });
  await db.listing.deleteMany({ where: { id: { in: listingIds } } });
  await db.vehicle.deleteMany({ where: { id: { in: vehicleIds } } });
  await db.adminUser.deleteMany({ where: { id: adminId } });
  await db.user.deleteMany({ where: { id: { in: [buyerId, sellerId] } } });
  orderIds.length = 0;
  listingIds.length = 0;
  vehicleIds.length = 0;
});

afterAll(async () => {
  await db.$disconnect();
});

describe('settlementQueue — الفرز', () => {
  it('نافذةٌ انقضت وحجزٌ قائم ⇒ جاهز', async () => {
    await make([{ key: 'A', window: days(-1), stage: 'DONE', status: 'COMPLETED' }]);
    const queue = await settlementQueue(T0);

    expect(only(queue.ready)).toEqual([`${TAG}-A`]);
    expect(only(queue.blocked)).toEqual([]);
  });

  it('كل سببٍ للحجب يُسمّى', async () => {
    await make([
      { key: 'W', window: days(3), stage: 'DONE', status: 'COMPLETED' },
      { key: 'T', window: null, stage: 'PAYMENT', status: 'ACTIVE' },
      { key: 'D', window: days(-1), stage: 'DONE', status: 'DISPUTED', dispute: true },
    ]);
    const queue = await settlementQueue(T0);
    const mine = queue.blocked.filter((row) => row.orderRef.startsWith(TAG));

    expect(mine.find((r) => r.orderRef.endsWith('-W'))?.blockedBy).toBe('RETURN_WINDOW_OPEN');
    expect(mine.find((r) => r.orderRef.endsWith('-T'))?.blockedBy).toBe('NOT_TRANSFERRED');
    expect(mine.find((r) => r.orderRef.endsWith('-D'))?.blockedBy).toBe('DISPUTED');
    expect(only(queue.ready)).toEqual([]);
  });

  /**
   * **المعيار هو الحجز لا المرحلة.** طلبٌ أُفرج عنه لا يعود إلى
   * الطابور، وطابورٌ يُفرز بالمرحلة يُبقيه فيُقرأ على أنه لم يُدفع.
   */
  it('طلبٌ بلا دفعةٍ محجوزة لا يدخل الطابور', async () => {
    await make([{ key: 'N', window: days(-1), stage: 'DONE', status: 'COMPLETED', held: false }]);
    const queue = await settlementQueue(T0);

    expect(only([...queue.ready, ...queue.blocked, ...queue.awaitingApproval])).toEqual([]);
  });

  it('المجموع يجمع المحجوز — والمحجوب داخله', async () => {
    await make([
      { key: 'A', window: days(-1), stage: 'DONE', status: 'COMPLETED' },
      { key: 'W', window: days(3), stage: 'DONE', status: 'COMPLETED' },
    ]);
    const before = await settlementQueue(days(-100));
    const queue = await settlementQueue(T0);

    // الفرق وحده يُقاس — القاعدة تحمل صفوفًا أخرى
    const delta = Number(queue.totalHeld) - Number(before.totalHeld);
    expect(delta).toBe(0);
    expect(Number(queue.totalHeld)).toBeGreaterThanOrEqual(161_300);
  });
});

describe('settlementQueue — الطلب المعلَّق', () => {
  async function open(ref: string, expiresAt: Date): Promise<void> {
    await db.approvalRequest.create({
      data: {
        kind: 'ESCROW_RELEASE', entityType: 'Order', entityId: ref,
        payload: {}, requestedBy: adminId, approvedBy: [],
        requiredApprovals: 2, status: 'PENDING', expiresAt,
      },
    });
  }

  it('طلبٌ قائم ينقل الصفّ إلى «ينتظر الاعتماد»', async () => {
    await make([{ key: 'A', window: days(-1), stage: 'DONE', status: 'COMPLETED' }]);
    await open(`${TAG}-A`, days(2));

    const queue = await settlementQueue(T0);
    expect(only(queue.ready)).toEqual([]);
    expect(only(queue.awaitingApproval)).toEqual([`${TAG}-A`]);

    const row = queue.awaitingApproval.find((r) => r.orderRef === `${TAG}-A`);
    // الطالب يُحسب واحدًا — فالمعروض يقول كم بلغ النصاب لا كم وافق
    expect(row?.approval?.approvals).toBe(1);
    expect(row?.approval?.required).toBe(2);
    expect(row?.approval?.requestedById).toBe(adminId);
    expect(row?.approval?.requestedByName).toBe('قاسم');
  });

  /**
   * **الحالة المخزَّنة لا تكفي متى كان لها وقت.** صفٌّ `PENDING` مضت
   * مهلته ولم تمرّ عليه وظيفةٌ تُغيّره يبقى في الجدول — فقراءتُه وحده
   * تعرض «ينتظر موافقة» لطلبٍ ميّت، ويردّ الخادم `EXPIRED` عند الضغط.
   */
  it('طلبٌ انقضت مهلته لا يُعرض معلَّقًا', async () => {
    await make([{ key: 'A', window: days(-1), stage: 'DONE', status: 'COMPLETED' }]);
    await open(`${TAG}-A`, days(-1));

    const queue = await settlementQueue(T0);
    expect(only(queue.awaitingApproval)).toEqual([]);
    // ويعود إلى «جاهز» — فيُطلب من جديد
    expect(only(queue.ready)).toEqual([`${TAG}-A`]);
  });
});

describe('settlementQueue — المال', () => {
  it('صافي البائع هو قاعدة money.ts نفسها', async () => {
    await make([{ key: 'A', window: days(-1), stage: 'DONE', status: 'COMPLETED' }]);
    const queue = await settlementQueue(T0);
    const row = queue.ready.find((r) => r.orderRef === `${TAG}-A`);

    const order = await db.order.findUniqueOrThrow({ where: { ref: `${TAG}-A` } });
    expect(row?.netToSeller).toBe(netToSeller(order).toFixed(2));

    /**
     * **٨٠٬٠٠٠ − ٢٬٠٠٠ عمولة البائع. ولا ضريبة ولا رسم نقل.**
     *
     * كان يُخصم منه ٣٥٠ رسمَ النقل و٣٠٠ ضريبةً — وكلاهما دفعهما
     * المشتري في إجماليه (٨٠٬٦٥٠ = ٨٠٬٠٠٠ + ٣٥٠ + ٣٠٠). فكان
     * البائع يدفع رسمًا لم يدفعه، وكشف تسويته يقول رقمًا وصفحة
     * أرباحه تقول آخر.
     */
    expect(row?.netToSeller).toBe('78000.00');
    expect(row?.heldAmount).toBe('80650.00');
  });
});

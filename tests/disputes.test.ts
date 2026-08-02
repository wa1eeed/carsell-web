import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import {
  DISPUTE_SLA_HOURS,
  addDisputeMessage,
  approveResolution,
  openDispute,
  overdueDisputes,
  proposeResolution,
} from '@/lib/domain/disputes';
import { advanceStage, holdEscrow, isFrozen } from '@/lib/domain/orders';

const T0 = new Date('2026-06-01T10:00:00Z');
const hours = (n: number): Date => new Date(T0.getTime() + n * 3600 * 1000);

let buyerId: string;
let sellerId: string;
let adminA: string;
let adminB: string;
let orderRef: string;
let orderId: string;
let listingId: string;
let vehicleId: string;

async function scaffold(): Promise<void> {
  const stamp = String(Date.now()).slice(-9);

  const [buyer, seller] = await Promise.all([
    db.user.create({ data: { phone: `+9665101${stamp}` } }),
    db.user.create({ data: { phone: `+9665102${stamp}` } }),
  ]);
  buyerId = buyer.id;
  sellerId = seller.id;

  const [a, b] = await Promise.all([
    db.adminUser.create({
      data: { email: `a${stamp}@carsell.one`, name: 'أ', role: 'OPS', passwordHash: 'x' },
    }),
    db.adminUser.create({
      data: { email: `b${stamp}@carsell.one`, name: 'ب', role: 'OPS', passwordHash: 'x' },
    }),
  ]);
  adminA = a.id;
  adminB = b.id;

  const model = await db.model.findFirstOrThrow({ include: { brand: true } });
  const vehicle = await db.vehicle.create({
    data: {
      ownerId: sellerId, brandId: model.brandId, modelId: model.id,
      brandName: model.brand.nameAr, modelName: model.nameAr, year: 2024,
      bodyType: 'SEDAN', transmission: 'AUTOMATIC', fuel: 'PETROL', drivetrain: 'FWD',
      seats: 5, mileageKm: 30_000, colorExterior: 'أبيض', spec: 'SAUDI',
      condition: 'USED', city: 'الرياض', entryMode: 'MANUAL',
    },
  });
  vehicleId = vehicle.id;

  const listing = await db.listing.create({
    data: {
      ref: `DSP${stamp}`, vehicleId: vehicle.id, sellerId, type: 'DIRECT',
      status: 'RESERVED', askPrice: 100_000, city: 'الرياض', publishedAt: T0,
    },
  });
  listingId = listing.id;

  const order = await db.order.create({
    data: {
      ref: `ORD-TST-${stamp}`, listingId: listing.id, buyerId, sellerId,
      source: 'DIRECT', stage: 'PAYMENT', status: 'ACTIVE',
      agreedPrice: 100_000, commissionPct: 0, commissionAmount: 0,
      transferFee: 350, vatAmount: 13_089, totalAmount: 100_350,
      createdAt: T0, stageEnteredAt: T0,
      paymentDueAt: hours(24),
    },
  });
  orderRef = order.ref;
  orderId = order.id;
  await holdEscrow(orderRef, T0);
}

async function teardown(): Promise<void> {
  await db.notification.deleteMany({ where: { userId: { in: [buyerId, sellerId] } } });
  await db.approvalRequest.deleteMany({ where: { requestedBy: { in: [adminA, adminB] } } });
  await db.dispute.deleteMany({ where: { orderId } });
  await db.orderEvent.deleteMany({ where: { orderId } });
  await db.escrow.deleteMany({ where: { orderId } });
  await db.order.deleteMany({ where: { id: orderId } });
  await db.listing.deleteMany({ where: { id: listingId } });
  await db.vehicle.deleteMany({ where: { id: vehicleId } });
  await db.user.deleteMany({ where: { id: { in: [buyerId, sellerId] } } });
  await db.adminUser.deleteMany({ where: { id: { in: [adminA, adminB] } } });
}

afterAll(async () => {
  await db.$disconnect();
});

beforeEach(async () => {
  await scaffold();
});

describe('dispute.freeze — القاعدة ١', () => {
  it('فتح النزاع يجمّد الطلب في مرحلته', async () => {
    const opened = await openDispute({ orderRef, openedBy: buyerId, reason: 'المركبة تخالف الوصف' }, T0);
    expect(opened.ok).toBe(true);

    const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.status).toBe('DISPUTED');
    expect(isFrozen(order.status)).toBe(true);
    // المرحلة كما هي — التجميد لا يُرجعها ولا يقدّمها
    expect(order.stage).toBe('PAYMENT');
    await teardown();
  });

  it('الطلب المجمَّد لا يتقدّم', async () => {
    await openDispute({ orderRef, openedBy: buyerId, reason: 'س' }, T0);

    const advanced = await advanceStage({ orderRef, actorId: sellerId, to: 'TRANSFER' }, hours(1));
    expect(advanced.ok).toBe(false);
    if (!advanced.ok) expect(advanced.reason).toBe('ORDER_FROZEN');
    await teardown();
  });

  /** بلا هذا يسقط الطلب بمهلة الدفع فيخسر المشتري حقّه في نزاعٍ فتحه هو. */
  it('الطلب المجمَّد لا يسقط بمهلة الدفع', async () => {
    await openDispute({ orderRef, openedBy: buyerId, reason: 'س' }, T0);

    const { timeoutUnpaidOrders } = await import('@/lib/domain/offers');
    const timedOut = await timeoutUnpaidOrders(hours(48));

    const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.status).toBe('DISPUTED');
    expect(timedOut).toBe(0);
    await teardown();
  });

  it('نزاع ثانٍ على نفس الطلب يُرفض', async () => {
    await openDispute({ orderRef, openedBy: buyerId, reason: 'س' }, T0);
    const again = await openDispute({ orderRef, openedBy: sellerId, reason: 'ص' }, hours(1));
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.reason).toBe('ALREADY_OPEN');
    await teardown();
  });

  it('غير طرفَي الطلب لا يفتح نزاعًا', async () => {
    const stranger = await db.user.create({ data: { phone: `+96659${String(Date.now()).slice(-7)}` } });
    const opened = await openDispute({ orderRef, openedBy: stranger.id, reason: 'س' }, T0);
    expect(opened.ok).toBe(false);
    await db.user.delete({ where: { id: stranger.id } });
    await teardown();
  });
});

describe('dispute.sla — القاعدة ٣', () => {
  it('المهلة ٤٨ ساعة من الفتح', async () => {
    const opened = await openDispute({ orderRef, openedBy: buyerId, reason: 'س' }, T0);
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    expect(opened.slaDueAt.getTime()).toBe(hours(DISPUTE_SLA_HOURS).getTime());
    await teardown();
  });

  /**
   * جوهر القاعدة: لو مدّدت الرسائل المهلة لصار من يريد إطالة النزاع
   * يرسل رسالةً كل يوم، ومن يريد تجاهله يصمت فتمتدّ عليه بلا نهاية.
   */
  it('الرسائل لا تمدّد المهلة — والصمت لا يفيد صاحبه', async () => {
    const opened = await openDispute({ orderRef, openedBy: buyerId, reason: 'س' }, T0);
    if (!opened.ok) return;

    await addDisputeMessage({ disputeId: opened.disputeId, authorId: sellerId, body: 'ردّي' }, hours(10));
    await addDisputeMessage({ disputeId: opened.disputeId, authorId: buyerId, body: 'ردّي' }, hours(30));

    const dispute = await db.dispute.findUniqueOrThrow({ where: { id: opened.disputeId } });
    expect(dispute.slaDueAt.getTime()).toBe(hours(DISPUTE_SLA_HOURS).getTime());
    expect(dispute.messages).toHaveLength(2);
    await teardown();
  });

  it('المتأخّر يظهر في الطابور ولا يُحسم تلقائيًّا', async () => {
    const opened = await openDispute({ orderRef, openedBy: buyerId, reason: 'س' }, T0);
    if (!opened.ok) return;

    expect((await overdueDisputes(hours(DISPUTE_SLA_HOURS - 1))).some((d) => d.id === opened.disputeId)).toBe(false);
    expect((await overdueDisputes(hours(DISPUTE_SLA_HOURS + 1))).some((d) => d.id === opened.disputeId)).toBe(true);

    // ولا يُحسم بانقضاء الوقت — قرار ماليّ لا يصدر بمرور ساعة
    const dispute = await db.dispute.findUniqueOrThrow({ where: { id: opened.disputeId } });
    expect(dispute.resolution).toBeNull();
    await teardown();
  });
});

describe('dispute.dualApproval — القاعدة ٢', () => {
  async function proposeAndApprove(resolution: 'FULL_REFUND' | 'PARTIAL_SETTLEMENT' | 'RELEASE_TO_SELLER', amount?: number) {
    const opened = await openDispute({ orderRef, openedBy: buyerId, reason: 'س' }, T0);
    if (!opened.ok) throw new Error('open failed');

    const proposed = await proposeResolution(
      { disputeId: opened.disputeId, adminId: adminA, resolution, ...(amount === undefined ? {} : { amount }) },
      hours(2),
    );
    return { opened, proposed };
  }

  it('موافقة واحدة لا تُنفّذ', async () => {
    const { proposed } = await proposeAndApprove('FULL_REFUND');
    if (!proposed.ok) return;

    const first = await approveResolution({ approvalId: proposed.approvalId, adminId: adminB }, hours(3));
    expect(first.ok && first.executed).toBe(false);
    expect(first.ok && first.approvals).toBe(1);

    const escrow = await db.escrow.findUniqueOrThrow({ where: { orderId } });
    expect(escrow.status).toBe('HELD');
    await teardown();
  });

  /** «عضوان» تعني عينين مستقلّتين لا ضغطتين من شخص واحد. */
  it('المقترِح لا يوافق على اقتراحه', async () => {
    const { proposed } = await proposeAndApprove('FULL_REFUND');
    if (!proposed.ok) return;

    const self = await approveResolution({ approvalId: proposed.approvalId, adminId: adminA }, hours(3));
    expect(self.ok).toBe(false);
    if (!self.ok) expect(self.reason).toBe('SELF_APPROVAL');
    await teardown();
  });

  it('العضو الواحد لا يوافق مرّتين', async () => {
    const { proposed } = await proposeAndApprove('FULL_REFUND');
    if (!proposed.ok) return;

    await approveResolution({ approvalId: proposed.approvalId, adminId: adminB }, hours(3));
    const twice = await approveResolution({ approvalId: proposed.approvalId, adminId: adminB }, hours(4));
    expect(twice.ok).toBe(false);
    if (!twice.ok) expect(twice.reason).toBe('ALREADY_APPROVED');
    await teardown();
  });

  it('استرجاع كامل ⇒ REFUNDED والطلب يُلغى', async () => {
    const { proposed } = await proposeAndApprove('FULL_REFUND');
    if (!proposed.ok) return;

    const admin3 = await db.adminUser.create({
      data: { email: `c${Date.now()}@carsell.one`, name: 'ج', role: 'OPS', passwordHash: 'x' },
    });
    await approveResolution({ approvalId: proposed.approvalId, adminId: adminB }, hours(3));
    const done = await approveResolution({ approvalId: proposed.approvalId, adminId: admin3.id }, hours(4));

    expect(done.ok && done.executed).toBe(true);
    expect((await db.escrow.findUniqueOrThrow({ where: { orderId } })).status).toBe('REFUNDED');

    const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.status).toBe('CANCELLED');
    // الطلب خرج من التجميد — النزاع حُسم
    expect(isFrozen(order.status)).toBe(false);

    await db.adminUser.delete({ where: { id: admin3.id } });
    await teardown();
  });

  it('تسوية جزئية ⇒ PARTIAL_REFUND بمبلغها', async () => {
    const { opened, proposed } = await proposeAndApprove('PARTIAL_SETTLEMENT', 15_000);
    if (!proposed.ok) return;

    const admin3 = await db.adminUser.create({
      data: { email: `d${Date.now()}@carsell.one`, name: 'د', role: 'OPS', passwordHash: 'x' },
    });
    await approveResolution({ approvalId: proposed.approvalId, adminId: adminB }, hours(3));
    await approveResolution({ approvalId: proposed.approvalId, adminId: admin3.id }, hours(4));

    expect((await db.escrow.findUniqueOrThrow({ where: { orderId } })).status).toBe('PARTIAL_REFUND');
    const dispute = await db.dispute.findUniqueOrThrow({ where: { id: opened.disputeId } });
    expect(Number(dispute.resolutionAmount)).toBe(15_000);

    await db.adminUser.delete({ where: { id: admin3.id } });
    await teardown();
  });

  it('إفراج للبائع ⇒ RELEASED والطلب يكتمل', async () => {
    const { proposed } = await proposeAndApprove('RELEASE_TO_SELLER');
    if (!proposed.ok) return;

    const admin3 = await db.adminUser.create({
      data: { email: `e${Date.now()}@carsell.one`, name: 'هـ', role: 'OPS', passwordHash: 'x' },
    });
    await approveResolution({ approvalId: proposed.approvalId, adminId: adminB }, hours(3));
    await approveResolution({ approvalId: proposed.approvalId, adminId: admin3.id }, hours(4));

    const escrow = await db.escrow.findUniqueOrThrow({ where: { orderId } });
    expect(escrow.status).toBe('RELEASED');
    expect(escrow.releasedAt).not.toBeNull();
    expect((await db.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe('COMPLETED');

    await db.adminUser.delete({ where: { id: admin3.id } });
    await teardown();
  });

  it('تسوية جزئية بلا مبلغ تُرفض، وبمبلغ يساوي الكل تُرفض', async () => {
    const opened = await openDispute({ orderRef, openedBy: buyerId, reason: 'س' }, T0);
    if (!opened.ok) return;

    const noAmount = await proposeResolution(
      { disputeId: opened.disputeId, adminId: adminA, resolution: 'PARTIAL_SETTLEMENT' },
      hours(2),
    );
    expect(noAmount.ok).toBe(false);

    const tooMuch = await proposeResolution(
      { disputeId: opened.disputeId, adminId: adminA, resolution: 'PARTIAL_SETTLEMENT', amount: 200_000 },
      hours(2),
    );
    expect(tooMuch.ok).toBe(false);
    await teardown();
  });

  it('الطرفان يُخطَران بالقرار بأولوية حرجة', async () => {
    const { proposed } = await proposeAndApprove('RELEASE_TO_SELLER');
    if (!proposed.ok) return;

    const admin3 = await db.adminUser.create({
      data: { email: `f${Date.now()}@carsell.one`, name: 'و', role: 'OPS', passwordHash: 'x' },
    });
    await approveResolution({ approvalId: proposed.approvalId, adminId: adminB }, hours(3));
    await approveResolution({ approvalId: proposed.approvalId, adminId: admin3.id }, hours(4));

    for (const userId of [buyerId, sellerId]) {
      const notice = await db.notification.findFirstOrThrow({
        where: { userId, templateKey: 'dispute.resolved' },
      });
      expect(notice.priority).toBe('critical');
    }

    await db.adminUser.delete({ where: { id: admin3.id } });
    await teardown();
  });
});

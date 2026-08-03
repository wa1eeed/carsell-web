import { afterAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { approveSettle, canTransition, requestSettle } from '@/lib/domain/payments';
import { RETURN_WINDOW_DAYS } from '@/lib/domain/transfer-windows';

afterAll(async () => {
  await db.$disconnect();
});

const DAY = 86_400_000;
let seq = 0;

async function admin() {
  seq += 1;
  return db.adminUser.create({
    data: {
      email: `stl${String(Date.now()).slice(-8)}${String(seq)}@carsell.one`,
      name: 'ماليّ', role: 'FINANCE', passwordHash: 'x',
    },
  });
}

/** طلبٌ محجوز ماله ونافذته منقضية — الحال التي يجوز فيها الإفراج. */
async function settleableOrder(windowEndsAt: Date) {
  const order = await db.order.findFirstOrThrow({ orderBy: { ref: 'asc' } });
  await db.payment.deleteMany({ where: { orderId: order.id } });
  await db.escrow.deleteMany({ where: { orderId: order.id } });
  await db.approvalRequest.deleteMany({ where: { entityId: order.ref } });

  await db.payment.create({
    data: {
      orderId: order.id, purpose: 'VEHICLE_ESCROW', gatewayKey: 'moyasar',
      amount: 1000, method: 'mada', status: 'HELD',
      holdRef: 'pay_test_1', heldAt: new Date(),
    },
  });
  await db.escrow.create({
    data: { orderId: order.id, amount: 1000, status: 'HELD', heldAt: new Date() },
  });
  return db.order.update({
    where: { id: order.id },
    data: { stage: 'DONE', status: 'COMPLETED', returnWindowEndsAt: windowEndsAt },
  });
}

async function cleanup(orderRef: string, ids: string[]) {
  const order = await db.order.findUniqueOrThrow({ where: { ref: orderRef } });
  await db.paymentEvent.deleteMany({
    where: { payment: { orderId: order.id } },
  });
  await db.payment.deleteMany({ where: { orderId: order.id } });
  await db.escrow.deleteMany({ where: { orderId: order.id } });
  await db.approvalRequest.deleteMany({ where: { entityId: orderRef } });
  await db.auditLog.deleteMany({ where: { actorId: { in: ids } } });
  await db.adminUser.deleteMany({ where: { id: { in: ids } } });
  await db.order.update({
    where: { id: order.id },
    data: { stage: 'TRANSFER', status: 'ACTIVE', returnWindowEndsAt: null },
  });
}

describe('═══ القاعدة ١٢ ═══ الإفراج بموافقة عضوين — مبنيّ محروسًا', () => {
  it('الطالب لا يوافق على طلبه، والمال لا يتحرّك بمحاولته', async () => {
    const requester = await admin();
    const approver = await admin();
    const order = await settleableOrder(new Date(Date.now() - DAY));

    const asked = await requestSettle(requester.id, order.ref);
    expect(asked.ok).toBe(true);
    if (asked.ok && asked.state === 'PENDING') expect(asked.required).toBe(2);

    const request = await db.approvalRequest.findFirstOrThrow({
      where: { entityId: order.ref, status: 'PENDING' },
    });

    // ═══ الطالب على نفسه ⇒ رفض ═══
    const self = await approveSettle(requester.id, request.id, null);
    expect(self.ok).toBe(false);
    if (!self.ok) expect(self.reason).toBe('SELF_APPROVAL');

    // والضمان ما زال محتجزًا
    const held = await db.escrow.findUniqueOrThrow({ where: { orderId: order.id } });
    expect(held.status).toBe('HELD');

    await cleanup(order.ref, [requester.id, approver.id]);
  });

  it('العضو الثاني يُنادي البوابة — وبلا مفاتيح تفشل صراحةً لا صامتة', async () => {
    const requester = await admin();
    const approver = await admin();
    const order = await settleableOrder(new Date(Date.now() - DAY));

    await requestSettle(requester.id, order.ref);
    const request = await db.approvalRequest.findFirstOrThrow({
      where: { entityId: order.ref, status: 'PENDING' },
    });

    const second = await approveSettle(approver.id, request.id, null);
    // لا مفاتيح ميسر بعد ⇒ البوابة غير مضبوطة، والفشل مسمّى
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.reason).toBe('GATEWAY_FAILED');
      expect(second.code).toBe('GATEWAY_NOT_CONFIGURED');
    }

    // ═══ والمال لم يتحرّك، والطلب باقٍ لإعادة المحاولة ═══
    const escrow = await db.escrow.findUniqueOrThrow({ where: { orderId: order.id } });
    expect(escrow.status).toBe('HELD');
    const stillPending = await db.approvalRequest.findUniqueOrThrow({ where: { id: request.id } });
    expect(stillPending.status).toBe('PENDING');

    await cleanup(order.ref, [requester.id, approver.id]);
  });
});

describe('نافذة الاسترجاع تحرس الإفراج — لا الشاشة', () => {
  it('النافذة المفتوحة تمنع الطلب أصلًا، وتقول متى', async () => {
    const requester = await admin();
    const until = new Date(Date.now() + 3 * DAY);
    const order = await settleableOrder(until);

    const result = await requestSettle(requester.id, order.ref);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('RETURN_WINDOW_OPEN');
      // يقول متى — لا «ممنوع» وحدها
      expect(result.until).toBe(until.toISOString());
    }

    // ولا طلب موافقة كُتب: الرفض قبل كل شيء
    expect(await db.approvalRequest.count({ where: { entityId: order.ref } })).toBe(0);
    expect(RETURN_WINDOW_DAYS).toBe(7);

    await cleanup(order.ref, [requester.id]);
  });

  it('نزاعٌ فُتح بين الطلب والاعتماد يوقف الإفراج', async () => {
    const requester = await admin();
    const approver = await admin();
    const order = await settleableOrder(new Date(Date.now() - DAY));

    await requestSettle(requester.id, order.ref);
    const request = await db.approvalRequest.findFirstOrThrow({
      where: { entityId: order.ref, status: 'PENDING' },
    });

    // النزاع بعد الطلب — والفحص يتكرّر عند التنفيذ
    await db.order.update({ where: { id: order.id }, data: { status: 'DISPUTED' } });

    const blocked = await approveSettle(approver.id, request.id, null);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.reason).toBe('DISPUTED');

    const escrow = await db.escrow.findUniqueOrThrow({ where: { orderId: order.id } });
    expect(escrow.status).toBe('HELD');

    await cleanup(order.ref, [requester.id, approver.id]);
  });

  it('ولا إفراج على طلب بلا حجز', async () => {
    const requester = await admin();
    const order = await db.order.findFirstOrThrow({ orderBy: { ref: 'asc' } });
    await db.payment.deleteMany({ where: { orderId: order.id } });

    const result = await requestSettle(requester.id, order.ref);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('NO_HELD_PAYMENT');

    await db.adminUser.delete({ where: { id: requester.id } });
  });
});

describe('آلة الحالات بلغة الضمان', () => {
  it('الانتقالات المسموحة صريحة — والمستحيل مستحيل', () => {
    expect(canTransition('CREATED', 'REQUIRES_ACTION')).toBe(true);
    expect(canTransition('REQUIRES_ACTION', 'HELD')).toBe(true);
    expect(canTransition('HELD', 'SETTLED')).toBe(true);
    expect(canTransition('HELD', 'CANCELLED')).toBe(true);
    expect(canTransition('SETTLED', 'RETURNED')).toBe(true);

    // ═══ ويبهوك متأخّر لا يقلب فشلًا إلى نجاح ═══
    expect(canTransition('FAILED', 'SETTLED')).toBe(false);
    expect(canTransition('FAILED', 'HELD')).toBe(false);
    expect(canTransition('CANCELLED', 'SETTLED')).toBe(false);
    expect(canTransition('RETURNED', 'SETTLED')).toBe(false);
    // ولا تسوية قبل حجز
    expect(canTransition('CREATED', 'SETTLED')).toBe(false);
  });
});

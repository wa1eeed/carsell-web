import { createHmac } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import {
  advancePayment,
  approveEscrowRelease,
  canTransition,
  checkIdempotency,
  hashBody,
  rememberIdempotency,
  requestEscrowRelease,
  startPayment,
} from '@/lib/domain/payments';
import { PENDING_PROVIDER, providerFor, verifyHmac } from '@/lib/payments/provider';
import type { PaymentProvider } from '@/lib/payments/provider';

afterAll(async () => {
  await db.$disconnect();
});

let seq = 0;
async function admin() {
  seq += 1;
  return db.adminUser.create({
    data: {
      email: `pay${String(Date.now()).slice(-8)}${String(seq)}@carsell.one`,
      name: 'ماليّ', role: 'FINANCE', passwordHash: 'x',
    },
  });
}

/** مزوّد وهمي ينجح — لاختبار المسار السعيد بلا مزوّد حقيقي. */
const approving: PaymentProvider = {
  ...PENDING_PROVIDER,
  name: 'test-approving',
  charge: () => Promise.resolve({ ok: true, providerRef: 'ref_test_1', requires3ds: false }),
};

const challenging: PaymentProvider = {
  ...PENDING_PROVIDER,
  name: 'test-3ds',
  charge: () =>
    Promise.resolve({
      ok: true,
      providerRef: 'ref_test_2',
      requires3ds: true,
      threeDsUrl: 'https://acs.example/challenge',
    }),
};

/** طلبٌ في مرحلة الدفع بمهلة سارية. */
async function payableOrder() {
  const order = await db.order.findFirstOrThrow({ where: { status: 'ACTIVE' } });
  return db.order.update({
    where: { id: order.id },
    data: {
      stage: 'PAYMENT',
      status: 'ACTIVE',
      paymentDueAt: new Date(Date.now() + 3600_000),
    },
  });
}

async function cleanPayments(orderId: string) {
  const payments = await db.payment.findMany({ where: { orderId }, select: { id: true } });
  await db.paymentEvent.deleteMany({ where: { paymentId: { in: payments.map((p) => p.id) } } });
  await db.payment.deleteMany({ where: { orderId } });
}

describe('آلة حالات الدفع', () => {
  it('الانتقالات المسموحة صريحة — والمستحيل مستحيل', () => {
    expect(canTransition('CREATED', 'REQUIRES_3DS')).toBe(true);
    expect(canTransition('REQUIRES_3DS', 'AUTHORIZED')).toBe(true);
    expect(canTransition('AUTHORIZED', 'CAPTURED')).toBe(true);
    expect(canTransition('CAPTURED', 'REFUNDED')).toBe(true);

    // ═══ ويب هوك متأخّر لا يقلب فشلًا إلى نجاح ═══
    expect(canTransition('FAILED', 'CAPTURED')).toBe(false);
    expect(canTransition('FAILED', 'AUTHORIZED')).toBe(false);
    expect(canTransition('CANCELLED', 'CAPTURED')).toBe(false);
    expect(canTransition('CREATED', 'CAPTURED')).toBe(false);
    expect(canTransition('REFUNDED', 'CAPTURED')).toBe(false);
  });

  it('انتقال ممنوع يُرفض في القاعدة لا في التعليق فقط', async () => {
    const order = await payableOrder();
    await cleanPayments(order.id);

    const started = await startPayment(
      { orderRef: order.ref, buyerId: order.buyerId, method: 'mada', returnUrl: 'https://x', idempotencyKey: 'k1' },
      approving,
    );
    expect(started.ok).toBe(true);
    if (!started.ok) throw new Error('لم تبدأ');

    await advancePayment(started.paymentId, 'FAILED', 'provider');
    const late = await advancePayment(started.paymentId, 'CAPTURED', 'provider');
    expect(late.ok).toBe(false);
    if (!late.ok) expect(late.reason).toBe('INVALID_TRANSITION');

    await cleanPayments(order.id);
  });
});

describe('بدء الدفع', () => {
  it('المبلغ من الطلب لا من الطلب الوارد', async () => {
    const order = await payableOrder();
    await cleanPayments(order.id);

    const started = await startPayment(
      { orderRef: order.ref, buyerId: order.buyerId, method: 'mada', returnUrl: 'https://x', idempotencyKey: 'k2' },
      approving,
    );
    if (!started.ok) throw new Error('لم تبدأ');

    const payment = await db.payment.findUniqueOrThrow({ where: { id: started.paymentId } });
    expect(payment.amount.toString()).toBe(order.totalAmount.toString());

    await cleanPayments(order.id);
  });

  it('3DS يُعيد رابط التحدّي وحالةً تنتظره', async () => {
    const order = await payableOrder();
    await cleanPayments(order.id);

    const started = await startPayment(
      { orderRef: order.ref, buyerId: order.buyerId, method: 'visa', returnUrl: 'https://x', idempotencyKey: 'k3' },
      challenging,
    );
    expect(started.ok).toBe(true);
    if (!started.ok) throw new Error('لم تبدأ');
    expect(started.status).toBe('REQUIRES_3DS');
    expect(started.threeDsUrl).toBe('https://acs.example/challenge');

    await cleanPayments(order.id);
  });

  it('محاولة حيّة قائمة تمنع ثانية — والبطاقة لا تُخصم مرّتين', async () => {
    const order = await payableOrder();
    await cleanPayments(order.id);

    await startPayment(
      { orderRef: order.ref, buyerId: order.buyerId, method: 'mada', returnUrl: 'https://x', idempotencyKey: 'k4' },
      approving,
    );
    const second = await startPayment(
      { orderRef: order.ref, buyerId: order.buyerId, method: 'mada', returnUrl: 'https://x', idempotencyKey: 'k5' },
      approving,
    );
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.reason).toBe('ATTEMPT_IN_FLIGHT');

    await cleanPayments(order.id);
  });

  it('غير المشتري والمرحلة الخطأ والمهلة الفائتة كلّها تُرفض', async () => {
    const order = await payableOrder();
    await cleanPayments(order.id);
    const base = { method: 'mada', returnUrl: 'https://x', idempotencyKey: 'k6' };

    const stranger = await startPayment({ ...base, orderRef: order.ref, buyerId: order.sellerId }, approving);
    expect(stranger.ok).toBe(false);
    if (!stranger.ok) expect(stranger.reason).toBe('NOT_BUYER');

    await db.order.update({ where: { id: order.id }, data: { paymentDueAt: new Date(Date.now() - 1000) } });
    const late = await startPayment({ ...base, orderRef: order.ref, buyerId: order.buyerId }, approving);
    expect(late.ok).toBe(false);
    if (!late.ok) expect(late.reason).toBe('WINDOW_PASSED');

    await db.order.update({ where: { id: order.id }, data: { stage: 'REQUEST', paymentDueAt: new Date(Date.now() + 3600_000) } });
    const early = await startPayment({ ...base, orderRef: order.ref, buyerId: order.buyerId }, approving);
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.reason).toBe('WRONG_STAGE');

    await cleanPayments(order.id);
  });

  it('فشل المزوّد يُسجَّل ولا يُبتلع — ولا مسار بديل للدفع', async () => {
    const order = await payableOrder();
    await cleanPayments(order.id);

    const result = await startPayment(
      { orderRef: order.ref, buyerId: order.buyerId, method: 'mada', returnUrl: 'https://x', idempotencyKey: 'k7' },
      PENDING_PROVIDER,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('PROVIDER_FAILED');
      expect(result.code).toBe('PROVIDER_NOT_CONFIGURED');
    }

    // والمحاولة الفاشلة لها صفّها — «دفعتُ ولم يصل» يُردّ عليه بسجلّ
    const failed = await db.payment.findFirstOrThrow({
      where: { orderId: order.id, status: 'FAILED' },
      include: { events: true },
    });
    expect(failed.failureCode).toBe('PROVIDER_NOT_CONFIGURED');
    expect(failed.events.some((event) => event.toStatus === 'FAILED')).toBe(true);

    await cleanPayments(order.id);
  });
});

describe('القبض يحجز الضمان ويقدّم الطلب', () => {
  it('CAPTURED ⇒ ضمان محتجز + مرحلة نقل الملكية', async () => {
    const order = await payableOrder();
    await cleanPayments(order.id);
    await db.escrow.deleteMany({ where: { orderId: order.id } });

    const started = await startPayment(
      { orderRef: order.ref, buyerId: order.buyerId, method: 'mada', returnUrl: 'https://x', idempotencyKey: 'k8' },
      approving,
    );
    if (!started.ok) throw new Error('لم تبدأ');

    await advancePayment(started.paymentId, 'CAPTURED', 'provider');

    const escrow = await db.escrow.findUniqueOrThrow({ where: { orderId: order.id } });
    expect(escrow.status).toBe('HELD');
    expect(escrow.amount.toString()).toBe(order.totalAmount.toString());

    const after = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(after.stage).toBe('TRANSFER');

    await db.escrow.deleteMany({ where: { orderId: order.id } });
    await db.orderEvent.deleteMany({ where: { orderId: order.id, actorType: 'system' } });
    await cleanPayments(order.id);
  });
});

describe('═══ القاعدة ١٢ ═══ الإفراج عن الضمان بموافقة عضوين', () => {
  async function heldOrder() {
    const order = await payableOrder();
    await db.escrow.deleteMany({ where: { orderId: order.id } });
    await db.escrow.create({
      data: { orderId: order.id, amount: order.totalAmount, status: 'HELD', heldAt: new Date() },
    });
    return db.order.update({
      where: { id: order.id },
      data: { stage: 'TRANSFER', status: 'ACTIVE' },
    });
  }

  it('الطالب لا يعتمد طلبه، والثاني يُفرج', async () => {
    const requester = await admin();
    const approver = await admin();
    const order = await heldOrder();

    const asked = await requestEscrowRelease(requester.id, order.ref);
    expect(asked.ok).toBe(true);

    const request = await db.approvalRequest.findFirstOrThrow({
      where: { kind: 'ESCROW_RELEASE', status: 'PENDING' },
    });

    // ═══ الطالب على نفسه ⇒ رفض، والمال لم يتحرّك ═══
    const self = await approveEscrowRelease(requester.id, request.id, null);
    expect(self.ok).toBe(false);
    if (!self.ok) expect(self.reason).toBe('SELF_APPROVAL');
    expect((await db.escrow.findUniqueOrThrow({ where: { orderId: order.id } })).status).toBe('HELD');

    // ═══ عضو ثانٍ ⇒ إفراج ═══
    const second = await approveEscrowRelease(approver.id, request.id, null);
    expect(second.ok).toBe(true);
    if (second.ok) expect(second.state).toBe('RELEASED');

    const escrow = await db.escrow.findUniqueOrThrow({ where: { orderId: order.id } });
    expect(escrow.status).toBe('RELEASED');
    expect(escrow.releasedAt).not.toBeNull();

    const entry = await db.auditLog.findFirstOrThrow({ where: { action: 'escrow.released' } });
    expect((entry.after as { approvedBy?: string[] }).approvedBy).toContain(approver.id);

    await db.approvalRequest.deleteMany({ where: { kind: 'ESCROW_RELEASE' } });
    await db.escrow.deleteMany({ where: { orderId: order.id } });
    await db.auditLog.deleteMany({ where: { actorId: { in: [requester.id, approver.id] } } });
    await db.adminUser.deleteMany({ where: { id: { in: [requester.id, approver.id] } } });
  });

  it('نزاعٌ فُتح بين الطلب والاعتماد يوقف الإفراج', async () => {
    const requester = await admin();
    const approver = await admin();
    const order = await heldOrder();

    await requestEscrowRelease(requester.id, order.ref);
    const request = await db.approvalRequest.findFirstOrThrow({
      where: { kind: 'ESCROW_RELEASE', status: 'PENDING' },
    });

    // النزاع يقع بعد الطلب — والفحص يتكرّر عند التنفيذ
    await db.order.update({ where: { id: order.id }, data: { status: 'DISPUTED' } });

    const blocked = await approveEscrowRelease(approver.id, request.id, null);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.reason).toBe('ORDER_DISPUTED');
    expect((await db.escrow.findUniqueOrThrow({ where: { orderId: order.id } })).status).toBe('HELD');

    await db.order.update({ where: { id: order.id }, data: { status: 'ACTIVE' } });
    await db.approvalRequest.deleteMany({ where: { kind: 'ESCROW_RELEASE' } });
    await db.escrow.deleteMany({ where: { orderId: order.id } });
    await db.auditLog.deleteMany({ where: { actorId: { in: [requester.id, approver.id] } } });
    await db.adminUser.deleteMany({ where: { id: { in: [requester.id, approver.id] } } });
  });

  it('لا إفراج قبل نقل الملكية ولا عمّا لم يُقبض', async () => {
    const requester = await admin();
    const order = await payableOrder();
    await db.escrow.deleteMany({ where: { orderId: order.id } });

    // بلا ضمان أصلًا
    expect((await requestEscrowRelease(requester.id, order.ref)).ok).toBe(false);

    // ضمان محتجز لكن الطلب ما زال في الدفع
    await db.escrow.create({
      data: { orderId: order.id, amount: order.totalAmount, status: 'HELD', heldAt: new Date() },
    });
    const early = await requestEscrowRelease(requester.id, order.ref);
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.reason).toBe('STAGE_TOO_EARLY');

    await db.escrow.deleteMany({ where: { orderId: order.id } });
    await db.adminUser.delete({ where: { id: requester.id } });
  });
});

describe('مفتاح التكرار', () => {
  it('نفس المفتاح ونفس الجسم ⇒ تُعاد الاستجابة الأولى', async () => {
    const key = `idem-${String(Date.now())}`;
    const body = { orderRef: 'ORD-1', method: 'mada' };

    expect((await checkIdempotency(key, 'payment.create', body)).kind).toBe('fresh');
    await rememberIdempotency(key, 'payment.create', body, { paymentId: 'p1' }, 201);

    const replay = await checkIdempotency(key, 'payment.create', body);
    expect(replay.kind).toBe('replay');
    if (replay.kind === 'replay') {
      expect(replay.status).toBe(201);
      expect(replay.response).toEqual({ paymentId: 'p1' });
    }

    await db.idempotencyKey.delete({ where: { key } });
  });

  it('نفس المفتاح بجسم مختلف ⇒ تعارض لا إعادة صامتة', async () => {
    const key = `idem-c-${String(Date.now())}`;
    await rememberIdempotency(key, 'payment.create', { a: 1 }, { ok: true }, 201);

    const conflict = await checkIdempotency(key, 'payment.create', { a: 2 });
    expect(conflict.kind).toBe('conflict');

    // ومجالٌ مختلف بالمفتاح نفسه تعارضٌ أيضًا
    expect((await checkIdempotency(key, 'offer.create', { a: 1 })).kind).toBe('conflict');

    await db.idempotencyKey.delete({ where: { key } });
  });

  it('البصمة تتغيّر بتغيّر الجسم', () => {
    expect(hashBody({ a: 1 })).toBe(hashBody({ a: 1 }));
    expect(hashBody({ a: 1 })).not.toBe(hashBody({ a: 2 }));
  });
});

describe('توقيع الويب هوك', () => {
  it('التوقيع الصحيح يمرّ والخاطئ يُرفض', () => {
    const secret = 'whsec_test_secret_value_0000';
    const body = '{"type":"payment.captured","id":"evt_1"}';
    const signature = createHmac('sha256', secret).update(body, 'utf8').digest('hex');

    expect(verifyHmac(body, signature, secret)).toBe(true);
    expect(verifyHmac(body, signature, 'wrong_secret_value_00000000')).toBe(false);
    // جسمٌ عُبث به بنفس التوقيع
    expect(verifyHmac('{"type":"payment.captured","id":"evt_2"}', signature, secret)).toBe(false);
    expect(verifyHmac(body, '', secret)).toBe(false);
    expect(verifyHmac(body, 'not-hex-@@@', secret)).toBe(false);
    expect(verifyHmac(body, signature, '')).toBe(false);
  });

  it('بلا سرّ لا توقيع صحيح — ولا يُقبل أيّ ويب هوك', () => {
    expect(PENDING_PROVIDER.verifySignature('{}', 'anything')).toBe(false);
    expect(providerFor(null).name).toBe('pending');
    expect(providerFor(null).verifySignature('{}', 'anything')).toBe(false);
  });
});

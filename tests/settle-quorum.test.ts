import { afterAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { approveSettle, canTransition, requestSettle } from '@/lib/domain/payments';
import { type OrderSnapshot, restoreOrder, snapshotOrder } from './helpers/order-fixture';

afterAll(async () => {
  await db.$disconnect();
});

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

/**
 * ═══ الاستعادة من الموضع الواحد — لا بيدٍ هنا ═══
 *
 * كان هذا الملف يأخذ **أوّل طلبٍ مزروع** ويحرّكه، ثم «يستعيده» إلى
 * `TRANSFER` مكتوبةً بيد — و`ORD-2026-1000` مزروعٌ في `REQUEST`. فكان
 * يتركه في مرحلةٍ بلغت الدفع **بلا ضمان**: حالةٌ لا يبلغها المنتج،
 * تبقى في قاعدة التطوير بعد كل تشغيل.
 *
 * واللقطة تُعيد الصفّ حرفيًّا — ويتبع الأثرَ الجديد موضعٌ واحد.
 */
let snapshot: OrderSnapshot | null = null;

/** طلبٌ محجوز ماله ونافذته منقضية — الحال التي يجوز فيها الإفراج. */
async function settleableOrder(stage: 'DONE' | 'TRANSFER' = 'DONE') {
  const order = await db.order.findFirstOrThrow({ orderBy: { ref: 'asc' } });
  snapshot = await snapshotOrder(order.id);

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
    data: { stage, status: stage === 'DONE' ? 'COMPLETED' : 'ACTIVE' },
  });
}

async function cleanup(orderRef: string, ids: string[]) {
  await db.approvalRequest.deleteMany({ where: { entityId: orderRef } });
  await db.auditLog.deleteMany({ where: { actorId: { in: ids } } });
  await db.adminUser.deleteMany({ where: { id: { in: ids } } });
  if (snapshot !== null) {
    await restoreOrder(snapshot);
    snapshot = null;
  }
}

describe('═══ القاعدة ١٢ ═══ الإفراج بموافقة عضوين — مبنيّ محروسًا', () => {
  /**
   * ═══ ونصابُ الواحد (قرار المالك ٢٠٢٦-١٠-١٤) ═══
   *
   * كان هنا «الطالب لا يوافق على طلبه» — قاعدةٌ أُلغيت، **واختبارٌ
   * يثبّتها يجعل تنفيذ القرار يبدو كسرًا**. والقاعدة النافذة: طلبُ
   * الواحد يُنادي البوابة، والفشلُ يُسمّى ولا يتحرّك المال.
   */
  it('طلبُ الواحد يُنادي البوابة — وبلا مفاتيح تفشل صراحةً', async () => {
    const requester = await admin();
    const approver = await admin();
    const order = await settleableOrder();

    const second = await requestSettle(requester.id, order.ref);
    // لا مفاتيح ميسر بعد ⇒ البوابة غير مضبوطة، والفشل مسمّى
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.reason).toBe('GATEWAY_FAILED');
      expect(second.code).toBe('GATEWAY_NOT_CONFIGURED');
    }

    // ═══ والمال لم يتحرّك، والطلب باقٍ لإعادة المحاولة ═══
    const escrow = await db.escrow.findUniqueOrThrow({ where: { orderId: order.id } });
    expect(escrow.status).toBe('HELD');
    const stillPending = await db.approvalRequest.findFirstOrThrow({
      where: { entityId: order.ref },
      orderBy: { id: 'desc' },
    });
    expect(stillPending.status).toBe('PENDING');

    await cleanup(order.ref, [requester.id, approver.id]);
  });
});

describe('تأكيد النقل يحرس الإفراج — لا الشاشة', () => {
  /**
   * كانت نافذة استرجاعٍ سبعة أيام تحرسه؛ أُلغيت بقرار المصمّم. والحارس
   * الباقي: **نُقلت الملكية، ولا نزاع**.
   */
  it('طلبٌ لم تُنقل ملكيته يُرفض قبل أن يُكتب له شيء', async () => {
    const requester = await admin();
    const order = await settleableOrder('TRANSFER');

    const result = await requestSettle(requester.id, order.ref);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('NOT_TRANSFERRED');

    // ولا طلب موافقة كُتب: الرفض قبل كل شيء
    expect(await db.approvalRequest.count({ where: { entityId: order.ref } })).toBe(0);

    await cleanup(order.ref, [requester.id]);
  });

  it('نزاعٌ فُتح بين الطلب والاعتماد يوقف الإفراج', async () => {
    const requester = await admin();
    const approver = await admin();
    const order = await settleableOrder();

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
    const taken = await snapshotOrder(order.id);
    await db.payment.deleteMany({ where: { orderId: order.id } });

    const result = await requestSettle(requester.id, order.ref);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('NO_HELD_PAYMENT');

    await restoreOrder(taken);
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

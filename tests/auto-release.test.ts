import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { advanceStage } from '@/lib/domain/orders';
import { openDispute } from '@/lib/domain/disputes';
import { settleOnTransferConfirmed } from '@/lib/domain/payments';
import { settleableOrders } from '@/lib/domain/transfer-windows';

/**
 * ═══ الإفراج يتبع تأكيد نقل الملكية ═══
 *
 * قرار المصمّم: أُلغيت نافذة الاسترجاع (٧ أيام بين التأكيد والإفراج).
 * حين تصير المركبة باسم المشتري في المرور فقد وقع البيع، واحتجازُ
 * المال بعدها تأخيرٌ للبائع بلا ما يقابله.
 *
 * **والتلقائيّ هو الأصل، واليدويّ بنصاب عضوين للحالات الخاصّة.**
 */

const stamp = String(Date.now()).slice(-9);
const TAG = `REL${stamp}`;
const T0 = new Date('2026-07-28T09:00:00Z');

let buyerId: string;
let sellerId: string;
let vehicleId: string;
let listingId: string;
let orderId: string;
let orderRef: string;
let holdRef: string;

async function scaffold(stage: 'TRANSFER' | 'PAYMENT' = 'TRANSFER'): Promise<void> {
  const [buyer, seller] = await Promise.all([
    db.user.create({ data: { phone: `+96654${stamp}` } }),
    db.user.create({ data: { phone: `+96655${stamp}` } }),
  ]);
  buyerId = buyer.id;
  sellerId = seller.id;

  const model = await db.model.findFirstOrThrow({ include: { brand: true } });
  const vehicle = await db.vehicle.create({
    data: {
      ownerId: sellerId, brandId: model.brandId, modelId: model.id,
      brandName: model.brand.nameAr, modelName: model.nameAr, year: 2021,
      bodyType: 'SEDAN', transmission: 'AUTOMATIC', fuel: 'PETROL', drivetrain: 'FWD',
      seats: 5, mileageKm: 70_000, colorExterior: 'رمادي', spec: 'SAUDI',
      condition: 'USED', city: 'الدمام', entryMode: 'MANUAL',
    },
  });
  vehicleId = vehicle.id;

  const listing = await db.listing.create({
    data: {
      ref: `${TAG}L`, vehicleId: vehicle.id, sellerId, type: 'DIRECT',
      status: 'RESERVED', askPrice: 50_000, city: 'الدمام', publishedAt: T0,
    },
  });
  listingId = listing.id;

  const order = await db.order.create({
    data: {
      ref: `${TAG}-1`, listingId: listing.id, buyerId, sellerId,
      source: 'DIRECT', stage, status: 'ACTIVE',
      agreedPrice: 50_000, commissionPct: 0, commissionAmount: 0,
      sellerCommission: 0, buyerCommission: 0,
      transferFee: 350, vatAmount: 0, totalAmount: 50_350,
      createdAt: T0, stageEnteredAt: T0,
      paymentDueAt: new Date(T0.getTime() + 86_400_000),
    },
  });
  orderId = order.id;
  orderRef = order.ref;

  /** حجزٌ حقيقيّ في sandbox — وإلّا ردّ المُهايئ `HOLD_NOT_FOUND`. */
  holdRef = `${TAG}_hold`;
  await db.sandboxTransaction.create({
    data: { ref: holdRef, kind: 'HOLD', amount: 50_350, state: 'HELD', method: 'mada' },
  });
  await db.payment.create({
    data: {
      orderId: order.id, purpose: 'VEHICLE_ESCROW', gatewayKey: 'sandbox',
      environment: 'TEST', amount: 50_350, method: 'mada', status: 'HELD',
      holdRef, heldAt: T0,
    },
  });
  await db.escrow.create({
    data: { orderId: order.id, amount: 50_350, status: 'HELD', heldAt: T0 },
  });
}

async function teardown(): Promise<void> {
  await db.sandboxTransaction.deleteMany({ where: { OR: [{ ref: holdRef }, { parentRef: holdRef }] } });
  await db.auditLog.deleteMany({ where: { entityId: orderRef } });
  await db.approvalRequest.deleteMany({ where: { entityId: orderRef } });
  await db.taxInvoiceLine.deleteMany({ where: { invoice: { orderId } } });
  await db.taxInvoice.deleteMany({ where: { orderId } });
  await db.settlementStatement.deleteMany({ where: { orderId } });
  await db.vehicleSaleAgreement.deleteMany({ where: { orderId } });
  await db.ledgerEntry.deleteMany({ where: { orderId } });
  await db.paymentEvent.deleteMany({ where: { payment: { orderId } } });
  await db.payment.deleteMany({ where: { orderId } });
  await db.dispute.deleteMany({ where: { orderId } });
  await db.escrow.deleteMany({ where: { orderId } });
  await db.orderEvent.deleteMany({ where: { orderId } });
  await db.order.deleteMany({ where: { id: orderId } });
  await db.listing.deleteMany({ where: { id: listingId } });
  await db.vehicle.deleteMany({ where: { id: vehicleId } });
  await db.user.deleteMany({ where: { id: { in: [buyerId, sellerId] } } });
}

beforeEach(() => scaffold());
afterEach(() => teardown());
afterAll(async () => {
  await db.$disconnect();
});

describe('الإفراج التلقائيّ عند تأكيد النقل', () => {
  it('تأكيد النقل يُفرج عن المال بلا انتظار', async () => {
    const moved = await advanceStage({ orderRef, actorId: sellerId, to: 'DONE' }, T0);
    expect(moved.ok).toBe(true);

    const payment = await db.payment.findFirstOrThrow({ where: { orderId } });
    expect(payment.status).toBe('SETTLED');
    // ومرجع المزوّد محفوظ — به تُطابق التسوية اليومية
    expect(payment.settleRef).not.toBeNull();
  });

  /**
   * **بـ`actorType: 'system'`** — لم يضغطه أحد. ونسبتُه إلى أدمن تقول
   * في التدقيق إن إنسانًا قرّر، وهو لم يقرّر.
   */
  it('والأثر يقول إنه تلقائيّ بلا نصاب', async () => {
    await advanceStage({ orderRef, actorId: sellerId, to: 'DONE' }, T0);

    const entry = await db.auditLog.findFirstOrThrow({
      where: { entityId: orderRef, action: 'escrow.settled' },
    });
    expect(entry.actorType).toBe('system');
    expect((entry.after as { trigger?: string }).trigger).toBe('transfer.confirmed');
    expect((entry.after as { quorum?: string }).quorum).toBe('none');
  });

  it('ولا يُفرج قبل تأكيد النقل', async () => {
    const result = await settleOnTransferConfirmed(orderRef, T0);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('NOT_TRANSFERRED');

    const payment = await db.payment.findFirstOrThrow({ where: { orderId } });
    expect(payment.status).toBe('HELD');
  });

  it('والنزاع المفتوح يمنعه', async () => {
    const opened = await openDispute(
      { orderRef, openedBy: buyerId, reason: 'المركبة تخالف الوصف بما يكفي للاختبار' },
      T0,
    );
    expect(opened.ok).toBe(true);

    const result = await settleOnTransferConfirmed(orderRef, T0);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('DISPUTED');
  });
});

describe('شبكة الأمان الدورية', () => {
  /**
   * الفوريّ قد يتعثّر — بوابةٌ لا تردّ، أو حاويةٌ تسقط بين التأكيد
   * والنداء. فلولا الوظيفة الدورية بقي مال البائع محجوزًا بلا ما يقول
   * إن النداء لم يقع.
   */
  it('طلبٌ نُقل ومالُه محجوز يبقى مرشَّحًا حتى يُفرَج', async () => {
    await db.order.update({ where: { id: orderId }, data: { stage: 'DONE', status: 'COMPLETED' } });

    expect(await settleableOrders()).toContain(orderRef);

    const released = await settleOnTransferConfirmed(orderRef, T0);
    expect(released.ok).toBe(true);

    // أُفرج ⇒ خرج من القائمة، فلا يُنادى المزوّد مرّتين
    expect(await settleableOrders()).not.toContain(orderRef);
  });
});

describe('النزاع يُغلق عند تأكيد النقل — القرار «أ»', () => {
  /**
   * أثرٌ لازم للإفراج الفوريّ: بعده لا مال محجوز يُجمَّد، و«استرجاعٌ
   * كامل» يصير وعدًا بلا مصدر. فالفحص قبل التأكيد لا بعده.
   */
  it('لا يُفتح نزاعٌ بعد تأكيد النقل', async () => {
    await advanceStage({ orderRef, actorId: sellerId, to: 'DONE' }, T0);

    const result = await openDispute(
      { orderRef, openedBy: buyerId, reason: 'اكتشفتُ عيبًا بعد نقل الملكية والاستلام' },
      T0,
    );
    expect(result.ok).toBe(false);
  });

  it('ويُفتح قبله — عند النقل', async () => {
    const result = await openDispute(
      { orderRef, openedBy: buyerId, reason: 'المركبة تخالف الوصف قبل إتمام النقل' },
      T0,
    );
    expect(result.ok).toBe(true);
  });
});

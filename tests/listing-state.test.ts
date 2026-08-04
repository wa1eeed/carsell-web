import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { advanceStage } from '@/lib/domain/orders';
import { republishListing, reserveListing, suspendListing } from '@/lib/domain/listing-state';

/**
 * ═══ حالة الإعلان تتبع الطلب ═══
 *
 * العطل الذي وُلد منه هذا الملف: **الإعلان لم يكن يصير `SOLD` أبدًا.**
 * الطلب يكتمل ويصير `COMPLETED` ويصدر عقد البيع — والإعلان يبقى
 * `RESERVED`. ولا اختبارٌ سقط، لأن لا اختبار كان يسأل عن الإعلان بعد
 * الاكتمال: ٥٣٣ اختبارًا تمرّ فوق مركبةٍ بيعت وما زالت معروضة.
 */

const T0 = new Date('2026-07-01T09:00:00Z');

let buyerId: string;
let sellerId: string;
let vehicleId: string;
let listingId: string;
let orderId: string;
let orderRef: string;

async function scaffold(stage: 'TRANSFER' | 'PAYMENT' = 'TRANSFER'): Promise<void> {
  const stamp = String(Date.now()).slice(-9);

  const [buyer, seller] = await Promise.all([
    db.user.create({ data: { phone: `+9665201${stamp}` } }),
    db.user.create({ data: { phone: `+9665202${stamp}` } }),
  ]);
  buyerId = buyer.id;
  sellerId = seller.id;

  const model = await db.model.findFirstOrThrow({ include: { brand: true } });
  const vehicle = await db.vehicle.create({
    data: {
      ownerId: sellerId, brandId: model.brandId, modelId: model.id,
      brandName: model.brand.nameAr, modelName: model.nameAr, year: 2023,
      bodyType: 'SEDAN', transmission: 'AUTOMATIC', fuel: 'PETROL', drivetrain: 'FWD',
      seats: 5, mileageKm: 44_000, colorExterior: 'أسود', spec: 'SAUDI',
      condition: 'USED', city: 'جدة', entryMode: 'MANUAL',
    },
  });
  vehicleId = vehicle.id;

  const listing = await db.listing.create({
    data: {
      ref: `LST${stamp}`, vehicleId: vehicle.id, sellerId, type: 'DIRECT',
      status: 'RESERVED', askPrice: 90_000, city: 'جدة', publishedAt: T0,
      closedAt: T0, closeReason: 'order.created',
    },
  });
  listingId = listing.id;

  const order = await db.order.create({
    data: {
      ref: `ORD-LS-${stamp}`, listingId: listing.id, buyerId, sellerId,
      source: 'DIRECT', stage, status: 'ACTIVE',
      agreedPrice: 90_000, commissionPct: 0, commissionAmount: 0,
      transferFee: 350, vatAmount: 52, totalAmount: 90_402,
      createdAt: T0, stageEnteredAt: T0,
    },
  });
  orderId = order.id;
  orderRef = order.ref;
}

async function teardown(): Promise<void> {
  await db.taxInvoiceLine.deleteMany({ where: { invoice: { orderId } } });
  await db.taxInvoice.deleteMany({ where: { orderId } });
  await db.settlementStatement.deleteMany({ where: { orderId } });
  await db.vehicleSaleAgreement.deleteMany({ where: { orderId } });
  await db.ledgerEntry.deleteMany({ where: { orderId } });
  await db.orderEvent.deleteMany({ where: { orderId } });
  await db.escrow.deleteMany({ where: { orderId } });
  await db.payment.deleteMany({ where: { orderId } });
  await db.order.deleteMany({ where: { id: orderId } });
  await db.listing.deleteMany({ where: { id: listingId } });
  await db.vehicle.deleteMany({ where: { id: vehicleId } });
  await db.user.deleteMany({ where: { id: { in: [buyerId, sellerId] } } });
}

afterAll(async () => {
  await db.$disconnect();
});

beforeEach(async () => {
  await scaffold();
});

describe('listing.sold — الإعلان يتبع الطلب', () => {
  it('تأكيد نقل الملكية يجعل الإعلان مباعًا', async () => {
    const done = await advanceStage({ orderRef, actorId: buyerId, to: 'DONE' }, T0);
    expect(done.ok).toBe(true);

    const listing = await db.listing.findUniqueOrThrow({ where: { id: listingId } });
    expect(listing.status).toBe('SOLD');
    expect(listing.closeReason).toBe('order.completed');
    expect(listing.closedAt).not.toBeNull();

    await teardown();
  });

  /**
   * الصفة التي جعلت العطل غير مرئيّ: اللوحة تعدّ `SOLD` فتجد صفرًا،
   * ولا شيء يقول إن العدّ خاطئ — الصفر عددٌ مشروع.
   */
  it('العدّ بحالة SOLD يجد الإعلان بعد الاكتمال', async () => {
    const before = await db.listing.count({ where: { status: 'SOLD', id: listingId } });
    expect(before).toBe(0);

    await advanceStage({ orderRef, actorId: sellerId, to: 'DONE' }, T0);

    const after = await db.listing.count({ where: { status: 'SOLD', id: listingId } });
    expect(after).toBe(1);

    await teardown();
  });

  it('الانتقال إلى مرحلةٍ غير الأخيرة لا يمسّ الإعلان', async () => {
    await teardown();
    await scaffold('PAYMENT');

    const moved = await advanceStage({ orderRef, actorId: buyerId, to: 'TRANSFER' }, T0);
    expect(moved.ok).toBe(true);

    const listing = await db.listing.findUniqueOrThrow({ where: { id: listingId } });
    expect(listing.status).toBe('RESERVED');

    await teardown();
  });
});

describe('listing-state — المدخل الوحيد', () => {
  /**
   * الحجز كان يُكتب في ثلاثة مواضع، اثنان منها **بلا** `closedAt` ولا
   * `closeReason`. فصفٌّ محجوزٌ يُعرف سببه وآخر لا — والفرق أثرُ نسخٍ
   * لم يكتمل لا قرارٌ.
   */
  it('الحجز يكتب الوقت والسبب دائمًا', async () => {
    await republishListing(db, listingId);
    await reserveListing(db, listingId, 'auction.won', T0);

    const listing = await db.listing.findUniqueOrThrow({ where: { id: listingId } });
    expect(listing.status).toBe('RESERVED');
    expect(listing.closeReason).toBe('auction.won');
    expect(listing.closedAt?.toISOString()).toBe(T0.toISOString());

    await teardown();
  });

  it('العودة إلى السوق تمحو أثر الإغلاق', async () => {
    await republishListing(db, listingId);

    const listing = await db.listing.findUniqueOrThrow({ where: { id: listingId } });
    expect(listing.status).toBe('PUBLISHED');
    expect(listing.closedAt).toBeNull();
    expect(listing.closeReason).toBeNull();

    await teardown();
  });

  it('السحب بعد ردٍّ كامل يُخرجه من السوق ولا يعيده', async () => {
    await suspendListing(db, listingId, 'dispute.refunded', T0);

    const listing = await db.listing.findUniqueOrThrow({ where: { id: listingId } });
    expect(listing.status).toBe('SUSPENDED');
    expect(listing.closeReason).toBe('dispute.refunded');

    await teardown();
  });

  it('الإحالة إلى المراجعة تصيب المنشور وحده', async () => {
    // محجوز — فالإحالة لا تسحبه من تحت طلبٍ قائم
    const { sendListingToReview } = await import('@/lib/domain/listing-state');
    expect(await sendListingToReview(db, listingId, 'USER_REPORT')).toBe(false);

    await republishListing(db, listingId);
    expect(await sendListingToReview(db, listingId, 'USER_REPORT')).toBe(true);

    const listing = await db.listing.findUniqueOrThrow({ where: { id: listingId } });
    expect(listing.status).toBe('PENDING_REVIEW');

    await teardown();
  });
});

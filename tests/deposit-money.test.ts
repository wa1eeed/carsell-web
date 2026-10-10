import { afterEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { forfeitDeposit, holdDeposit, settleDeposits } from '@/lib/domain/auctions';

/**
 * ═══ العربون مالٌ لا وسم ═══
 *
 * كان `holdDeposit` يكتب صفًّا بـ`HELD` ولا يمرّ ببوابة — فالمزايدة
 * ليست التزامًا، و`forfeitDeposit` تصادر رقمًا في جدولنا.
 * وقرار المالك: **الحجز ببطاقة، والمُصادَر للمنصّة**.
 */

const made: { auctions: string[]; users: string[]; listings: string[]; vehicles: string[] } = {
  auctions: [], users: [], listings: [], vehicles: [],
};

async function scaffold(): Promise<{ auctionId: string; ref: string; bidderId: string }> {
  const admin = await db.adminUser.findFirst({ select: { id: true } });
  await db.paymentRoute.updateMany({
    where: { purpose: 'AUCTION_DEPOSIT' },
    data: {
      gatewayKey: 'sandbox', environment: 'TEST', enabled: true,
      ...(admin === null ? {} : { updatedBy: admin.id }),
    },
  });

  const stamp = `${String(Date.now()).slice(-9)}${String(made.auctions.length)}`;
  const [seller, bidder] = await Promise.all([
    db.user.create({ data: { phone: `+9665401${stamp}` } }),
    db.user.create({ data: { phone: `+9665402${stamp}` } }),
  ]);
  made.users.push(seller.id, bidder.id);

  const model = await db.model.findFirstOrThrow({ include: { brand: true } });
  const vehicle = await db.vehicle.create({
    data: {
      ownerId: seller.id, brandId: model.brandId, modelId: model.id,
      brandName: model.brand.nameAr, modelName: model.nameAr, year: 2023,
      bodyType: 'SEDAN', transmission: 'AUTOMATIC', fuel: 'PETROL', drivetrain: 'FWD',
      seats: 5, mileageKm: 30_000, colorExterior: 'أبيض', spec: 'SAUDI',
      condition: 'USED', city: 'الرياض', entryMode: 'MANUAL',
    },
  });
  made.vehicles.push(vehicle.id);

  const listing = await db.listing.create({
    data: {
      ref: `DEP${stamp}`, vehicleId: vehicle.id, sellerId: seller.id, type: 'AUCTION',
      status: 'PUBLISHED', askPrice: 80_000, city: 'الرياض', publishedAt: new Date(),
    },
  });
  made.listings.push(listing.id);

  const now = Date.now();
  const auction = await db.auction.create({
    data: {
      listingId: listing.id, status: 'LIVE',
      startsAt: new Date(now - 3_600_000), endsAt: new Date(now + 3_600_000),
      startPrice: 50_000, bidIncrement: 500, depositAmount: 5_000,
    },
  });
  made.auctions.push(auction.id);

  return { auctionId: auction.id, ref: listing.ref, bidderId: bidder.id };
}

afterEach(async () => {
  const rows = await db.deposit.findMany({
    where: { auctionId: { in: made.auctions } },
    select: { paymentId: true },
  });
  const payments = rows.map((r) => r.paymentId).filter((id): id is string => id !== null);
  await db.ledgerEntry.deleteMany({ where: { note: 'deposit.forfeited' } });
  await db.deposit.deleteMany({ where: { auctionId: { in: made.auctions } } });
  if (payments.length > 0) await db.payment.deleteMany({ where: { id: { in: payments } } });
  await db.auction.deleteMany({ where: { id: { in: made.auctions } } });
  await db.listing.deleteMany({ where: { id: { in: made.listings } } });
  await db.vehicle.deleteMany({ where: { id: { in: made.vehicles } } });
  await db.user.deleteMany({ where: { id: { in: made.users } } });
  made.auctions = []; made.listings = []; made.vehicles = []; made.users = [];
});

describe('حجز العربون', () => {
  /** **ولا يُكتب الصفّ قبل أن يُحجز المال** — وإلّا صار ملتزمًا في دفترنا حرًّا عند بطاقته. */
  it('بلا بطاقة يُطلب وسيلة ولا يُكتب صفّ', async () => {
    const { auctionId, ref, bidderId } = await scaffold();

    const result = await holdDeposit({ auctionId, userId: bidderId, auctionRef: ref });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('METHOD_REQUIRED');
      expect(result.amount).toBe('5000');
    }

    expect(await db.deposit.count({ where: { auctionId } })).toBe(0);
  });

  it('ببطاقةٍ يُحجز المال ويُربط بالصفّ', async () => {
    const { auctionId, ref, bidderId } = await scaffold();

    const result = await holdDeposit({
      auctionId, userId: bidderId, auctionRef: ref,
      method: 'mada', returnUrl: 'http://localhost/return',
    });
    expect(result.ok).toBe(true);

    const deposit = await db.deposit.findFirstOrThrow({
      where: { auctionId },
      include: { payment: true },
    });
    expect(deposit.status).toBe('HELD');
    expect(deposit.payment).not.toBeNull();
    expect(deposit.payment?.status).toBe('HELD');
    expect(deposit.payment?.purpose).toBe('AUCTION_DEPOSIT');
    // دفعةٌ بلا طلب — و`orderId` اختياريّ منذ المخطّط الأوّل
    expect(deposit.payment?.orderId).toBeNull();
  });
});

describe('مصير العربون', () => {
  /** حبسُه بعد انتهاء المزاد ليس ضمانةً بل احتجازُ مالٍ بلا سبب. */
  it('حجز الخاسر يُلغى عند البوابة لا يُوسَم فقط', async () => {
    const { auctionId, ref, bidderId } = await scaffold();
    await holdDeposit({
      auctionId, userId: bidderId, auctionRef: ref,
      method: 'mada', returnUrl: 'http://localhost/return',
    });

    // لا فائز ⇒ الجميع خاسرون
    await settleDeposits(auctionId, null);

    const deposit = await db.deposit.findFirstOrThrow({
      where: { auctionId },
      include: { payment: true },
    });
    expect(deposit.status).toBe('RELEASED');
    expect(deposit.payment?.status).toBe('CANCELLED');
  });

  /**
   * **والمُصادَر للمنصّة** (قرار المالك): يُحصَّل الحجز ويُقيَّد
   * إيرادًا. وبلا قيدٍ يدخل مالٌ حسابَنا ولا يظهر في دفترنا.
   */
  it('المصادرة تُحصّل وتُقيّد إيرادًا للمنصّة', async () => {
    const { auctionId, ref, bidderId } = await scaffold();
    await holdDeposit({
      auctionId, userId: bidderId, auctionRef: ref,
      method: 'mada', returnUrl: 'http://localhost/return',
    });

    const before = await db.ledgerEntry.count({ where: { note: 'deposit.forfeited' } });
    const result = await forfeitDeposit({ auctionId, userId: bidderId });
    expect(result.ok).toBe(true);

    const deposit = await db.deposit.findFirstOrThrow({
      where: { auctionId },
      include: { payment: true },
    });
    expect(deposit.status).toBe('FORFEITED');
    expect(deposit.payment?.status).toBe('SETTLED');
    expect(Number(deposit.payment?.settledAmount)).toBe(5_000);

    // قيدان متوازنان: نقدٌ مدين، وإيرادٌ دائن
    const after = await db.ledgerEntry.findMany({ where: { note: 'deposit.forfeited' } });
    expect(after.length - before).toBe(2);
    const cash = after.find((row) => row.account === 'PLATFORM_CASH');
    const revenue = after.find((row) => row.account === 'PLATFORM_REVENUE');
    expect(Number(cash?.amount)).toBe(5_000);
    expect(Number(revenue?.amount)).toBe(5_000);
    expect(cash?.direction).toBe('DEBIT');
    expect(revenue?.direction).toBe('CREDIT');
  });
});

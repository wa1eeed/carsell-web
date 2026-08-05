import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import {
  EXTEND_BY_SECONDS,
  EXTEND_WINDOW_SECONDS,
  MAX_EXTENSIONS,
  buyNowAvailable,
  SELLER_DECISION_HOURS,
  closeEndedAuctions,
  expireSellerDecisions,
  forfeitDeposit,
  getAuction,
  holdDeposit,
  isReserveMet,
  minimumBid,
  placeBid,
  resolveSellerDecision,
  settleDeposits,
} from '@/lib/domain/auctions';
import { createAuctionOrderStandalone } from '@/lib/domain/auction-order';
import { Prisma } from '@/generated/prisma/client';

const T0 = new Date('2026-06-01T10:00:00Z');
const at = (seconds: number): Date => new Date(T0.getTime() + seconds * 1000);

let sellerId: string;
let bidderA: string;
let bidderB: string;
let auctionId: string;
let listingId: string;
let listingRef: string;
let vehicleId: string;

const START = 50_000;
const INCREMENT = 1_000;
const RESERVE = 60_000;
const BUY_NOW = 80_000;

async function scaffold(): Promise<void> {
  const stamp = String(Date.now()).slice(-9);

  const [seller, a, b] = await Promise.all([
    db.user.create({ data: { phone: `+9665201${stamp}` } }),
    db.user.create({ data: { phone: `+9665202${stamp}` } }),
    db.user.create({ data: { phone: `+9665203${stamp}` } }),
  ]);
  sellerId = seller.id;
  bidderA = a.id;
  bidderB = b.id;

  const model = await db.model.findFirstOrThrow({ include: { brand: true } });
  const vehicle = await db.vehicle.create({
    data: {
      ownerId: sellerId, brandId: model.brandId, modelId: model.id,
      brandName: model.brand.nameAr, modelName: model.nameAr, year: 2023,
      bodyType: 'SUV', transmission: 'AUTOMATIC', fuel: 'PETROL', drivetrain: 'AWD',
      seats: 7, mileageKm: 50_000, colorExterior: 'أسود', spec: 'SAUDI',
      condition: 'USED', city: 'جدة', entryMode: 'MANUAL',
    },
  });
  vehicleId = vehicle.id;

  const listing = await db.listing.create({
    data: {
      ref: `AUC${stamp}`, vehicleId: vehicle.id, sellerId, type: 'AUCTION',
      status: 'PUBLISHED', askPrice: START, city: 'جدة', publishedAt: T0,
    },
  });
  listingId = listing.id;
  listingRef = listing.ref;

  const auction = await db.auction.create({
    data: {
      listingId: listing.id,
      startPrice: START,
      reservePrice: new Prisma.Decimal(RESERVE),
      bidIncrement: INCREMENT,
      buyNowPrice: BUY_NOW,
      depositAmount: 5_000,
      startsAt: T0,
      endsAt: at(3600),
      status: 'LIVE',
    },
  });
  auctionId = auction.id;

  await holdDeposit({ auctionId, userId: bidderA });
  await holdDeposit({ auctionId, userId: bidderB });
}

async function teardown(): Promise<void> {
  /**
   * **أثرٌ جديد على كيانٍ مشترك يُضاف إلى الاستعادة المشتركة.**
   * صار إغلاق المزاد يُنشئ طلبًا للفائز، فبقي الطلب يمنع حذف إعلانه
   * بقيدٍ مرجعيّ — والاستعادة تُتبَع فيها الآثار مرّة لا في كل اختبار.
   */
  const orders = await db.order.findMany({ where: { listingId }, select: { id: true } });
  const orderIds = orders.map((row) => row.id);
  if (orderIds.length > 0) {
    await db.ledgerEntry.deleteMany({ where: { orderId: { in: orderIds } } });
    await db.orderEvent.deleteMany({ where: { orderId: { in: orderIds } } });
    await db.escrow.deleteMany({ where: { orderId: { in: orderIds } } });
    await db.order.deleteMany({ where: { id: { in: orderIds } } });
  }

  await db.bid.deleteMany({ where: { auctionId } });
  await db.deposit.deleteMany({ where: { auctionId } });
  await db.auction.deleteMany({ where: { id: auctionId } });
  await db.listing.deleteMany({ where: { id: listingId } });
  await db.vehicle.deleteMany({ where: { id: vehicleId } });
  await db.user.deleteMany({ where: { id: { in: [sellerId, bidderA, bidderB] } } });
}

/**
 * **الاختبار يعيد ما غيّره — وينظّف ما صنعه.**
 *
 * كان يخلّف مزادًا ومركبةً وثلاثة مستخدمين في كل تشغيل، فظهرت أربعة
 * مزادات وهمية «مباشرة الآن» بعدّاد `00:00:00` في الموقع الحيّ. ونظافة
 * `global-setup` تكنسها في **بداية** التشغيل التالي — فتبقى معروضة بين
 * التشغيلين، وهي مدّةٌ يُفتح فيها الموقع ويُعرض.
 */
afterAll(async () => {
  await cleanupScaffold();
  await db.$disconnect();
});

async function cleanupScaffold(): Promise<void> {
  const listings = await db.listing.findMany({
    where: { ref: { startsWith: 'AUC' } },
    select: { id: true, vehicleId: true },
  });
  const ids = listings.map((row) => row.id);
  if (ids.length === 0) return;

  const auctions = await db.auction.findMany({
    where: { listingId: { in: ids } },
    select: { id: true },
  });
  const auctionIds = auctions.map((row) => row.id);

  await db.bid.deleteMany({ where: { auctionId: { in: auctionIds } } });
  await db.deposit.deleteMany({ where: { auctionId: { in: auctionIds } } });
  await db.auction.deleteMany({ where: { id: { in: auctionIds } } });
  await db.offer.deleteMany({ where: { listingId: { in: ids } } });
  await db.listingImage.deleteMany({ where: { listingId: { in: ids } } });
  await db.listing.deleteMany({ where: { id: { in: ids } } });
  await db.vehicle.deleteMany({ where: { id: { in: listings.map((r) => r.vehicleId) } } });
  /**
   * والمستخدمون **بشرط ألّا يملكوا شيئًا**: حذفٌ بالبادئة وحدها يصطدم
   * بقيدٍ أجنبيّ من مركبةٍ يتيمة خلّفها تشغيلٌ أقدم — والاصطدام يُسقط
   * التنظيف كلّه فلا يُحذف حتى ما كان يمكن حذفه.
   */
  const candidates = await db.user.findMany({
    where: { phone: { startsWith: '+96652' } },
    select: {
      id: true,
      _count: {
        select: { vehicles: true, listings: true, ordersAsBuyer: true, ordersAsSeller: true },
      },
    },
  });
  const removable = candidates
    .filter(
      (u) =>
        u._count.vehicles === 0 &&
        u._count.listings === 0 &&
        u._count.ordersAsBuyer === 0 &&
        u._count.ordersAsSeller === 0,
    )
    .map((u) => u.id);
  if (removable.length > 0) await db.user.deleteMany({ where: { id: { in: removable } } });
}

beforeEach(async () => {
  await scaffold();
});

describe('bid.increment — القاعدة ٦', () => {
  it('أوّل مزايدة = الافتتاح بلا خطوة', () => {
    expect(minimumBid(START, null, INCREMENT)).toBe(START);
  });

  it('وما بعدها = أعلى + خطوة', () => {
    expect(minimumBid(START, 52_000, INCREMENT)).toBe(53_000);
  });

  it('دون الحدّ تُرفض، وعنده تُقبل', async () => {
    const low = await placeBid({ auctionId, bidderId: bidderA, amount: START - 1 }, at(10));
    expect(low.ok).toBe(false);
    if (!low.ok) expect(low.minimumNext).toBe(String(START));

    const ok = await placeBid({ auctionId, bidderId: bidderA, amount: START }, at(20));
    expect(ok.ok).toBe(true);

    const below = await placeBid({ auctionId, bidderId: bidderB, amount: START + 500 }, at(30));
    expect(below.ok).toBe(false);

    const above = await placeBid({ auctionId, bidderId: bidderB, amount: START + INCREMENT }, at(40));
    expect(above.ok).toBe(true);
    await teardown();
  });

  it('البائع لا يزايد على مركبته', async () => {
    await holdDeposit({ auctionId, userId: sellerId });
    const own = await placeBid({ auctionId, bidderId: sellerId, amount: 99_000 }, at(10));
    expect(own.ok).toBe(false);
    if (!own.ok) expect(own.reason).toBe('OWN_AUCTION');
    await teardown();
  });

  /** مزايدٌ بلا عربون مزايدٌ بلا كلفة انسحاب — وهو ما يُفرغ المزاد. */
  it('لا مزايدة بلا عربون', async () => {
    const stranger = await db.user.create({ data: { phone: `+96658${String(Date.now()).slice(-7)}` } });
    const bid = await placeBid({ auctionId, bidderId: stranger.id, amount: START }, at(10));
    expect(bid.ok).toBe(false);
    if (!bid.ok) expect(bid.reason).toBe('NO_DEPOSIT');
    await db.user.delete({ where: { id: stranger.id } });
    await teardown();
  });
});

describe('auction.extend — القاعدة ٧', () => {
  it('مزايدة خارج النافذة لا تمدّد', async () => {
    const bid = await placeBid({ auctionId, bidderId: bidderA, amount: START }, at(100));
    expect(bid.ok && bid.extended).toBe(false);
    expect(bid.ok && bid.endsAt.getTime()).toBe(at(3600).getTime());
    await teardown();
  });

  it('مزايدة داخل آخر دقيقة تمدّد خمس دقائق من لحظتها', async () => {
    const moment = 3600 - EXTEND_WINDOW_SECONDS + 10;
    const bid = await placeBid({ auctionId, bidderId: bidderA, amount: START }, at(moment));

    expect(bid.ok && bid.extended).toBe(true);
    expect(bid.ok && bid.endsAt.getTime()).toBe(at(moment + EXTEND_BY_SECONDS).getTime());
    await teardown();
  });

  /**
   * بلا حدٍّ يمدّ مزايدان المزاد بلا نهاية بمزايدة كل دقيقة، فيصير
   * الانتظار سلاحًا. وبالحدّ ينتهي في وقت يعرفه الجميع.
   */
  it('التمديد يتوقّف عند الحدّ الأقصى المعلن', async () => {
    await db.auction.update({
      where: { id: auctionId },
      data: { extendedCount: MAX_EXTENSIONS, endsAt: at(3600) },
    });

    const bid = await placeBid({ auctionId, bidderId: bidderA, amount: START }, at(3600 - 10));
    expect(bid.ok && bid.extended).toBe(false);
    expect(bid.ok && bid.endsAt.getTime()).toBe(at(3600).getTime());
    await teardown();
  });

  it('الحدّ الأقصى معلن في الكائن العام', async () => {
    const auction = await getAuction(listingRef);
    expect(auction?.maxExtensions).toBe(MAX_EXTENSIONS);
    await teardown();
  });
});

describe('auction.reserveHidden — القاعدة ٨', () => {
  it('الاحتياطي لا يظهر ولا أي قيمة تساويه', async () => {
    await placeBid({ auctionId, bidderId: bidderA, amount: START }, at(10));
    const auction = await getAuction(listingRef);

    const json = JSON.stringify(auction);
    expect(json).not.toContain('reservePrice');
    expect(json).not.toContain(String(RESERVE));
    expect(auction?.reserveMet).toBe(false);
    await teardown();
  });

  it('الراية تصدق في الحالتين', () => {
    const reserve = new Prisma.Decimal(RESERVE);
    expect(isReserveMet(reserve, null)).toBe(false);
    expect(isReserveMet(reserve, RESERVE - 1)).toBe(false);
    expect(isReserveMet(reserve, RESERVE)).toBe(true);
    // بلا احتياطي فالبيع حتميّ
    expect(isReserveMet(null, null)).toBe(true);
  });

  /**
   * ═══ قرار ٦ ═══ الترقيم **عشوائي لكل مزاد**: ترتيب أوّل ظهور يكشف
   * من كان حاضرًا مبكّرًا، والرقم الثابت يُتعقَّب بين مزادين.
   */
  it('هوية المزايد لا تخرج — أرقام ثابتة داخل المزاد لا بترتيب الوصول', async () => {
    await placeBid({ auctionId, bidderId: bidderA, amount: START }, at(10));
    await placeBid({ auctionId, bidderId: bidderB, amount: START + INCREMENT }, at(20));
    await placeBid({ auctionId, bidderId: bidderA, amount: START + 2 * INCREMENT }, at(30));

    const auction = await getAuction(listingRef);
    const json = JSON.stringify(auction);
    expect(json).not.toContain(bidderA);
    expect(json).not.toContain(bidderB);

    // نفس المزايد نفس الاسم داخل المزاد الواحد
    const aliases = auction!.bids.map((bid) => bid.alias);
    expect(new Set(aliases).size).toBe(2);
    expect(aliases[0]).toBe(aliases[2]);
    await teardown();
  });
});

describe('deposit.lifecycle — القاعدة ٩', () => {
  it('يُرد لغير الفائزين ويُخصم للفائز', async () => {
    await placeBid({ auctionId, bidderId: bidderA, amount: START }, at(10));
    await placeBid({ auctionId, bidderId: bidderB, amount: 61_000 }, at(20));

    const settled = await settleDeposits(auctionId, bidderB, at(3700));
    expect(settled.refunded).toBe(1);
    expect(settled.applied).toBe(1);

    const loser = await db.deposit.findFirstOrThrow({ where: { auctionId, userId: bidderA } });
    const winner = await db.deposit.findFirstOrThrow({ where: { auctionId, userId: bidderB } });
    expect(loser.status).toBe('RELEASED');
    expect(winner.status).toBe('APPLIED');
    await teardown();
  });

  it('يُصادَر عند الانسحاب', async () => {
    await placeBid({ auctionId, bidderId: bidderA, amount: 61_000 }, at(10));
    await settleDeposits(auctionId, bidderA, at(3700));

    expect((await forfeitDeposit({ auctionId, userId: bidderA }, at(4000))).ok).toBe(true);
    const deposit = await db.deposit.findFirstOrThrow({ where: { auctionId, userId: bidderA } });
    expect(deposit.status).toBe('FORFEITED');
    await teardown();
  });

  it('عربون واحد لكل مزايد', async () => {
    const again = await holdDeposit({ auctionId, userId: bidderA });
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.reason).toBe('ALREADY_HELD');
    await teardown();
  });

  /** حبس العربون بعد الانتهاء ليس ضمانة بل احتجاز مال بلا سبب. */
  it('إغلاق المزاد يسوّي العرابين في نفس اللحظة', async () => {
    await placeBid({ auctionId, bidderId: bidderA, amount: 61_000 }, at(10));
    await db.auction.update({ where: { id: auctionId }, data: { endsAt: at(100) } });

    expect(await closeEndedAuctions(at(200))).toBe(1);

    const auction = await db.auction.findUniqueOrThrow({ where: { id: auctionId } });
    expect(auction.status).toBe('ENDED_MET');

    const deposits = await db.deposit.findMany({ where: { auctionId } });
    expect(deposits.every((deposit) => deposit.status !== 'HELD')).toBe(true);
    await teardown();
  });

  /**
   * ═══ قرار ٤ ═══ احتياطي غير مبلوغ ⇒ **عربون الأعلى يبقى محجوزًا**
   * أربعًا وعشرين ساعة — مهلة البائع للقبول. وردُّه فورًا يُطلقه من
   * التزامه قبل أن يقرّر البائع، فيصير القبول بلا مقابل.
   */
  it('لم يبلغ الاحتياطي ⇒ الأعلى محجوز والباقون يُرَدّون', async () => {
    await placeBid({ auctionId, bidderId: bidderA, amount: START }, at(10));
    await placeBid({ auctionId, bidderId: bidderB, amount: START + INCREMENT }, at(20));
    await db.auction.update({ where: { id: auctionId }, data: { endsAt: at(100) } });

    await closeEndedAuctions(at(200));

    const auction = await db.auction.findUniqueOrThrow({ where: { id: auctionId } });
    expect(auction.status).toBe('ENDED_UNMET');
    expect(auction.sellerDecisionDueAt?.getTime()).toBe(
      at(200 + SELLER_DECISION_HOURS * 3600).getTime(),
    );

    const top = await db.deposit.findFirstOrThrow({ where: { auctionId, userId: bidderB } });
    const other = await db.deposit.findFirstOrThrow({ where: { auctionId, userId: bidderA } });
    expect(top.status).toBe('HELD');
    expect(other.status).toBe('RELEASED');
    await teardown();
  });

  it('قبول البائع يخصم عربون الأعلى', async () => {
    await placeBid({ auctionId, bidderId: bidderA, amount: START }, at(10));
    await db.auction.update({ where: { id: auctionId }, data: { endsAt: at(100) } });
    await closeEndedAuctions(at(200));

    expect((await resolveSellerDecision(auctionId, true, at(300))).ok).toBe(true);
    const deposit = await db.deposit.findFirstOrThrow({ where: { auctionId, userId: bidderA } });
    expect(deposit.status).toBe('APPLIED');
    expect((await db.auction.findUniqueOrThrow({ where: { id: auctionId } })).status).toBe('ENDED_MET');
    await teardown();
  });

  /** انقضاء المهلة **ردٌّ لا مصادرة**: المزايد أوفى، والذي لم يقرّر البائع. */
  it('انقضاء مهلة البائع يَرُدّ العربون ولا يصادره', async () => {
    await placeBid({ auctionId, bidderId: bidderA, amount: START }, at(10));
    await db.auction.update({ where: { id: auctionId }, data: { endsAt: at(100) } });
    await closeEndedAuctions(at(200));

    const late = at(200 + (SELLER_DECISION_HOURS + 1) * 3600);
    expect(await expireSellerDecisions(late)).toBe(1);

    const deposit = await db.deposit.findFirstOrThrow({ where: { auctionId, userId: bidderA } });
    expect(deposit.status).toBe('RELEASED');
    await teardown();
  });
});

describe('auction.buyNowGate — القاعدة ١٠', () => {
  it('يظهر قبل بلوغ الاحتياطي ويختفي بعده', async () => {
    expect(buyNowAvailable(BUY_NOW, false)).toBe(true);
    expect(buyNowAvailable(BUY_NOW, true)).toBe(false);
    expect(buyNowAvailable(null, false)).toBe(false);
  });

  it('يختفي من الكائن العام لا يُعرض معطّلًا', async () => {
    await placeBid({ auctionId, bidderId: bidderA, amount: START }, at(10));
    expect((await getAuction(listingRef))?.buyNowPrice).toBe(String(BUY_NOW));

    await placeBid({ auctionId, bidderId: bidderB, amount: RESERVE }, at(20));
    const after = await getAuction(listingRef);
    expect(after?.reserveMet).toBe(true);
    expect(after?.buyNowPrice).toBeNull();
    await teardown();
  });
});

describe('الرسوّ يُنشئ طلبًا — الحلقة التي لم تكن', () => {
  /**
   * **`OrderSource.AUCTION` معرَّفٌ منذ اليوم الأول ولا شيء يُنشئ به.**
   * فالمزاد يُغلق وتُسوّى عرابينه ويُعلَن فائز ثم لا شيء: لا طلب ولا
   * دفع ولا نقل ملكية — يربح المزايد ولا يستلم.
   */
  it('بلوغ الاحتياطي ⇒ طلبٌ للفائز، والإعلان يُحجز', async () => {
    // مزايدةٌ تبلغ الاحتياطي، ثم إغلاقٌ بعد انقضاء الوقت
    await holdDeposit({ auctionId, userId: bidderA });
    const bid = await placeBid({ auctionId, bidderId: bidderA, amount: RESERVE }, at(60));
    expect(bid.ok).toBe(true);

    expect(await closeEndedAuctions(at(100_000))).toBeGreaterThan(0);

    const order = await db.order.findFirst({ where: { listingId, source: 'AUCTION' } });
    expect(order).not.toBeNull();
    expect(order?.buyerId).toBe(bidderA);
    expect(order?.stage).toBe('PAYMENT');
    // والمهلة مخزَّنة — فالمشتري يرى متى يسقط طلبه
    expect(order?.paymentDueAt).not.toBeNull();

    const listing = await db.listing.findUniqueOrThrow({ where: { id: listingId } });
    expect(listing.status).toBe('RESERVED');

    await teardown();
  });

  /** **ولا طلبان.** إغلاقٌ يتكرّر (وظيفة دورية) لا يبيع المركبة مرّتين. */
  it('وإغلاقٌ ثانٍ لا يُنشئ طلبًا ثانيًا', async () => {
    await holdDeposit({ auctionId, userId: bidderA });
    await placeBid({ auctionId, bidderId: bidderA, amount: RESERVE }, at(60));
    await closeEndedAuctions(at(100_000));

    const again = await createAuctionOrderStandalone(auctionId, at(100_100));
    expect(again).toEqual({ ok: false, reason: 'ORDER_EXISTS' });
    expect(await db.order.count({ where: { listingId, source: 'AUCTION' } })).toBe(1);

    await teardown();
  });
});

/**
 * ═══ `LIVE` كانت حالةً لا يكتبها أحد ═══
 *
 * يُغلق المزاد بـ`closeEndedAuctions` **ولا شيء يفتحه**: يبقى
 * `SCHEDULED` حتى ينقضي وقتُه كلُّه ثم يُغلق بلا أن يقبل مزايدةً واحدة.
 * فلم يكن في المنتج كلّه مزادٌ يُزايَد عليه.
 */
describe('فتح المزادات التي حان وقتها', () => {
  it('يفتح ما بدأ ولم ينتهِ، ولا يمسّ غيره', async () => {
    const { openScheduledAuctions } = await import('@/lib/domain/auctions');
    const now = new Date('2026-08-05T12:00:00.000Z');

    const listing = await db.listing.findFirstOrThrow({
      where: { auction: { is: null } },
      select: { id: true },
    });

    const base = {
      listingId: listing.id,
      startPrice: 50_000,
      bidIncrement: 500,
      depositAmount: 5_000,
    };

    // بدأ ولم ينتهِ ⇒ يُفتح
    const due = await db.auction.create({
      data: {
        ...base,
        status: 'SCHEDULED',
        startsAt: new Date(now.getTime() - 3_600_000),
        endsAt: new Date(now.getTime() + 3_600_000),
      },
    });

    const opened = await openScheduledAuctions(now);
    expect(opened).toBeGreaterThanOrEqual(1);
    expect((await db.auction.findUniqueOrThrow({ where: { id: due.id } })).status).toBe('LIVE');

    await db.auction.delete({ where: { id: due.id } });

    // **ولا يُفتح ما انقضى وقتُه** — وإلّا فُتح مزادٌ ميّت ثم أُغلق فورًا
    const stale = await db.auction.create({
      data: {
        ...base,
        status: 'SCHEDULED',
        startsAt: new Date(now.getTime() - 7_200_000),
        endsAt: new Date(now.getTime() - 3_600_000),
      },
    });

    await openScheduledAuctions(now);
    expect((await db.auction.findUniqueOrThrow({ where: { id: stale.id } })).status).toBe(
      'SCHEDULED',
    );

    await db.auction.delete({ where: { id: stale.id } });
  });
});


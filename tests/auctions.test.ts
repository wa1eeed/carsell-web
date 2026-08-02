import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import {
  EXTEND_BY_SECONDS,
  EXTEND_WINDOW_SECONDS,
  MAX_EXTENSIONS,
  buyNowAvailable,
  closeEndedAuctions,
  forfeitDeposit,
  getAuction,
  holdDeposit,
  isReserveMet,
  minimumBid,
  placeBid,
  settleDeposits,
} from '@/lib/domain/auctions';
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
  await db.bid.deleteMany({ where: { auctionId } });
  await db.deposit.deleteMany({ where: { auctionId } });
  await db.auction.deleteMany({ where: { id: auctionId } });
  await db.listing.deleteMany({ where: { id: listingId } });
  await db.vehicle.deleteMany({ where: { id: vehicleId } });
  await db.user.deleteMany({ where: { id: { in: [sellerId, bidderA, bidderB] } } });
}

afterAll(async () => {
  await db.$disconnect();
});

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

  it('هوية المزايد لا تخرج — أسماء مستعارة ثابتة داخل المزاد', async () => {
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

  it('لم يبلغ الاحتياطي ⇒ ENDED_UNMET وكل العرابين تُرد', async () => {
    await placeBid({ auctionId, bidderId: bidderA, amount: START }, at(10));
    await db.auction.update({ where: { id: auctionId }, data: { endsAt: at(100) } });

    await closeEndedAuctions(at(200));

    expect((await db.auction.findUniqueOrThrow({ where: { id: auctionId } })).status).toBe('ENDED_UNMET');
    const deposits = await db.deposit.findMany({ where: { auctionId } });
    expect(deposits.every((deposit) => deposit.status === 'RELEASED')).toBe(true);
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

import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { Prisma } from '@/generated/prisma/client';
import { db } from '@/lib/db';
import { placeBid, getAuction } from '@/lib/domain/auctions';

/**
 * ═══ القاعدة ١١ — النيابةُ عن المزايد حتى سقفه ═══
 *
 * قرار المالك ٢٠٢٦-١١-٢٥. والترميزُ يرسم الزرّ منذ رُسم، و`isAuto`
 * في المخطّط تقرؤها ثلاثُ شاشات — **ولا منادٍ كان يمرّرها `true`**.
 *
 * **والحالاتُ تُصنَع لا تُنتظَر**: تصادمُ سقفين وتساويهما لا يقعان في
 * بيانات البذرة، وهما بيتُ القصيد — فيُزرعان.
 */

const stamp = String(Date.now()).slice(-9);
const made: { listings: string[]; vehicles: string[]; auctions: string[] } = {
  listings: [], vehicles: [], auctions: [],
};

async function cleanup(): Promise<void> {
  if (made.auctions.length > 0) {
    await db.bid.deleteMany({ where: { auctionId: { in: made.auctions } } });
    await db.cancelledBid.deleteMany({ where: { auctionId: { in: made.auctions } } });
    await db.auctionEvent.deleteMany({ where: { auctionId: { in: made.auctions } } });
    await db.deposit.deleteMany({ where: { auctionId: { in: made.auctions } } });
    await db.notification.deleteMany({ where: { entityType: 'Auction', entityId: { in: made.auctions } } });
    await db.auction.deleteMany({ where: { id: { in: made.auctions } } });
  }
  if (made.listings.length > 0) await db.listing.deleteMany({ where: { id: { in: made.listings } } });
  if (made.vehicles.length > 0) await db.vehicle.deleteMany({ where: { id: { in: made.vehicles } } });
  made.auctions = []; made.listings = []; made.vehicles = [];
}

afterEach(cleanup);
afterAll(async () => {
  await cleanup();
  await db.$disconnect();
});

const INCREMENT = 1_000;
const START = 50_000;

/** مزادٌ حيّ بعربونٍ محجوز لثلاثة مزايدين — فالعربون شرطٌ مسبق. */
async function fixture() {
  const seller = await db.user.findFirstOrThrow({ where: { listings: { some: {} } } });
  const source = await db.vehicle.findFirstOrThrow({ where: { ownerId: seller.id } });
  const rivals = await db.user.findMany({
    where: { id: { not: seller.id }, status: 'ACTIVE' },
    take: 3,
    orderBy: { id: 'asc' },
  });
  const now = new Date();

  const { id: _id, createdAt: _c, vin: _v, overriddenFields: _o, ...shape } = source;
  const vehicle = await db.vehicle.create({
    data: { ...shape, ownerId: seller.id, vin: `PXY${stamp}${String(made.vehicles.length)}XXXX` },
  });
  made.vehicles.push(vehicle.id);

  const listing = await db.listing.create({
    data: {
      ref: `PXY${stamp}${String(made.listings.length)}`,
      sellerId: seller.id, vehicleId: vehicle.id, type: 'AUCTION',
      status: 'PUBLISHED', askPrice: new Prisma.Decimal(120_000),
      city: source.city, publishedAt: now,
    },
  });
  made.listings.push(listing.id);

  const auction = await db.auction.create({
    data: {
      listingId: listing.id,
      startPrice: new Prisma.Decimal(START),
      bidIncrement: new Prisma.Decimal(INCREMENT),
      depositAmount: new Prisma.Decimal(2_000),
      status: 'LIVE',
      startsAt: new Date(now.getTime() - 3_600_000),
      endsAt: new Date(now.getTime() + 24 * 3_600_000),
    },
  });
  made.auctions.push(auction.id);

  await db.deposit.createMany({
    data: rivals.map((r) => ({
      auctionId: auction.id, userId: r.id,
      amount: new Prisma.Decimal(2_000), status: 'HELD' as const,
    })),
  });

  return { auction, listing, a: rivals[0]!, b: rivals[1]!, c: rivals[2]! };
}

const top = async (auctionId: string): Promise<number> => {
  const row = await db.bid.aggregate({ where: { auctionId }, _max: { amount: true } });
  return Number(row._max.amount ?? 0);
};

describe('النيابة حتى سقف', () => {
  it('سقف دون المزايدة يرد بسببه', async () => {
    const { auction, a } = await fixture();
    const result = await placeBid({
      auctionId: auction.id, bidderId: a.id, amount: START, maxAmount: START - 1,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('CAP_BELOW_BID');
    expect(await db.bid.count({ where: { auctionId: auction.id } })).toBe(0);
  });

  it('بلا منافس لا ينوب أحد — والسقف يبقى محفوظا', async () => {
    const { auction, a } = await fixture();
    const result = await placeBid({
      auctionId: auction.id, bidderId: a.id, amount: START, maxAmount: START + 20_000,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.amount).toBe(String(START));
      expect(result.leading).toBe(true);
    }
    expect(await db.bid.count({ where: { auctionId: auction.id } })).toBe(1);
  });

  /**
   * **وبيتُ القصيد**: مزايدٌ يدويّ دون سقفِ خصمه يُتجاوَز في اللحظة
   * نفسها — وبالخطوة وحدها، لا بالسقف كلِّه. فلو ناب المحرّك بالسقف
   * لدفع الموكّل أقصى ما يملك على أوّل منافس.
   */
  it('سقف أعلى ينوب بخطوة واحدة لا بسقفه', async () => {
    const { auction, a, b } = await fixture();
    await placeBid({ auctionId: auction.id, bidderId: a.id, amount: START, maxAmount: 90_000 });

    const result = await placeBid({ auctionId: auction.id, bidderId: b.id, amount: START + INCREMENT });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.amount).toBe(String(START + INCREMENT * 2));
      expect(result.leading).toBe(false);
    }

    const auto = await db.bid.findFirstOrThrow({
      where: { auctionId: auction.id }, orderBy: { amount: 'desc' },
    });
    expect(auto.bidderId).toBe(a.id);
    expect(auto.isAuto).toBe(true);
    expect(Number(auto.amount)).toBe(START + INCREMENT * 2);
    // ولا يبلغ سقفه — وإلّا دفع أقصى ما يملك على أوّل منافس
    expect(Number(auto.amount)).toBeLessThan(90_000);
  });

  it('ولا يتجاوز السقف ولو كان المنافس فوقه بقليل', async () => {
    const { auction, a, b } = await fixture();
    await placeBid({ auctionId: auction.id, bidderId: a.id, amount: START, maxAmount: START + 1_500 });

    // مزايدةٌ تحت السقف بمئة — فالنيابةُ تقف عند السقف لا عند «مزايدة+خطوة»
    await placeBid({ auctionId: auction.id, bidderId: b.id, amount: START + 1_400 });
    expect(await top(auction.id)).toBe(START + 1_500);
  });

  /**
   * **ولا يُخفَض ما زايد به صاحبُه.** `min(سقفي، سقفُه+خطوة)` وحدَها
   * تُنتج مبلغًا دون المزايدة اليدوية متى جاوزت سقفَ المنافس بأكثر من
   * خطوة — فتُكتب مزايدةٌ آليةٌ أقلُّ من التي قبلها.
   */
  it('سقفي الأعلى يرفعني فوق سقفه بخطوة — ولا ينزل تحت ما أرسلت', async () => {
    const { auction, a, b } = await fixture();
    await placeBid({ auctionId: auction.id, bidderId: a.id, amount: START, maxAmount: START + 3_000 });

    const result = await placeBid({
      auctionId: auction.id, bidderId: b.id, amount: START + 10_000, maxAmount: START + 20_000,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Number(result.amount)).toBe(START + 10_000);
      expect(result.leading).toBe(true);
    }
    expect(await top(auction.id)).toBe(START + 10_000);
  });

  /**
   * **والفرعُ يُقاس بما يسلكه لا بما يجاوره.** أوّلُ صياغةٍ لاختبار
   * «سقفي الأعلى» أرسلت مزايدةً تقود أصلًا، فمرّت من فرع «لا رفع» —
   * **وكسرُ الحارس لم يُسقط شيئًا**. فيُرسَل مبلغٌ دون سقف المنافس
   * ليقع الرفعُ فعلًا.
   */
  it('وسقفي الأعلى يرفعني فوق سقفه بخطوة واحدة', async () => {
    const { auction, a, b } = await fixture();
    await placeBid({ auctionId: auction.id, bidderId: a.id, amount: START, maxAmount: START + 3_000 });

    const result = await placeBid({
      auctionId: auction.id, bidderId: b.id, amount: START + INCREMENT, maxAmount: START + 20_000,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Number(result.amount)).toBe(START + 4_000);
      expect(result.leading).toBe(true);
    }

    const winner = await db.bid.findFirstOrThrow({
      where: { auctionId: auction.id }, orderBy: { amount: 'desc' },
    });
    expect(winner.bidderId).toBe(b.id);
    expect(winner.isAuto).toBe(true);
    // خطوةٌ واحدة فوق سقف المنافس — لا سقفي أنا
    expect(Number(winner.amount)).toBe(START + 3_000 + INCREMENT);
  });

  it('وسقفان متساويان: الأسبق يفوز عند السقف', async () => {
    const { auction, a, b } = await fixture();
    await placeBid({ auctionId: auction.id, bidderId: a.id, amount: START, maxAmount: 70_000 });

    const result = await placeBid({
      auctionId: auction.id, bidderId: b.id, amount: START + INCREMENT, maxAmount: 70_000,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.leading).toBe(false);

    const winner = await db.bid.findFirstOrThrow({
      where: { auctionId: auction.id }, orderBy: { amount: 'desc' },
    });
    expect(winner.bidderId).toBe(a.id);
    expect(Number(winner.amount)).toBe(70_000);
  });

  /**
   * ═══ والسقف سرّيّ — قرار ٢٩ ═══
   *
   * لو ظهر لزايد خصمُه إلى ما دونه بريال، فصار سلاحًا على صاحبه.
   * ويُفحص **بالتسلسل كلِّه** لا بحقلٍ بعينه: ما لا يدخل الكائن لا
   * يتسرّب منه، وهو مسلكُ `reservePrice` نفسُه.
   */
  it('والسقف لا يظهر في الاستجابة العامة', async () => {
    const { auction, listing, a } = await fixture();
    const CAP = 987_654;
    await placeBid({ auctionId: auction.id, bidderId: a.id, amount: START, maxAmount: CAP });

    const view = await getAuction(listing.ref);
    expect(view).not.toBeNull();
    const serialised = JSON.stringify(view);
    expect(serialised).not.toContain(String(CAP));
    expect(serialised).not.toContain('maxAmount');
  });
});

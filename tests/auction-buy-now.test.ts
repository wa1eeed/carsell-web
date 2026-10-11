import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { Prisma } from '@/generated/prisma/client';
import { db } from '@/lib/db';
import { buyNow } from '@/lib/domain/auction-order';

/**
 * ═══ «اشترِ الآن» — زرٌّ كان يقول «قريبًا» ═══
 *
 * البائع يضبط السعر في معالج البيع ويُخزَّن، والقاعدة ١٠ تحكم ظهوره
 * (`buyNowAvailable`)، **والزرّ معروضٌ في لوحة المزايدة منذ بُنيت** —
 * وضغطُه يُخرج «الشراء الفوري قريبًا». و`OrderSource.BUY_NOW` معرَّفٌ
 * في المخطّط بلا كاتب.
 *
 * فبائعٌ يضبط سعرًا فوريًّا يُوعَد ببيعٍ لا يقع، ومشترٍ يراه يُوعَد
 * بشراءٍ لا يقع — وهو **زرٌّ ميّت على مسار مال**.
 */

const stamp = String(Date.now()).slice(-9);
const made: { listings: string[]; vehicles: string[]; orders: string[] } = {
  listings: [], vehicles: [], orders: [],
};

async function cleanup(): Promise<void> {
  if (made.orders.length > 0) {
    await db.orderEvent.deleteMany({ where: { orderId: { in: made.orders } } });
    await db.order.deleteMany({ where: { id: { in: made.orders } } });
  }
  if (made.listings.length > 0) {
    await db.bid.deleteMany({ where: { auction: { listingId: { in: made.listings } } } });
    await db.auction.deleteMany({ where: { listingId: { in: made.listings } } });
    await db.listing.deleteMany({ where: { id: { in: made.listings } } });
  }
  if (made.vehicles.length > 0) {
    await db.vehicle.deleteMany({ where: { id: { in: made.vehicles } } });
  }
  made.orders = []; made.listings = []; made.vehicles = [];
}

afterEach(cleanup);
afterAll(async () => {
  await cleanup();
  await db.$disconnect();
});

/** مشترٍ مكتمل الملفّ — فالحارس يفحص البريد والهوية والوضع الضريبي. */
async function buyer(notId: string) {
  return db.user.findFirstOrThrow({
    where: {
      // **والمشتري ليس البائع** — وأوّل صياغةٍ أخذت أيَّ مكتملٍ فوقع عليه
      id: { not: notId },
      email: { not: null },
      identityStatus: 'VERIFIED',
      taxStatus: { not: null },
      status: 'ACTIVE',
    },
  });
}

async function auctionFixture(options: {
  buyNowPrice: number | null;
  reservePrice?: number | null;
  topBid?: number;
  endsInHours?: number;
}) {
  const seller = await db.user.findFirstOrThrow({ where: { listings: { some: {} } } });
  const source = await db.vehicle.findFirstOrThrow({ where: { ownerId: seller.id } });
  const now = new Date();

  /**
   * **والمركبة تُنسَخ لا تُبنى حقلًا حقلًا.** عدُّ الحقول المطلوبة
   * بيدٍ يسقط عند أوّل حقلٍ يُضاف إلى المخطّط — ونسخُ صفٍّ قائم
   * يتبع المخطّط من تلقائه.
   */
  const { id: _id, createdAt: _c, vin: _v, overriddenFields: _o, ...shape } = source;
  const vehicle = await db.vehicle.create({
    data: {
      ...shape,
      ownerId: seller.id,
      // الرقم التسلسليّ واللوحة فريدان — ونسخُهما يصطدم بالصفّ المنسوخ منه
      vin: `BNW${stamp}${String(made.vehicles.length)}${'X'.repeat(4)}`,
    },
  });
  made.vehicles.push(vehicle.id);

  const listing = await db.listing.create({
    data: {
      ref: `BNW${stamp}${String(made.listings.length)}`,
      sellerId: seller.id, vehicleId: vehicle.id, type: 'AUCTION',
      status: 'PUBLISHED', askPrice: new Prisma.Decimal(100_000),
      city: source.city, publishedAt: now,
    },
  });
  made.listings.push(listing.id);

  const auction = await db.auction.create({
    data: {
      listingId: listing.id,
      startPrice: new Prisma.Decimal(50_000),
      bidIncrement: new Prisma.Decimal(1_000),
      depositAmount: new Prisma.Decimal(2_000),
      status: 'LIVE',
      startsAt: new Date(now.getTime() - 3_600_000),
      endsAt: new Date(now.getTime() + (options.endsInHours ?? 24) * 3_600_000),
      ...(options.buyNowPrice === null
        ? {}
        : { buyNowPrice: new Prisma.Decimal(options.buyNowPrice) }),
      ...(options.reservePrice == null
        ? {}
        : { reservePrice: new Prisma.Decimal(options.reservePrice) }),
    },
  });

  if (options.topBid !== undefined) {
    const bidder = await db.user.findFirstOrThrow({ where: { id: { not: seller.id } } });
    await db.bid.create({
      data: {
        auctionId: auction.id, bidderId: bidder.id,
        amount: new Prisma.Decimal(options.topBid), createdAt: now,
      },
    });
  }

  return { seller, listing, auction };
}

describe('اشترِ الآن — المسار', () => {
  it('يُنشئ طلبًا بمصدر BUY_NOW ويُغلق المزاد', async () => {
    const { seller, listing, auction } = await auctionFixture({ buyNowPrice: 120_000 });
    const who = await buyer(seller.id);

    const result = await buyNow({ listingRef: listing.ref, buyerId: who.id });
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;

    const order = await db.order.findUniqueOrThrow({ where: { ref: result.orderRef } });
    made.orders.push(order.id);

    expect(order.source).toBe('BUY_NOW');
    expect(order.stage).toBe('PAYMENT');
    // والمهلة تُكتب — طلبٌ في «دفع» بلا مهلة لا ينتهي ولا يُلغى
    expect(order.paymentDueAt).not.toBeNull();

    const after = await db.auction.findUniqueOrThrow({ where: { id: auction.id } });
    expect(after.status).toBe('ENDED_MET');
    /** **ومزادٌ مفتوح على مركبةٍ بِيعت يقبل مزايدة** — فوقتُه يُقصَر. */
    expect(after.endsAt.getTime()).toBeLessThanOrEqual(Date.now() + 1_000);

    const held = await db.listing.findUniqueOrThrow({ where: { id: listing.id } });
    expect(held.status).toBe('RESERVED');
    expect(held.closeReason).toBe('auction.buy_now');
  });

  it('والقاعدة ١٠ تُفرَض في الخادم', async () => {
    /**
     * الشاشة تُخفي الزرّ متى بلغت المزايداتُ الاحتياطيَّ — ونداءٌ
     * مباشر بعدها يسحب المركبة من مزايدين تجاوزوا هذا السعر.
     * **وحارسٌ في العميل ليس حارسًا.**
     */
    const { seller, listing } = await auctionFixture({
      buyNowPrice: 120_000, reservePrice: 80_000, topBid: 90_000,
    });
    const who = await buyer(seller.id);

    const result = await buyNow({ listingRef: listing.ref, buyerId: who.id });
    expect(result).toEqual({ ok: false, reason: 'BUY_NOW_UNAVAILABLE' });
  });

  it('ومزادٌ انقضى وقتُه لا يُشترى ولو بقيت حالتُه LIVE', async () => {
    /**
     * **الحالة المخزَّنة لا تكفي متى كان لها وقت.** `LIVE` تبقى حتى
     * تمرّ الوظيفة الدورية، وقبولُ شراءٍ بعدها يبيع مركبةً خرجت.
     */
    const { seller, listing, auction } = await auctionFixture({ buyNowPrice: 120_000 });
    await db.auction.update({
      where: { id: auction.id },
      data: { endsAt: new Date(Date.now() - 60_000) },
    });

    const who = await buyer(seller.id);
    expect(await buyNow({ listingRef: listing.ref, buyerId: who.id }))
      .toEqual({ ok: false, reason: 'NOT_LIVE' });
  });

  it('ومزادٌ بلا سعرٍ فوريّ يُرفض', async () => {
    const { seller, listing } = await auctionFixture({ buyNowPrice: null });
    const who = await buyer(seller.id);
    expect(await buyNow({ listingRef: listing.ref, buyerId: who.id }))
      .toEqual({ ok: false, reason: 'BUY_NOW_UNAVAILABLE' });
  });

  it('والبائع لا يشتري مركبته', async () => {
    const { seller, listing } = await auctionFixture({ buyNowPrice: 120_000 });
    expect(await buyNow({ listingRef: listing.ref, buyerId: seller.id }))
      .toEqual({ ok: false, reason: 'OWN_LISTING' });
  });

  it('ولا يُشترى مرّتين', async () => {
    const { seller, listing } = await auctionFixture({ buyNowPrice: 120_000 });
    const who = await buyer(seller.id);

    const first = await buyNow({ listingRef: listing.ref, buyerId: who.id });
    expect(first.ok).toBe(true);
    if (first.ok) {
      const order = await db.order.findUniqueOrThrow({ where: { ref: first.orderRef } });
      made.orders.push(order.id);
    }

    // المزاد أُغلق في المعاملة نفسها — فالثاني يُردّ بـ«ليس مفتوحًا»
    const second = await buyNow({ listingRef: listing.ref, buyerId: who.id });
    expect(second.ok).toBe(false);
  });
});

describe('اشترِ الآن — المشتري', () => {
  it('ملفٌّ ناقص يُرفض قبل أن يُنشأ شيء', async () => {
    const { seller, listing } = await auctionFixture({ buyNowPrice: 120_000 });
    /**
     * **والشرط `idVerified` لا `identityStatus`.** القاعدة في
     * `profileCompletion` وحدها، والبحث بغيرها يُعطي مستخدمًا يمرّ
     * الحارس — فيسقط الاختبار على ما لا يقيسه.
     */
    const incomplete = await db.user.findFirst({
      where: {
        id: { not: seller.id },
        OR: [{ email: null }, { idVerified: false }, { taxStatus: null }],
      },
    });
    /** ولا يُتخطّى بصمت — فاختبارٌ بلا مقيس يمرّ خضرًا ولا يقول شيئًا */
    expect(incomplete, 'لا مستخدم ناقص الملفّ في البذرة').not.toBeNull();
    if (incomplete === null) return;

    const result = await buyNow({ listingRef: listing.ref, buyerId: incomplete.id });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(['PROFILE_INCOMPLETE', 'TAX_STATUS_REQUIRED']).toContain(result.reason);
    }

    // ولا طلب أُنشئ — الحارس قبل المال لا بعده
    expect(await db.order.count({ where: { listingId: listing.id } })).toBe(0);
  });
});

describe('قرارُ البائع — والقارئ الذي لم يُنادَ', () => {
  /**
   * ═══ كلُّ شيءٍ مبنيّ إلّا السلك ═══
   *
   * `sellerDecisionView` و`SellerDecisionPanel` والمسار و
   * `resolveSellerDecision(id, true)` — أربعتُها قائمة، **والوحيد
   * الذي ينادي الأخيرة وظيفةٌ دورية تمرّر `false`**. واللوحة بلا
   * مستوردٍ واحد، والقارئ بلا منادٍ.
   *
   * فكان كل مزادٍ لم يبلغ احتياطيَه ينتهي **بالردّ حتمًا** مهما أراد
   * البائع — والمهلة تُعدّ له في لوحة الأدمن وحدها: ساعاتٌ لقرارٍ لا
   * يستطيع اتّخاذه.
   */
  it('يُعطي البائع قرارَه على مزادٍ لم يبلغ احتياطيَه', async () => {
    const { sellerDecisionView } = await import('@/lib/domain/auctions');
    const { seller, listing, auction } = await auctionFixture({
      buyNowPrice: null, reservePrice: 200_000, topBid: 60_000,
    });

    const now = new Date();
    await db.auction.update({
      where: { id: auction.id },
      data: {
        status: 'ENDED_UNMET',
        endsAt: new Date(now.getTime() - 3_600_000),
        sellerDecisionDueAt: new Date(now.getTime() + 12 * 3_600_000),
      },
    });

    const view = await sellerDecisionView(listing.ref, seller.id, now);
    expect(view, 'البائع لا يرى قراره').not.toBeNull();
    expect(view?.highestBid).toBe('60000');
    expect(view?.lapsed).toBe(false);
  });

  it('ولا يراه غير البائع', async () => {
    const { sellerDecisionView } = await import('@/lib/domain/auctions');
    const { seller, listing, auction } = await auctionFixture({
      buyNowPrice: null, reservePrice: 200_000, topBid: 60_000,
    });
    await db.auction.update({
      where: { id: auction.id },
      data: { status: 'ENDED_UNMET', sellerDecisionDueAt: new Date(Date.now() + 3_600_000) },
    });

    const other = await buyer(seller.id);
    expect(await sellerDecisionView(listing.ref, other.id)).toBeNull();
  });

  it('والمهلةُ المنقضية تُقال ولو لم تمرّ الوظيفة الدورية', async () => {
    /** **الحالة والوقت معًا** — ولوحةٌ تعرض زرًّا بعد انقضاء المهلة تَعِد بما لا يقع. */
    const { sellerDecisionView } = await import('@/lib/domain/auctions');
    const { seller, listing, auction } = await auctionFixture({
      buyNowPrice: null, reservePrice: 200_000, topBid: 60_000,
    });
    await db.auction.update({
      where: { id: auction.id },
      data: { status: 'ENDED_UNMET', sellerDecisionDueAt: new Date(Date.now() - 60_000) },
    });

    expect((await sellerDecisionView(listing.ref, seller.id))?.lapsed).toBe(true);
  });
});

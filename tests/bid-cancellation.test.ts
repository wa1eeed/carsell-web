import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { Prisma } from '@/generated/prisma/client';
import { db } from '@/lib/db';
import { placeBid, getAuction } from '@/lib/domain/auctions';
import { cancelBid } from '@/lib/domain/bid-cancellation';
import { can } from '@/lib/domain/permissions';

/**
 * ═══ إلغاء مزايدة — قرار المالك ٢٠٢٦-١١-٢٥ ═══
 *
 * للأدمن وحده وبسببٍ مكتوب، وما دام المزاد حيًّا. وكان المخطّط ينتظره:
 * «ولا قيمةَ هنا بلا كاتب — والإلغاء قاعدةُ عملٍ لم تُقرَّر بعد».
 */

const stamp = String(Date.now()).slice(-9);
const made: { listings: string[]; vehicles: string[]; auctions: string[]; bids: string[] } = {
  listings: [], vehicles: [], auctions: [], bids: [],
};

async function cleanup(): Promise<void> {
  if (made.auctions.length > 0) {
    await db.auditLog.deleteMany({ where: { entity: 'Bid', entityId: { in: made.bids } } });
    await db.bid.deleteMany({ where: { auctionId: { in: made.auctions } } });
    await db.cancelledBid.deleteMany({ where: { auctionId: { in: made.auctions } } });
    await db.auctionEvent.deleteMany({ where: { auctionId: { in: made.auctions } } });
    await db.deposit.deleteMany({ where: { auctionId: { in: made.auctions } } });
    await db.notification.deleteMany({ where: { entityType: 'Auction', entityId: { in: made.auctions } } });
    await db.auction.deleteMany({ where: { id: { in: made.auctions } } });
  }
  if (made.listings.length > 0) await db.listing.deleteMany({ where: { id: { in: made.listings } } });
  if (made.vehicles.length > 0) await db.vehicle.deleteMany({ where: { id: { in: made.vehicles } } });
  made.auctions = []; made.listings = []; made.vehicles = []; made.bids = [];
}

afterEach(cleanup);
afterAll(async () => {
  await cleanup();
  await db.$disconnect();
});

const START = 40_000;
const INCREMENT = 1_000;

async function fixture() {
  const seller = await db.user.findFirstOrThrow({ where: { listings: { some: {} } } });
  const source = await db.vehicle.findFirstOrThrow({ where: { ownerId: seller.id } });
  const rivals = await db.user.findMany({
    where: { id: { not: seller.id }, status: 'ACTIVE' }, take: 2, orderBy: { id: 'asc' },
  });
  const admin = await db.adminUser.findFirstOrThrow({ where: { role: 'SUPER_ADMIN' } });
  const now = new Date();

  const { id: _id, createdAt: _c, vin: _v, overriddenFields: _o, ...shape } = source;
  const vehicle = await db.vehicle.create({
    data: { ...shape, ownerId: seller.id, vin: `CXL${stamp}${String(made.vehicles.length)}XXXX` },
  });
  made.vehicles.push(vehicle.id);

  const listing = await db.listing.create({
    data: {
      ref: `CXL${stamp}${String(made.listings.length)}`,
      sellerId: seller.id, vehicleId: vehicle.id, type: 'AUCTION',
      status: 'PUBLISHED', askPrice: new Prisma.Decimal(90_000),
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

  return { auction, listing, admin, a: rivals[0]!, b: rivals[1]! };
}

/** مزايدتان: الأدنى لـ`a` والأعلى لـ`b` — فالإلغاء يردّ الصدارة. */
async function twoBids(auctionId: string, a: string, b: string) {
  await placeBid({ auctionId, bidderId: a, amount: START });
  await placeBid({ auctionId, bidderId: b, amount: START + INCREMENT });
  const rows = await db.bid.findMany({ where: { auctionId }, orderBy: { amount: 'desc' } });
  made.bids.push(...rows.map((r) => r.id));
  return rows;
}

describe('إلغاء مزايدة', () => {
  it('والصلاحية مفتاحها لا مفتاح غيرها', () => {
    expect(can('SUPER_ADMIN', 'bids.cancel')).toBe(true);
    expect(can('OPS', 'bids.cancel')).toBe(true);
    // **ولا تُستعار**: من يراجع المحتوى لا يحرّك سعر مزاد
    expect(can('CONTENT', 'bids.cancel')).toBe(false);
    expect(can('SUPPORT', 'bids.cancel')).toBe(false);
    expect(can('READONLY', 'bids.cancel')).toBe(false);
  });

  it('سبب قصير يرد — والسبب يقرؤه المزايد', async () => {
    const { auction, admin, a, b } = await fixture();
    const [topBid] = await twoBids(auction.id, a.id, b.id);
    const result = await cancelBid({ bidId: topBid!.id, adminId: admin.id, reason: 'خطأ' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('REASON_REQUIRED');
    expect(await db.bid.count({ where: { auctionId: auction.id } })).toBe(2);
  });

  /**
   * **وبعد الإغلاق للمزايدة أثرٌ في العالم** — فائزٌ أُعلن وعرابينُ
   * سُوّيت. فنقضُها هناك فكُّ معاملة لا حذفُ صفّ، وطريقُه النزاع.
   */
  it('ومزاد أغلق لا يلغى منه شيء', async () => {
    /**
     * **والمزايدات تُوضع وهو حيّ ثمّ يُغلق** — وهو ما يقع فعلًا:
     * `placeBid` ترفض مزادًا مغلقًا، فزرعُها فيه مباشرةً يختبر حالًا
     * لا يبلغها المنتج.
     */
    const { auction, admin, a, b } = await fixture();
    const [topBid] = await twoBids(auction.id, a.id, b.id);
    await db.auction.update({
      where: { id: auction.id },
      data: { status: 'ENDED_UNMET', endsAt: new Date(Date.now() - 3_600_000) },
    });
    const result = await cancelBid({ bidId: topBid!.id, adminId: admin.id, reason: 'إخلال بالشروط' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('AUCTION_CLOSED');
  });

  /**
   * ═══ وتنتقل لا تُعلَّم ═══
   *
   * ثمانيةٌ وثلاثون موضعًا تقرأ `Bid`؛ وعَلَمٌ يُلزمها كلَّها بتذكّر
   * مرشّحه، ومنسيٌّ واحد يعرض سعرًا أُلغي. **فالصفّ يخرج من الجدول**،
   * وكلُّ قارئٍ قائمٍ يبقى صحيحًا بلا تعديل.
   */
  it('تخرج من Bid وتدخل CancelledBid، ويعود السعر إلى ما تحتها', async () => {
    const { auction, listing, admin, a, b } = await fixture();
    const [topBid] = await twoBids(auction.id, a.id, b.id);

    const before = await getAuction(listing.ref);
    expect(before?.highestBid).toBe(String(START + INCREMENT));

    const result = await cancelBid({
      bidId: topBid!.id, adminId: admin.id, reason: 'إخلال بشروط المزاد',
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.topAmount).toBe(String(START));

    expect(await db.bid.count({ where: { auctionId: auction.id } })).toBe(1);
    expect(await db.cancelledBid.count({ where: { auctionId: auction.id } })).toBe(1);

    /** **والقارئ العامّ هو المقياس** — لا عدُّ الصفوف وحده. */
    const after = await getAuction(listing.ref);
    expect(after?.highestBid).toBe(String(START));
    expect(after?.cancelledCount).toBe(1);
    // وتبقى معروضةً بسببها — الترميز يرسمها مشطوبة
    expect(after?.bids.some((row) => row.cancelled === 'إخلال بشروط المزاد')).toBe(true);
    expect(after?.events.some((row) => row.kind === 'BID_CANCELLED')).toBe(true);
  });

  it('ويكتب في السجل، ويخطر صاحبها ومن عاد إلى الصدارة', async () => {
    const { auction, admin, a, b } = await fixture();
    const [topBid] = await twoBids(auction.id, a.id, b.id);

    await cancelBid({ bidId: topBid!.id, adminId: admin.id, reason: 'حساب منتحل' });

    const entry = await db.auditLog.findFirstOrThrow({
      where: { entity: 'Bid', entityId: topBid!.id, action: 'bid.cancel' },
    });
    expect((entry.after as { reason?: string }).reason).toBe('حساب منتحل');
    expect(entry.actorId).toBe(admin.id);

    const told = await db.notification.findMany({
      where: { entityType: 'Auction', entityId: auction.id },
      select: { templateKey: true, userId: true },
    });
    expect(told.some((n) => n.templateKey === 'auction.bid_cancelled' && n.userId === b.id)).toBe(true);
    /**
     * **ومن عاد إلى الصدارة لا يُقال له «تم تجاوزك»** — نصٌّ يقول
     * عكسَ ما وقع، فيترك المزاد وهو المتصدّر.
     */
    expect(told.some((n) => n.templateKey === 'auction.lead_restored' && n.userId === a.id)).toBe(true);
  });

  it('والعربون لا يمس — الإلغاء في مزايدة لا في مزايد', async () => {
    const { auction, admin, a, b } = await fixture();
    const [topBid] = await twoBids(auction.id, a.id, b.id);
    await cancelBid({ bidId: topBid!.id, adminId: admin.id, reason: 'إخلال بالشروط' });

    const deposit = await db.deposit.findFirstOrThrow({
      where: { auctionId: auction.id, userId: b.id },
    });
    expect(deposit.status).toBe('HELD');

    // وله أن يزايد من جديد
    const again = await placeBid({ auctionId: auction.id, bidderId: b.id, amount: START + INCREMENT });
    expect(again.ok).toBe(true);
  });
});

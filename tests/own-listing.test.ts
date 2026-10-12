import { afterAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { ownListingRefs } from '@/lib/domain/favorites';
import { createOffer } from '@/lib/domain/offers';
import { placeBid } from '@/lib/domain/auctions';

/**
 * ═══ لا يشتري أحدٌ من نفسه — ولا يُترك يحاول ═══
 *
 * الحارس في الخادم قائمٌ في المسارات الثلاثة (`OWN_LISTING` في الشراء
 * والعرض، و`OWN_AUCTION` في المزايدة). **والشاشة كانت صامتة**: من نشر
 * سيارته يراها في البحث كأيّ بطاقة، فيفتحها ويضغط «اشترِ» فيردّه
 * الخادم — والحارس صحيح، والشاشة لم تقل.
 *
 * فهذا يحرس الطرفين معًا: الراية التي تُوسَم بها البطاقة، والرفض الذي
 * يقع إن تجاوز الوسمَ أحد. **وأحدهما بلا الآخر نصفُ قاعدة.**
 */

afterAll(async () => {
  await db.$disconnect();
});

describe('═══ إعلانُك يُوسَم ═══', () => {
  it('بطاقات البائع وحدها تُوسَم، ولا شيء لزائرٍ بلا جلسة', async () => {
    const seller = await db.user.findFirstOrThrow({
      where: { listings: { some: { status: 'PUBLISHED' } } },
      select: { id: true, listings: { where: { status: 'PUBLISHED' }, take: 2, select: { ref: true } } },
    });
    const mine = seller.listings.map((row) => row.ref);

    const other = await db.listing.findFirstOrThrow({
      where: { status: 'PUBLISHED', sellerId: { not: seller.id } },
      select: { ref: true },
    });

    const marked = await ownListingRefs(seller.id, [...mine, other.ref]);
    expect([...marked].sort()).toEqual([...mine].sort());

    /** **وبلا جلسةٍ لا استعلام أصلًا** — ولا وسم. */
    expect((await ownListingRefs(null, [...mine, other.ref])).size).toBe(0);
  });
});

describe('═══ ولا يشتري أحدٌ من نفسه ═══', () => {
  it('عرضُ البائع على إعلانه يُرفض', async () => {
    const listing = await db.listing.findFirstOrThrow({
      where: { status: 'PUBLISHED', type: 'NEGOTIATION' },
      select: { ref: true, sellerId: true, askPrice: true },
    });

    const result = await createOffer({
      listingRef: listing.ref,
      buyerId: listing.sellerId,
      amount: Number(listing.askPrice),
    });

    expect(result).toEqual({ ok: false, reason: 'OWN_LISTING' });
  });

  it('مزايدةُ البائع على مزاده تُرفض', async () => {
    /**
     * **والحالة وانقضاء الوقت معًا.** `LIVE` مخزَّنةٌ لمزادٍ انقضى
     * وقتُه حتى تمرّ الوظيفة الدورية، و`placeBid` تردّ `ENDED` قبل
     * أن تنظر في المالك — فيقيس الاختبار شيئًا لم يقصده.
     */
    const auction = await db.auction.findFirstOrThrow({
      where: { status: 'LIVE', endsAt: { gt: new Date() } },
      select: { id: true, startPrice: true, listing: { select: { sellerId: true } } },
    });

    const result = await placeBid({
      auctionId: auction.id,
      bidderId: auction.listing.sellerId,
      amount: Number(auction.startPrice) + 100_000,
    });

    expect(result).toEqual({ ok: false, reason: 'OWN_AUCTION' });
  });
});

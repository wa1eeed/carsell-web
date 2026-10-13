import { afterAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { parseFilters, searchListings } from '@/lib/domain/listings';

/** الفلاتر تُفكّ من الرابط — فلا يُبنى شكلُها بيدٍ ناقص. */
const auctionsOnly = () => parseFilters(new URLSearchParams('type=AUCTION'));

/**
 * ═══ ما تقوله البطاقة عن مزادها ═══
 *
 * عطلان وقعا معًا في صفّ البحث — وهو ما تقرؤه نتائجُ البحث وصفحاتُ
 * الهبوط والرئيسية:
 *
 * **١· `bidderCount` كان عدد المزايدات.** فتقول البطاقة «١٦ مزايدًا»
 * وهم ستّة — والمبالغة في المنافسة ترفع ما يدفعه المشتري. والعطل نفسه
 * كان في عمود الشراء.
 *
 * **٢· و`endsAt` يُمرَّر ولو انقضى.** الحالة المخزَّنة `LIVE` والوظيفة
 * الدورية لم تمرّ بعد، فتعرض البطاقة عدّادًا على `00:00:00` تحت «أعلى
 * مزايدة» — فيُقرأ مزادًا حيًّا انتهى توًّا، وهو منتهٍ منذ ساعات.
 * والفحص على الحالة **وانقضاء الوقت معًا**.
 */

afterAll(async () => {
  await db.$disconnect();
});

describe('صفُّ البحث يقول الحقّ عن مزاده', () => {
  it('المزايدون يُعدّون بأشخاصهم لا بمزايداتهم', async () => {
    const result = await searchListings(auctionsOnly(), 'ar', null);
    const withBids = result.items.filter((item) => (item.bidderCount ?? 0) > 0);
    expect(withBids.length).toBeGreaterThan(0);

    for (const item of withBids) {
      const listing = await db.listing.findUniqueOrThrow({
        where: { ref: item.ref },
        select: { auction: { select: { id: true, _count: { select: { bids: true } } } } },
      });
      if (listing.auction === null) continue;

      const people = await db.bid.findMany({
        where: { auctionId: listing.auction.id },
        select: { bidderId: true },
        distinct: 'bidderId',
      });

      expect(item.bidderCount, item.ref).toBe(people.length);
      // ومزايدون أكثر من مزايدات محال
      expect(item.bidderCount ?? 0, item.ref).toBeLessThanOrEqual(listing.auction._count.bids);
    }
  });

  it('ولا عدّادَ لمزادٍ انقضى وقتُه', async () => {
    const result = await searchListings(auctionsOnly(), 'ar', null);
    expect(result.items.length).toBeGreaterThan(0);

    for (const item of result.items) {
      if (item.endsAt === null) continue;
      // ما بقي له عدّادٌ فوقتُه في المستقبل — وإلّا رُسم `00:00:00`
      expect(Date.parse(item.endsAt), item.ref).toBeGreaterThan(Date.now());
    }
  });

  /**
   * **والمنتهي لا يختفي من النتائج** — إعلانُه منشورٌ بعد، وإخفاؤه
   * يجعل صفحةً كان فيها ثلاثُ سيارات تعرض اثنتين بلا سبب.
   */
  it('والمنتهي يبقى معروضًا بلا عدّاد', async () => {
    const expired = await db.auction.findFirst({
      where: { endsAt: { lt: new Date() }, listing: { status: 'PUBLISHED' } },
      select: { listing: { select: { ref: true } } },
    });
    if (expired === null) return;

    const result = await searchListings(auctionsOnly(), 'ar', null);
    const row = result.items.find((item) => item.ref === expired.listing.ref);
    expect(row, expired.listing.ref).toBeDefined();
    expect(row?.endsAt).toBeNull();
  });
});

import { afterAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { findPublishedListing, toPublicDetail } from '@/lib/domain/listing-detail';

/**
 * ═══ المزايدون غيرُ المزايدات ═══
 *
 * عمودُ الشراء كان يعرض `bidCount` موسومًا «مزايدين»، وسجلُّ المزايدات
 * تحته يحسب المزايدين من أسمائهم المستعارة — فتقول الشاشة الواحدة
 * «٦ مزايدين · ٩ مزايدات» في موضع و**«٩ مزايدين»** في آخر.
 *
 * وليس خطأ وسمٍ: **المبالغة في المنافسة ترفع ما يدفعه المشتري**. فمن
 * يرى تسعةً يزايدون يرفع عرضه على ستّة.
 */

afterAll(async () => {
  await db.$disconnect();
});

describe('عدّا المزاد', () => {
  it('المزايدون يُعدّون بأشخاصهم والمزايدات بعددها', async () => {
    const auction = await db.auction.findFirst({
      where: { bids: { some: {} } },
      select: { id: true, listing: { select: { ref: true } }, _count: { select: { bids: true } } },
      orderBy: { id: 'asc' },
    });
    expect(auction).not.toBeNull();
    if (auction === null) return;

    const bidders = await db.bid.findMany({
      where: { auctionId: auction.id },
      select: { bidderId: true },
      distinct: 'bidderId',
    });

    const row = await findPublishedListing(auction.listing.ref);
    expect(row).not.toBeNull();
    if (row === null) return;
    const detail = await toPublicDetail(row, 'ar');
    expect(detail).not.toBeNull();
    expect(detail?.auction).not.toBeNull();

    expect(detail?.auction?.bidCount).toBe(auction._count.bids);
    expect(detail?.auction?.bidderCount).toBe(bidders.length);
  });

  /** ومزايدون أقلُّ من مزايدات متى زايد أحدُهم مرّتين — وهو الحال الغالب. */
  it('والمزايدون لا يفوقون المزايدات أبدًا', async () => {
    const auctions = await db.auction.findMany({
      where: { bids: { some: {} } },
      select: { listing: { select: { ref: true } } },
      take: 5,
    });

    for (const row of auctions) {
      const found = await findPublishedListing(row.listing.ref);
      if (found === null) continue;
      const detail = await toPublicDetail(found, 'ar');
      const block = detail?.auction;
      if (block === null || block === undefined) continue;
      expect(block.bidderCount, row.listing.ref).toBeLessThanOrEqual(block.bidCount);
      expect(block.bidderCount, row.listing.ref).toBeGreaterThan(0);
    }
  });
});

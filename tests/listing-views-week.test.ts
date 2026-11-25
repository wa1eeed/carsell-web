import { afterAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { recordListingView, viewsThisWeek } from '@/lib/domain/listing-views';

afterAll(async () => {
  await db.$disconnect();
});

/**
 * ═══ نافذةُ الأسبوع تُقاس بصنعِ ما خارجها ═══
 *
 * اختبارٌ يزرع مشاهداتٍ داخل الأسبوع وحده يمرّ ولو كانت الدالّة تجمع
 * **كلَّ** الأيّام — فالحدُّ يُختبَر بتجاوزه: صفٌّ قبل ثمانية أيّام
 * يجب ألّا يُحسب، وصفٌّ اليومَ يجب أن يُحسب.
 */
describe('مشاهدات هذا الأسبوع', () => {
  it('تجمع آخر سبعة أيّام وتترك ما قبلها', async () => {
    const listing = await db.listing.findFirstOrThrow({ select: { id: true } });
    const day = (back: number): Date => {
      const d = new Date(Date.now() + 3 * 3_600_000);
      d.setUTCHours(0, 0, 0, 0);
      d.setUTCDate(d.getUTCDate() - back);
      return d;
    };

    const before = await viewsThisWeek([listing.id]);

    await db.listingViewDay.upsert({
      where: { listingId_day: { listingId: listing.id, day: day(0) } },
      create: { listingId: listing.id, day: day(0), count: 5 },
      update: { count: { increment: 5 } },
    });
    await db.listingViewDay.upsert({
      where: { listingId_day: { listingId: listing.id, day: day(8) } },
      create: { listingId: listing.id, day: day(8), count: 100 },
      update: { count: { increment: 100 } },
    });

    const after = await viewsThisWeek([listing.id]);
    expect(after).toBe(before + 5);

    await db.listingViewDay.deleteMany({
      where: { listingId: listing.id, day: { in: [day(0), day(8)] } },
    });
  });

  /** **وصاحبُ الإعلان لا يُعَدّ** — يفتحه ليراجع صوره فيضخّم رقمَه بنفسه. */
  it('ولا تُعَدّ مشاهدةُ البائع نفسه', async () => {
    const listing = await db.listing.findFirstOrThrow({ select: { id: true, sellerId: true } });
    const before = await viewsThisWeek([listing.id]);

    await recordListingView(listing.id, listing.sellerId, listing.sellerId);
    expect(await viewsThisWeek([listing.id])).toBe(before);

    await recordListingView(listing.id, null, listing.sellerId);
    const after = await viewsThisWeek([listing.id]);
    expect(after).toBe(before + 1);

    // يُعاد ما غُيّر — المجموعُ التراكميّ والصفُّ اليوميّ معًا
    const today = new Date(Date.now() + 3 * 3_600_000);
    today.setUTCHours(0, 0, 0, 0);
    await db.listingViewDay.update({
      where: { listingId_day: { listingId: listing.id, day: today } },
      data: { count: { decrement: 1 } },
    });
    await db.listing.update({
      where: { id: listing.id },
      data: { viewCount: { decrement: 1 } },
    });
  });
});

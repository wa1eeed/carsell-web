import { afterAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { favoriteListings } from '@/lib/domain/account';

/**
 * ═══ المزادُ في المفضّلة (Wu) ═══
 *
 * ترميز `Wu` يضع تحت المركبة «في مزاد · ينتهي غدًا» — وهي أعجلُ ما في
 * الشاشة: من حفظ مركبةً في مزادٍ يغلق غدًا يحتاج أن يعرف قبل أن يفوته.
 *
 * **والحالةُ وانقضاءُ الوقت معًا** (درسٌ مسجَّل): مزادٌ `LIVE` مضى
 * موعدُه ولم تمرّ عليه الوظيفة بعد ليس مباشرًا، ولا يُقال عنه «ينتهي»
 * بمدّةٍ سالبة.
 */

const made: string[] = [];
let userId: string | null = null;

afterAll(async () => {
  if (made.length > 0) await db.favorite.deleteMany({ where: { id: { in: made } } });
  if (userId !== null) await db.user.deleteMany({ where: { id: userId } });
  await db.$disconnect();
});

async function viewer() {
  if (userId !== null) return userId;
  const row = await db.user.create({
    data: { phone: `+96658${String(Date.now()).slice(-7)}`, name: 'قياس المفضلة' },
  });
  userId = row.id;
  return row.id;
}

async function save(listingId: string) {
  const row = await db.favorite.upsert({
    where: { userId_listingId: { userId: await viewer(), listingId } },
    create: { userId: await viewer(), listingId },
    update: {},
    select: { id: true },
  });
  if (!made.includes(row.id)) made.push(row.id);
}

describe('شارةُ المزاد في المفضّلة', () => {
  it('مزادٌ مباشرٌ لم ينقضِ يُقال بمدّته وبيومه', async () => {
    const listing = await db.listing.findFirst({
      where: { status: 'PUBLISHED', auction: { status: 'LIVE' } },
      select: { id: true, auction: { select: { endsAt: true } } },
    });
    expect(listing, 'لا إعلانَ بمزادٍ مباشر مزروع').not.toBeNull();
    if (listing?.auction == null) return;

    await save(listing.id);
    /** تُقاس قبل الإغلاق بساعة — فالمزادُ مباشرٌ يقينًا. */
    const now = new Date(listing.auction.endsAt.getTime() - 3_600_000);
    const row = (await favoriteListings(await viewer(), 'ar', now)).find(
      (entry) => entry.auctionMinutesLeft !== null,
    );

    expect(row, 'الصفُّ يجب أن يحمل حالَ المزاد').toBeDefined();
    expect(row?.auctionMinutesLeft).toBeGreaterThan(0);
    expect(row?.auctionEndsInDays).not.toBeNull();
  });

  /**
   * **والحدُّ يُعبَر**: تُقاس الدالّةُ بعد موعد الإغلاق والحالُ ما زال
   * `LIVE` — وهي حالٌ تقع كلَّ مرّةٍ بين الانقضاء ومرور الوظيفة.
   */
  it('وما انقضى وقتُه لا يُقال «ينتهي» ولو بقي LIVE', async () => {
    const listing = await db.listing.findFirst({
      where: { status: 'PUBLISHED', auction: { status: 'LIVE' } },
      select: { id: true, auction: { select: { endsAt: true } } },
    });
    if (listing?.auction == null) return;

    await save(listing.id);
    const after = new Date(listing.auction.endsAt.getTime() + 60_000);
    const rows = await favoriteListings(await viewer(), 'ar', after);

    expect(rows.every((entry) => entry.auctionMinutesLeft === null)).toBe(true);
    expect(rows.every((entry) => entry.auctionEndsInDays === null)).toBe(true);
  });

  /** وإعلانٌ بلا مزادٍ لا يحمل الحال — ولا `0` تُقرأ «ينتهي اليوم». */
  it('وبلا مزادٍ لا حال', async () => {
    const plain = await db.listing.findFirst({
      where: { status: 'PUBLISHED', auction: null },
      select: { id: true },
    });
    if (plain === null) return;

    await save(plain.id);
    const row = (await favoriteListings(await viewer(), 'ar')).find(
      (entry) => entry.ref !== undefined && entry.auctionMinutesLeft === null,
    );
    expect(row).toBeDefined();
    expect(row?.auctionEndsInDays).toBeNull();
  });
});

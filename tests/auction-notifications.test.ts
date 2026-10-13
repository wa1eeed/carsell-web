import { afterAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { placeBid } from '@/lib/domain/auctions';
import { remindClosingAuctions, remindPaymentDue } from '@/lib/domain/reminders';

/**
 * ═══ المزاد لا يعمل بلا جرس ═══
 *
 * **`auction.outbid` هي آلته لا زينتُه**: تُتجاوَز مزايدتُك فتُخبَر
 * فتعود فترفع. وبلا الخبر لا يعود أحد، فينتهي المزاد على أوّل مزايدةٍ
 * تركها صاحبُها — والصيغة كلُّها تفقد معناها.
 *
 * وقِيس: ستّةُ قوالب مزادٍ مزروعة بلا كاتب، و`auction.lost` وحدها
 * موصولة — فمن خسر يُخبَر ومن فاز لا، ومن تُجووز لا.
 *
 * **والاختبار يفحص المستلم**: «كُتب إشعار» صادقةٌ لو وصل الطرف الخطأ،
 * وهو الخطأ الذي يقع — فيُخطَر من زايد للتوّ بدل من فقد موقعه.
 */

afterAll(async () => {
  await db.$disconnect();
});

type Seat = { auctionId: string; listingRef: string; bidders: string[] };

/**
 * مزادٌ حيٌّ بمزايدَين مؤهَّلَين — يُصنع ويُزال بعده.
 *
 * **وعربونٌ لكلٍّ**: `placeBid` ترفض بلا `HELD`، فمزادٌ بلا عرابين
 * يجعل الاختبار يقيس الرفض لا الجرس.
 */
async function withLiveAuction(body: (seat: Seat) => Promise<void>): Promise<void> {
  const listing = await db.listing.findFirstOrThrow({
    where: { status: 'PUBLISHED', auction: { is: null } },
    select: { id: true, ref: true, sellerId: true },
  });

  const people = await db.user.findMany({
    where: { id: { not: listing.sellerId } },
    take: 2,
    select: { id: true },
  });
  const bidders = people.map((row) => row.id);

  const now = new Date();
  const auction = await db.auction.create({
    data: {
      listingId: listing.id,
      startPrice: 10_000,
      bidIncrement: 500,
      depositAmount: 1_000,
      status: 'LIVE',
      startsAt: new Date(now.getTime() - 3_600_000),
      endsAt: new Date(now.getTime() + 86_400_000),
    },
    select: { id: true },
  });

  for (const userId of bidders) {
    await db.deposit.create({
      data: { auctionId: auction.id, userId, amount: 1_000, status: 'HELD' },
    });
  }

  try {
    await body({ auctionId: auction.id, listingRef: listing.ref, bidders });
  } finally {
    await db.notification.deleteMany({ where: { entityType: 'Auction', entityId: auction.id } });
    await db.bid.deleteMany({ where: { auctionId: auction.id } });
    await db.deposit.deleteMany({ where: { auctionId: auction.id } });
    await db.auction.delete({ where: { id: auction.id } });
  }
}

async function bells(auctionId: string): Promise<{ key: string; userId: string }[]> {
  const rows = await db.notification.findMany({
    where: { entityType: 'Auction', entityId: auctionId },
    orderBy: { createdAt: 'asc' },
    select: { templateKey: true, userId: true },
  });
  return rows.map((row) => ({ key: row.templateKey, userId: row.userId }));
}

describe('من تُجووزت مزايدتُه يُخبَر', () => {
  it('يصل صاحبَ الأعلى السابق وحده', async () => {
    await withLiveAuction(async (seat) => {
      const [first, second] = seat.bidders as [string, string];

      // أوّل مزايدةٍ لا تتجاوز أحدًا — فلا جرس
      expect((await placeBid({ auctionId: seat.auctionId, bidderId: first, amount: 10_000 })).ok)
        .toBe(true);
      expect((await bells(seat.auctionId)).filter((row) => row.key === 'auction.outbid')).toEqual([]);

      // والثانية تتجاوز الأوّل
      expect((await placeBid({ auctionId: seat.auctionId, bidderId: second, amount: 10_500 })).ok)
        .toBe(true);
      expect((await bells(seat.auctionId)).filter((row) => row.key === 'auction.outbid')).toEqual([
        { key: 'auction.outbid', userId: first },
      ]);
    });
  });

  /** **ومن رفع على نفسه تجاوزَ نفسه** — فرسالةٌ تقول له ذلك ضجيج. */
  it('ولا يُخبَر من رفع على نفسه', async () => {
    await withLiveAuction(async (seat) => {
      const [first] = seat.bidders as [string, string];

      await placeBid({ auctionId: seat.auctionId, bidderId: first, amount: 10_000 });
      await placeBid({ auctionId: seat.auctionId, bidderId: first, amount: 10_500 });

      expect((await bells(seat.auctionId)).filter((row) => row.key === 'auction.outbid')).toEqual([]);
    });
  });
});

describe('تذكير إغلاق المزاد', () => {
  /**
   * **والتذكير واحد.** المُجدوِل يمرّ كل دقائق ومهلةٌ تبقى ساعة تبقى
   * ساعة — فبلا علامةٍ يُرسَل عشرات المرّات، ويُدرَّب المستلم على
   * تجاهل الجرس.
   */
  it('يصل من زايد مرّةً واحدة مهما تكرّر المرور', async () => {
    await withLiveAuction(async (seat) => {
      const [first] = seat.bidders as [string, string];
      await placeBid({ auctionId: seat.auctionId, bidderId: first, amount: 10_000 });

      // نافذةُ الإغلاق تقترب
      const now = new Date();
      await db.auction.update({
        where: { id: seat.auctionId },
        data: { endsAt: new Date(now.getTime() + 5 * 60_000) },
      });

      expect(await remindClosingAuctions(now)).toBeGreaterThan(0);
      const after = (await bells(seat.auctionId)).filter((row) => row.key === 'auction.closing');
      expect(after).toEqual([{ key: 'auction.closing', userId: first }]);

      /** المرور الثاني لا يضيف شيئًا */
      await remindClosingAuctions(new Date(now.getTime() + 60_000));
      expect((await bells(seat.auctionId)).filter((row) => row.key === 'auction.closing'))
        .toEqual(after);
    });
  });

  /** ومن لم يزايد لم يُبدِ نيّةً — فلا يُنبَّه على مزادٍ لم يدخله. */
  it('ولا يصل من لم يزايد', async () => {
    await withLiveAuction(async (seat) => {
      const now = new Date();
      await db.auction.update({
        where: { id: seat.auctionId },
        data: { endsAt: new Date(now.getTime() + 5 * 60_000) },
      });

      expect(await remindClosingAuctions(now)).toBe(0);
      expect(await bells(seat.auctionId)).toEqual([]);
    });
  });
});

/**
 * ═══ وتذكير الدفع يسبق سقوط الطلب ═══
 *
 * كان المشتري يعرف بمهلته **بعد** انقضائها: `timeoutUnpaidOrders`
 * تُلغي طلبه ثم تخبره. والاكتشاف بعد الخسارة ليس اكتشافًا.
 */
describe('تذكير الدفع', () => {
  it('لا يذكّر بمهلةٍ انقضت — ذلك إلغاء لا تذكير', async () => {
    const now = new Date();
    const before = await db.notification.count({ where: { templateKey: 'order.payment_due' } });

    /**
     * طلبٌ مهلتُه في الماضي: `timeoutUnpaidOrders` موضعُه، وتذكيرٌ
     * عليه يقول «ادفع خلال ساعة» وقد مات.
     */
    const lapsed = await db.order.findFirst({
      where: { stage: 'PAYMENT', status: 'ACTIVE', paymentDueAt: { lt: now } },
      select: { ref: true },
    });
    await remindPaymentDue(now);

    if (lapsed !== null) {
      expect(
        await db.notification.count({
          where: { templateKey: 'order.payment_due', entityId: lapsed.ref },
        }),
      ).toBe(0);
    }

    // ولا يُرسَل شيءٌ مكرّر على تشغيلٍ ثانٍ
    const mid = await db.notification.count({ where: { templateKey: 'order.payment_due' } });
    await remindPaymentDue(now);
    expect(await db.notification.count({ where: { templateKey: 'order.payment_due' } })).toBe(mid);
    expect(mid).toBeGreaterThanOrEqual(before);

    await db.notification.deleteMany({
      where: { templateKey: 'order.payment_due', createdAt: { gte: now } },
    });
  });
});

import { afterAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { getOfferedVehicles, getOfferInbox } from '@/lib/domain/offer-inbox';

/**
 * ═══ الحدُّ الأدنى المخفيّ (Wl) ═══
 *
 * `minAcceptPrice` أرضيّةُ البائع: يرفض ما دونها تلقائيًّا. وقاعدةُ
 * المستودع صريحة — **لا يظهر في أيّ استجابة عامّة**.
 *
 * وترميز `Wl` يعرضه **لصاحبه**: «الحد الأدنى المخفي ١٣٥٬٠٠٠» فوق
 * عروضه، وزرٌّ يعدّله. وكان البائع يكتبه مرّةً في معالج البيع ثمّ لا
 * يراه أبدًا ولا يملك تغييره.
 *
 * فالحدّان اللذان يحرسهما هذا الملفّ: **أنه يصل صاحبَه**، و**أنه لا
 * يدخل كائنَ غيره أصلًا** — لا يُخفى في التصيير، فما يُجلَب يُسلسَل
 * ولو لم يُرسَم.
 */

const madeUsers: string[] = [];

afterAll(async () => {
  if (madeUsers.length > 0) await db.user.deleteMany({ where: { id: { in: madeUsers } } });
  await db.$disconnect();
});

let seq = 0;

async function buyer() {
  seq += 1;
  const row = await db.user.create({
    data: { phone: `+9665${String(Date.now()).slice(-6)}${String(seq)}`, name: 'مشترٍ قياس' },
  });
  madeUsers.push(row.id);
  return row;
}

describe('الحدُّ الأدنى يصل صاحبَه ولا يعبره', () => {
  it('البائعُ يراه على عروضه، والمشتري لا يراه على ما أرسل', async () => {
    const listing = await db.listing.findFirstOrThrow({
      where: { status: 'PUBLISHED', type: 'NEGOTIATION', minAcceptPrice: { not: null } },
      select: { id: true, ref: true, sellerId: true, minAcceptPrice: true, askPrice: true },
    });

    const me = await buyer();
    const offer = await db.offer.create({
      data: {
        listingId: listing.id,
        buyerId: me.id,
        /** **فوق الأرضيّة** — فالعرضُ لا يُرفض تلقائيًّا والقياس على حيّ. */
        amount: listing.minAcceptPrice ?? listing.askPrice,
        status: 'PENDING',
        expiresAt: new Date(Date.now() + 86_400_000),
      },
      select: { id: true },
    });

    try {
      /** ① صاحبُ الإعلان يراه — وهو ما يقرّر به. */
      const sellerInbox = await getOfferInbox(listing.sellerId, 'ar');
      const asSeller = sellerInbox.active.find((row) => row.id === offer.id);
      expect(asSeller, 'العرض يجب أن يصل صندوق البائع').toBeDefined();
      expect(asSeller?.listing.minAcceptPrice).toBe(listing.minAcceptPrice?.toString());
      expect(asSeller?.standing).toBe('above_floor');

      /**
       * ② **والمشتري لا يراه** — و`null` في الكائن لا إخفاءٌ في
       * التصيير: حمولةُ RSC تحمل ما يُجلَب وإن لم يُرسَم.
       */
      const buyerInbox = await getOfferInbox(me.id, 'ar');
      const asBuyer = buyerInbox.sent.find((row) => row.id === offer.id);
      expect(asBuyer, 'العرض يجب أن يظهر في «مرسلة» للمشتري').toBeDefined();
      expect(asBuyer?.listing.minAcceptPrice).toBeNull();
      /** وموضعُ العرض من أرضيّةٍ لا يملكها لا معنى له — ولا يُحسب. */
      expect(asBuyer?.standing).toBeNull();
      expect(asBuyer?.vsAsk).toBeNull();

      /** **ولا صفَّ واحد في كائنات المشتري يحمله.** */
      const all = [...buyerInbox.active, ...buyerInbox.sent, ...buyerInbox.closed];
      expect(all.every((row) => row.listing.minAcceptPrice === null)).toBe(true);

      /** ③ وعمودُ «مركباتك» للمشتري فارغ — لا إعلانَ له. */
      expect(await getOfferedVehicles(me.id, 'ar')).toEqual([]);
    } finally {
      await db.offer.delete({ where: { id: offer.id } });
    }
  });

  /**
   * ═══ والحدُّ يُختبَر بتجاوزه ═══
   *
   * اختبارٌ يفحص حدًّا لا تبلغه مدخلاتُه أخضرُ أعمى: فالثلاثةُ هنا
   * عرضٌ دون الأرضيّة، وعرضٌ فوقها، وعرضٌ يبلغ السعر المطلوب.
   */
  it('موضعُ العرض يتبدّل بتجاوز الأرضيّة والسعر', async () => {
    const listing = await db.listing.findFirstOrThrow({
      where: { status: 'PUBLISHED', type: 'NEGOTIATION', minAcceptPrice: { not: null } },
      select: { id: true, sellerId: true, minAcceptPrice: true, askPrice: true },
    });

    const floor = Number(listing.minAcceptPrice);
    const ask = Number(listing.askPrice);
    expect(floor, 'الأرضيّة يجب أن تكون دون السعر — وإلّا لم يُقَس شيء').toBeLessThan(ask);

    const cases: [number, string][] = [
      [floor - 1000, 'below_floor'],
      [floor, 'above_floor'],
      [ask, 'above_ask'],
    ];

    for (const [amount, expected] of cases) {
      const me = await buyer();
      const offer = await db.offer.create({
        data: {
          listingId: listing.id,
          buyerId: me.id,
          amount,
          status: 'PENDING',
          expiresAt: new Date(Date.now() + 86_400_000),
        },
        select: { id: true },
      });

      try {
        const inbox = await getOfferInbox(listing.sellerId, 'ar');
        const row = [...inbox.active, ...inbox.closed].find((item) => item.id === offer.id);
        expect(row?.standing, `مبلغ ${String(amount)}`).toBe(expected);
        expect(row?.vsAsk).toBe(Math.round(amount - ask));
      } finally {
        await db.offer.delete({ where: { id: offer.id } });
      }
    }
  });
});

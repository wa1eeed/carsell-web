import { afterAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { getDealerPage } from '@/lib/domain/dealer-page';

/**
 * ═══ معدَّلُ ردّ المعرض وزمنُه (Wg) ═══
 *
 * ترميز `Wg` يعرض «معدل الرد ٩٨٪» و«متوسط زمن الرد ٢٢ د»، **ولم يكن
 * لهما في المخطّط مصدر**: العرضُ يحمل `createdAt` وحده، فلا يُعرف متى
 * رُدّ ولا أرُدّ أصلًا. فأُضيف `respondedAt` ويُكتب عند الردّ المقصود.
 *
 * وثلاثةُ أشياء تُحرس هنا، وكلُّها تقع عند حدٍّ **يُعبَر لا يُنتظَر**:
 * عتبةُ الثقة، واستثناءُ الرفض الآليّ، واستثناءُ ما لم تنقضِ مهلتُه.
 */

const madeUsers: string[] = [];
const madeOffers: string[] = [];

afterAll(async () => {
  if (madeOffers.length > 0) await db.offer.deleteMany({ where: { id: { in: madeOffers } } });
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

/** معرضٌ له مخزونٌ تفاوضيّ — وعليه تُقاس الأرقام. */
async function dealerWithStock() {
  const dealers = await db.dealer.findMany({
    where: { status: 'ACTIVE' },
    select: { slug: true, id: true },
  });

  for (const dealer of dealers) {
    const members = await db.user.findMany({
      where: { dealerId: dealer.id },
      select: { id: true },
    });
    const listing = await db.listing.findFirst({
      where: {
        sellerId: { in: members.map((m) => m.id) },
        status: 'PUBLISHED',
        type: 'NEGOTIATION',
      },
      select: { id: true, askPrice: true },
    });
    if (listing !== null) return { slug: dealer.slug, listing };
  }
  throw new Error('لا معرضَ بمخزونٍ تفاوضيّ — البذرة ناقصة');
}

async function offer(
  listingId: string,
  amount: unknown,
  shape: { answered: boolean; auto?: boolean; stillOpen?: boolean },
) {
  const me = await buyer();
  const madeAt = new Date(Date.now() - 20 * 86_400_000);
  const row = await db.offer.create({
    data: {
      listingId,
      buyerId: me.id,
      amount: amount as never,
      status: shape.answered ? 'REJECTED' : shape.stillOpen === true ? 'PENDING' : 'EXPIRED',
      autoRejected: shape.auto === true,
      createdAt: madeAt,
      ...(shape.answered ? { respondedAt: new Date(madeAt.getTime() + 30 * 60_000) } : {}),
      expiresAt:
        shape.stillOpen === true
          ? new Date(Date.now() + 86_400_000)
          : new Date(madeAt.getTime() + 96 * 3_600_000),
    },
    select: { id: true },
  });
  madeOffers.push(row.id);
  return row;
}

describe('أرقامُ ردّ المعرض', () => {
  it('البذرةُ تبلغ العتبة — وإلّا لم تُفتح البطاقتان في أيّ شاشة', async () => {
    const { slug } = await dealerWithStock();
    const page = await getDealerPage(slug, 'ar');
    expect(page, 'صفحةُ المعرض يجب أن تُفتح').not.toBeNull();
    /**
     * **وما لا يُزرع لا يُرى**: بلا تاريخِ ردٍّ مزروع تبقى البطاقتان
     * غائبتين في كل بيئةٍ مزروعة، ولا يعرف أحدٌ أتعملان أم لا.
     */
    expect(page?.responses, 'لا تاريخَ ردٍّ مزروع لهذا المعرض').not.toBeNull();
    expect(page?.responses?.sample).toBeGreaterThanOrEqual(8);
    expect(page?.responses?.ratePct).toBeGreaterThanOrEqual(0);
    expect(page?.responses?.ratePct).toBeLessThanOrEqual(100);
  });

  /**
   * ═══ والحدُّ يُختبَر بتجاوزه ═══
   *
   * ثلاثةُ أشكالٍ لا تُحتسب، ولكلٍّ سببُه. ويُقاس أثرُ كلٍّ **بفرقِ
   * العيّنة قبلَه وبعده** لا برقمٍ مكتوب: البذرة تتغيّر، والعلاقة لا.
   */
  it('الآليُّ والمفتوحُ لا يُحتسبان، والمقصودُ يُحتسب', async () => {
    const { slug, listing } = await dealerWithStock();

    const before = (await getDealerPage(slug, 'ar'))?.responses;
    expect(before).not.toBeNull();

    /** ① رفضٌ آليّ — النظامُ ردّ لا البائع، فلا يرفع المعدَّل ولا يخفضه. */
    await offer(listing.id, listing.askPrice, { answered: false, auto: true });
    const afterAuto = (await getDealerPage(slug, 'ar'))?.responses;
    expect(afterAuto?.sample).toBe(before?.sample);

    /** ② عرضٌ لم يُردّ ولم تنقضِ مهلتُه — البائع ما زال في وقته. */
    await offer(listing.id, listing.askPrice, { answered: false, stillOpen: true });
    const afterOpen = (await getDealerPage(slug, 'ar'))?.responses;
    expect(afterOpen?.sample).toBe(before?.sample);

    /** ③ ردٌّ مقصود — يُحتسب في الطرفين. */
    await offer(listing.id, listing.askPrice, { answered: true });
    const afterAnswered = (await getDealerPage(slug, 'ar'))?.responses;
    expect(afterAnswered?.sample).toBe((before?.sample ?? 0) + 1);

    /** ④ وانقضاءٌ بلا ردّ — يُحتسب في المقام وحده، فيخفض المعدَّل. */
    await offer(listing.id, listing.askPrice, { answered: false });
    const afterMissed = (await getDealerPage(slug, 'ar'))?.responses;
    expect(afterMissed?.sample).toBe((before?.sample ?? 0) + 2);
    expect(afterMissed?.ratePct).toBeLessThan(afterAnswered?.ratePct ?? 101);
  });

  it('ترتيبُ المخزون يُبدّل الصفَّ الأوّل — ولا يسقط إلى الأحدث', async () => {
    const { slug } = await dealerWithStock();

    const [newest, cheapest, dearest] = await Promise.all([
      getDealerPage(slug, 'ar', null, null, 'newest'),
      getDealerPage(slug, 'ar', null, null, 'priceAsc'),
      getDealerPage(slug, 'ar', null, null, 'priceDesc'),
    ]);

    const price = (page: Awaited<ReturnType<typeof getDealerPage>>): number[] =>
      (page?.listings ?? []).map((row) => Number(row.price));

    expect(price(newest).length, 'لا مخزونَ يُرتَّب').toBeGreaterThan(1);
    expect([...price(cheapest)]).toEqual([...price(cheapest)].sort((a, b) => a - b));
    expect([...price(dearest)]).toEqual([...price(dearest)].sort((a, b) => b - a));
  });
});

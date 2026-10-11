import { afterAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { popularSearches } from '@/lib/domain/popular-searches';
import { parseFilters, searchListings } from '@/lib/domain/listings';

/**
 * ═══ شريحةٌ تُرسل إلى صفحةٍ فارغة ═══
 *
 * «شائع» تحت الباحث هو أوّل ما يُنقر في المنصّة — ونتيجةٌ فارغة **من
 * اقتراح المنصّة نفسها** تُقرأ «لا شيء هنا» لا «جرّب غيرها».
 *
 * ولا يمسكها اختبارٌ على الدالّة وحدها: المفتاح يُبنى هنا ويُقرأ في
 * `parseFilters` هناك، و**حرفٌ مختلف بينهما يُنتج ترشيحًا صامتًا**
 * يُهمل الشرط ويعرض كل شيء — أو لا شيء. فيُمشى الاستعلام إلى آخره.
 */

afterAll(async () => {
  await db.$disconnect();
});

describe('شرائح البحث الشائع', () => {
  it('كل شريحة تفتح على نتائج — ولا واحدة فارغة', async () => {
    const chips = await popularSearches();
    expect(chips.length).toBeGreaterThan(0);

    for (const chip of chips) {
      // وجهةُ المزادات ليست فهرس الإعلانات، ولها شرطها أدناه
      if (chip.path !== undefined) continue;

      const filters = parseFilters(new URLSearchParams(chip.query));
      const result = await searchListings(filters);

      expect(result.total, `${chip.label} → ?${chip.query}`).toBeGreaterThan(0);
    }
  });

  /**
   * **والمفتاح يُقرأ فعلًا.** `priceMax=50000` تُنتج نتائج حتى لو
   * أُهمل الشرط — فالفحص أن النتيجة **أضيق** من غير المرشَّح، وإلّا
   * فالترشيح لم يقع والشريحة تكذب.
   */
  it('الترشيح يقع — ونتيجة الشريحة أضيق من الكلّ', async () => {
    const chips = await popularSearches();
    const all = await searchListings(parseFilters(new URLSearchParams('')));

    for (const chip of chips) {
      if (chip.path !== undefined || chip.query === '') continue;

      const narrowed = await searchListings(parseFilters(new URLSearchParams(chip.query)));
      expect(narrowed.total, `${chip.label} لم يُضيّق`).toBeLessThan(all.total);
    }
  });

  /**
   * **والحالة وحدها لا تكفي متى كان لها وقت.** شريحة المزادات تظهر
   * بـ`LIVE` **وبقاءِ وقت** — ومزادٌ انقضى ولم تمرّ عليه الوظيفة
   * الدورية بعدُ يجعلها تَعِد بما لا يُفتح.
   */
  it('شريحة المزادات لا تظهر إلّا لمزادٍ حيٍّ لم ينقضِ', async () => {
    const chips = await popularSearches();
    const auctions = chips.filter((chip) => chip.path !== undefined);

    const open = await db.auction.count({
      where: { status: 'LIVE', endsAt: { gt: new Date() } },
    });

    expect(auctions.length).toBe(open > 0 ? 1 : 0);
  });
});

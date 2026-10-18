import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { db } from '@/lib/db';
import { MAX_CARD_BADGES } from '@/lib/catalog/badges';
import { EMPTY_FILTERS, searchListings } from '@/lib/domain/listings';

const ROOT = process.cwd();

/** كلُّ شاشةٍ تعرض `CarCard` — وما يُمنح لإحداها يُمنح لأخواتها. */
const SCREENS = [
  'src/app/[locale]/(site)/cars/SearchScreen.tsx',
  'src/app/[locale]/(site)/page.tsx',
  'src/app/[locale]/(site)/dealers/[slug]/page.tsx',
  'src/components/ui/toCardData.ts',
] as const;

/**
 * ═══ شارةٌ على البطاقة — وموضعٌ كان بلا قارئ ═══
 *
 * `card_badge` معرَّفٌ منذ A19 ويُضبط من لوحة الأدمن، **ولم يقرأه شيء
 * في المنتج كلِّه**: لا بطاقةَ تعرض ميزة. وهو الصنف نفسه الذي تكرّر
 * عشر مرّات — قيمةٌ في المخطّط لا يبلغها أحد. (طلب المالك ٢٠٢٦-١٠-١٨.)
 */
describe('شارة المميزات على بطاقة السيارة', () => {
  it('الموضع له ميزاتٌ موسومة — وإلا فالشارة لا تظهر أبدا', async () => {
    const flagged = await db.feature.count({
      where: { active: true, placements: { has: 'card_badge' } },
    });
    expect(flagged).toBeGreaterThan(0);
  });

  /**
   * ═══ **وشارةٌ على كل بطاقة ليست شارة** ═══
   *
   * والحدُّ في النطاق لا في الشاشة، فلا تختلف شاشتان في عدد ما
   * تعرضانه.
   *
   * **والشرطُ يُصنَع لا يُنتظَر.** أوّلُ صياغةٍ لهذا الاختبار سألت
   * «أكلُّ بطاقةٍ دون الحدّ؟» — وأكثرُ المزروع يحمل شارةً واحدة
   * وأقصاه اثنتان، فالجواب «نعم» مهما كان الحدّ. وقِيس برفع `take`
   * إلى تسعٍ **فبقي أخضر**: بوابةٌ عمياء. فيُزرع ثالثٌ ورابع، ثمّ
   * يُستعاد ما زُرع — فالاختبار يعيد ما غيّره.
   */
  it('والبحث يعيد ما لا يتجاوز الحد، وبترتيب الكتالوج', async () => {
    const flagged = await db.feature.findMany({
      where: { active: true, placements: { has: 'card_badge' } },
      orderBy: { sort: 'asc' },
      select: { key: true, sort: true },
    });
    expect(flagged.length).toBeGreaterThan(MAX_CARD_BADGES);

    const listing = await db.listing.findFirstOrThrow({
      where: { status: 'PUBLISHED' },
      orderBy: { createdAt: 'asc' },
      select: { id: true, ref: true },
    });
    const before = await db.listingFeature.findMany({
      where: { listingId: listing.id },
      select: { featureKey: true },
    });
    const had = new Set(before.map((row) => row.featureKey));
    const added = flagged.filter((row) => !had.has(row.key));

    try {
      if (added.length > 0) {
        await db.listingFeature.createMany({
          data: added.map((row) => ({ listingId: listing.id, featureKey: row.key })),
        });
      }

      const result = await searchListings({ ...EMPTY_FILTERS, limit: 60 }, undefined, 'ar');
      const shown = result.items.find((item) => item.ref === listing.ref);
      expect(shown).toBeDefined();
      /** يحمل الآن كلَّ الموسومة — والبطاقة تعرض اثنتين. */
      expect(shown?.badges.length).toBe(MAX_CARD_BADGES);

      /** والترتيبُ من `Feature.sort` — مصدرٌ واحد يملكه المشغّل. */
      const order = new Map(flagged.map((row) => [row.key, row.sort]));
      const keys = (shown?.badges ?? []).map((badge) => badge.key);
      expect(order.get(keys[0]!)).toBeLessThan(order.get(keys[1]!) ?? 0);
      /** وهما أصغرُ الموسومة ترتيبًا، لا أوّلُ ما ردّته القاعدة. */
      expect(keys).toEqual(flagged.slice(0, MAX_CARD_BADGES).map((row) => row.key));
    } finally {
      /** **والاختبار يعيد ما غيّره** — وإلّا أسقط جيرانه في التشغيل التالي. */
      await db.listingFeature.deleteMany({
        where: { listingId: listing.id, featureKey: { in: added.map((row) => row.key) } },
      });
    }
  });

  /** **والموسومةُ وحدها تصل** — ولا تُجلب تسعٌ وثلاثون لتُعرض اثنتان. */
  it('ولا تصل إلا الموسومة بالموضع', async () => {
    const result = await searchListings({ ...EMPTY_FILTERS, limit: 24 }, undefined, 'ar');
    const shown = [...new Set(result.items.flatMap((item) => item.badges.map((b) => b.key)))];
    if (shown.length === 0) return;

    const rows = await db.feature.findMany({
      where: { key: { in: shown } },
      select: { key: true, placements: true, active: true },
    });
    for (const row of rows) {
      expect(row.active).toBe(true);
      expect(row.placements).toContain('card_badge');
    }
  });

  /**
   * **وما يُمنح لبطاقةٍ يُمنح لأخواتها.** قائمةُ الماركات حملت الاسمَ
   * الإنجليزيّ وقائمتا الطراز والفئة لا، فمرّ ذلك على ٧٣ طرازًا
   * وانكشف على ٢٣٠. فالشاشاتُ الأربع تُفحص معًا.
   */
  it('وكل شاشة تعرض بطاقة تمرر الشارات', () => {
    const missing = SCREENS.filter(
      (screen) => !readFileSync(join(ROOT, screen), 'utf8').includes('badgeLabel'),
    );
    expect(missing).toEqual([]);
  });

  /** **والشكلان واحد**: بطاقةُ الشبكة وصفُّ القائمة يقرآن المكوّن نفسه. */
  it('وصف القائمة يعرضها كبطاقة الشبكة', () => {
    const card = readFileSync(join(ROOT, 'src/components/ui/CarCard.tsx'), 'utf8');
    expect(card).toContain('function BadgeRow');
    /** مرّتان: `CarCard` و`CarRow` — ونسختان تتباعدان أوّل تغيير. */
    expect(card.split('<BadgeRow badges={data.badges} />').length - 1).toBe(2);
  });
});

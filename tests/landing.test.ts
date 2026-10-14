import { afterAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { readFileSync } from 'node:fs';
import {
  MIN_LISTINGS,
  landingCombinations,
  landingContent,
  landingDepth,
  landingFallback,
} from '@/lib/domain/landing';
import { carTrail } from '@/lib/seo/car-trail';

afterAll(async () => {
  await db.$disconnect();
});

describe('صفحات الهبوط — لا تُولَّد إلا لتركيبةٍ قائمة', () => {
  /**
   * **صفحةٌ فارغة أسوأ من غيابها**: يصلها الباحث فيخرج، ويتعلّم المحرّك
   * أن الموقع يَعِد بما لا يملك — فتنخفض الصفحات التي تملك معه.
   */
  it('كل تركيبة تبلغ العتبة، ولا واحدة تحتها', async () => {
    const rows = await landingCombinations();
    expect(rows.length).toBeGreaterThan(0);
    /** **والعتبة تُقرأ من مصدرها** — ورقمٌ مكتوب هنا يكذب أوّل تغيير. */
    expect(rows.every((row) => row.count >= MIN_LISTINGS)).toBe(true);
  });

  it('الأعمّ يبقى ولو نفد الأخصّ — مدينة×ماركة بجانب مدينة×ماركة×طراز', async () => {
    const rows = await landingCombinations();
    expect(rows.some((row) => row.modelSlug === null)).toBe(true);
    // وعدد الأعمّ لا يقلّ عن أخصّه
    for (const specific of rows.filter((row) => row.modelSlug !== null)) {
      const general = rows.find(
        (row) =>
          row.modelSlug === null &&
          row.citySlug === specific.citySlug &&
          row.brandSlug === specific.brandSlug,
      );
      if (general !== undefined) expect(general.count).toBeGreaterThanOrEqual(specific.count);
    }
  });

  it('تركيبةٌ غير قائمة تعيد null — والصفحة ٤٠٤ لا فارغة', async () => {
    expect(await landingContent('لا-مدينة', 'لا-ماركة', null)).toBeNull();
  });

  it('المحتوى يحمل مدى السعر ومسار البحث المكافئ', async () => {
    const [first] = await landingCombinations();
    if (first === undefined) return;
    const content = await landingContent(first.citySlug, first.brandSlug, first.modelSlug);
    expect(content).not.toBeNull();
    expect(content?.searchQuery).toContain('city=');
    // الصفحة بوّابةٌ إلى البحث لا بديلٌ عنه
    expect(Number(content?.priceMin)).toBeLessThanOrEqual(Number(content?.priceMax));
  });
});

describe('صفحات الهبوط — وما نزل تحت العتبة يُحوَّل ولا يموت', () => {
  /**
   * ═══ العتبة تُفحص عند كل طلب ═══
   *
   * `MIN_LISTINGS` ثلاثةٌ **عند التوليد**، والفحص يقع على بيانات
   * اللحظة — فالتركيبة المنشورة في `sitemap.xml` اليوم تردّ ٤٠٤ غدًا
   * متى بِيعت مركبة. وقِيس: `/browse/riyadh/toyota` كان ٤٠٤ **وفي
   * الرياض تويوتا منشورة**.
   *
   * > **ورابطٌ نشرتَه بنفسك ثم أمَتَّه أسوأ من رابطٍ لم يُنشر.**
   */
  it('كل تركيبةٍ دون العتبة تُعطي وجهة بحث بمرشّحاتها', async () => {
    const all = await landingCombinations(1);
    const worthy = new Set(
      (await landingCombinations()).map(
        (row) => `${row.citySlug}|${row.brandSlug}|${row.modelSlug ?? ''}`,
      ),
    );
    const below = all.filter(
      (row) => row.modelSlug === null && !worthy.has(`${row.citySlug}|${row.brandSlug}|`),
    );

    /**
     * **ولا يُتخطّى بصمت.** `if (…) return` يجعل الاختبار يمرّ خضرًا
     * وهو لا يقيس شيئًا متى تبدّلت البذرة — فالشرط يُعلَن ويسقط باسمه.
     */
    expect(below.length, 'لا تركيبة دون العتبة في البذرة — فالاختبار بلا مقيس')
      .toBeGreaterThan(0);

    /**
     * **والحكم على المجموعة كلّها لا على أوّلها.** اختيارُ «أوّل ما
     * وُجد» يجعل المقيس يتبدّل بتبدّل عدّاداتٍ تكتبها ملفّاتٌ أخرى في
     * التشغيل نفسه — فيمرّ مرّةً ويسقط مرّة، ولا يقول أيُّها سقط.
     */
    for (const row of below) {
      const where = `${row.citySlug}/${row.brandSlug}`;
      expect(await landingContent(row.citySlug, row.brandSlug, null), where).toBeNull();

      const fallback = await landingFallback(row.citySlug, row.brandSlug, null);
      // والوجهة تحمل مرشّحاتها: `/cars` عاريةً تُلقي الزائر في كل السوق
      expect(fallback, where).toContain('city=');
      expect(fallback, where).toContain('brandId=');
    }
  });

  it('وما لا شيء خلفه يبقى بلا وجهة — فتُردّ ٤٠٤', async () => {
    expect(await landingFallback('nowhere-at-all', 'toyota', null)).toBeNull();
    expect(await landingFallback('riyadh', 'no-such-brand', null)).toBeNull();
  });

  it('والقائمة المستحقّة لا تتأثّر — العتبة الافتراضية كما هي', async () => {
    const worthy = await landingCombinations();
    expect(worthy.every((row) => row.count >= MIN_LISTINGS)).toBe(true);
    // وبواحدة تُرجع ما هو أكثر أو مثله — لا أقلّ
    expect((await landingCombinations(1)).length).toBeGreaterThanOrEqual(worthy.length);
  });
});

/**
 * ═══ وما أُضيف ٢٠٢٦-١٠-١٤ ═══
 *
 * الفُتاتُ المعلَن كان يشير إلى `/cars/{مدينة}/{ماركة}` — **مسارٌ لا
 * وجود له**، والمسار الحقيقيّ هو صفحةُ الهبوط. وما تحته يحرس أن
 * تُعلَن العقدةُ حين لها صفحة وحدها.
 */

describe('العدُّ السريع للعتبة — `landingDepth`', () => {
  /**
   * **و`landingDepth` تقول ما تقوله التركيبات.** هي الأرخص (عدٌّ يقف
   * عند العتبة) وتُنادى في كل فتحٍ لصفحة مركبة، فلو خالفت لأعلنّا
   * عقدةً لا صفحة لها — أو أخفينا صفحةً قائمة.
   */
  it('والعدّ السريع يوافق التركيبات', async () => {
    const combinations = await landingCombinations();
    const brandLevel = combinations.find((entry) => entry.modelSlug === null);
    expect(brandLevel).toBeDefined();
    if (brandLevel === undefined) return;

    const listing = await db.listing.findFirstOrThrow({
      where: {
        status: 'PUBLISHED',
        city: brandLevel.city,
        vehicle: { brandName: brandLevel.brand },
      },
      select: { city: true, vehicle: { select: { brandId: true, modelId: true } } },
    });

    const depth = await landingDepth(
      listing.city,
      listing.vehicle.brandId,
      listing.vehicle.modelId,
    );
    expect(depth.brand).toBe(true);
  });

  it('ومركبةٌ في مدينةٍ بلا تركيبة لا تُعلن عقدةً', async () => {
    /** مدينةٌ لا إعلان فيها أصلًا — فلا ماركة تبلغ العتبة فيها. */
    const depth = await landingDepth('مدينة لا وجود لها', 'no-such-brand', null);
    expect(depth.brand).toBe(false);
    expect(depth.model).toBe(false);
  });

  /**
   * **ولا يُسأل عن الطراز قبل ماركته.** الأخصّ لا يفوق الأعمّ: تركيبةٌ
   * للطراز بلا تركيبةٍ لماركته تُنتج فُتاتًا يقفز عقدةً.
   */
  it('ولا طرازَ فوق ماركةٍ لم تبلغ', async () => {
    const depth = await landingDepth('مدينة لا وجود لها', 'no-such-brand', 'no-such-model');
    expect(depth.model).toBe(false);
  });
});

/**
 * ═══ والزرع يبلغ العتبة عمدًا ═══
 *
 * قِيس على الزرع: **أكبرُ تركيبةِ مدينة×ماركة×طراز اثنان** — دون
 * العتبة. فصفحةُ الطراز موجودةٌ في المنتج ولا تُفتح في أي بيئة تطوير،
 * وبقي فيها عيبٌ أُصلح في أختها (الشبكة الغائبة) حتى بُحث عنها.
 *
 * **وما لا يُزرع لا يُرى** — فتُثبَّت الثلاثة الأولى على مدينةٍ وطراز.
 */
describe('زرعُ تركيبةٍ للطراز', () => {
  it('الإعلانات الأولى مثبّتةٌ على مدينةٍ وطرازٍ واحد', () => {
    const seed = readFileSync(new URL('../prisma/seed.ts', import.meta.url), 'utf8');
    expect(seed).toContain('const PLANTED = 3');
    expect(seed).toContain('i < PLANTED ? (buildableTrims[0]');
    expect(seed).toContain('i < PLANTED ? (CITIES[0]');
  });
});

/**
 * ═══ ولا عقدةَ بلا صفحة ═══
 *
 * القاعدة تُفحص على الدالّة الخالصة لا على الصفحة: كلُّ `item` في
 * الفُتات مسارٌ للمنتج. و`/cars/{مدينة}/{ماركة}` **ليست مسارًا** —
 * وكانت تُعلَن ثلاثَ مرّات في كل صفحة مركبة وتردّ ٤٠٤ ثلاثتُها.
 */
describe('فُتاتُ صفحة المركبة', () => {
  const canonical = {
    city: 'riyadh',
    brand: 'toyota',
    model: 'camry',
    ref: 'ADS2026A0001',
    path: '/ar/cars/riyadh/toyota/camry/ADS2026A0001',
    display: '/ar/cars/riyadh/toyota/camry/ADS2026A0001',
  };
  const base = {
    site: 'https://carz.sa',
    locale: 'ar',
    url: 'https://carz.sa/ar/cars/riyadh/toyota/camry/ADS2026A0001',
    city: 'الرياض',
    brandName: 'تويوتا',
    modelName: 'كامري',
    ref: 'ADS2026A0001',
    canonical,
  };

  /** الشكل الذي كان يُعلَن ولا وجود له. */
  const GHOST = /\/cars\/[^/?]+\/[^/?]+/;

  it('بلا صفحة هبوط: المدينة على البحث، ولا عقدةَ ماركةٍ ولا طراز', () => {
    const trail = carTrail({ ...base, landing: { brand: false, model: false } });
    expect(trail.map((entry) => entry.name)).toEqual(['CARZ', 'الرياض', 'ADS2026A0001']);
    for (const entry of trail.slice(0, -1)) {
      expect(GHOST.test(entry.item), entry.item).toBe(false);
    }
  });

  it('وبصفحة الماركة: العقدة على `/browse/` لا على `/cars/`', () => {
    const trail = carTrail({ ...base, landing: { brand: true, model: false } });
    expect(trail[2]?.item).toBe('https://carz.sa/ar/browse/riyadh/toyota');
    expect(trail).toHaveLength(4);
  });

  it('وبصفحة الطراز: خمسُ عقد، وآخرها المركبة', () => {
    const trail = carTrail({ ...base, landing: { brand: true, model: true } });
    expect(trail).toHaveLength(5);
    expect(trail[3]?.item).toBe('https://carz.sa/ar/browse/riyadh/toyota/camry');
    expect(trail[4]?.item).toBe(base.url);
  });

  /** **والمركبة نفسها آخرُ عقدة دائمًا** — الفُتات ينتهي حيث أنت. */
  it('والعقدة الأخيرة هي الصفحة نفسها في كل الأحوال', () => {
    for (const landing of [
      { brand: false, model: false },
      { brand: true, model: false },
      { brand: true, model: true },
    ]) {
      const trail = carTrail({ ...base, landing });
      expect(trail[trail.length - 1]?.item).toBe(base.url);
    }
  });
});

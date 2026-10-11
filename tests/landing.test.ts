import { afterAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { landingCombinations, landingContent, landingFallback } from '@/lib/domain/landing';

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
    expect(rows.every((row) => row.count >= 3)).toBe(true);
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
    expect(worthy.every((row) => row.count >= 3)).toBe(true);
    // وبواحدة تُرجع ما هو أكثر أو مثله — لا أقلّ
    expect((await landingCombinations(1)).length).toBeGreaterThanOrEqual(worthy.length);
  });
});

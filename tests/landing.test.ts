import { afterAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { landingCombinations, landingContent } from '@/lib/domain/landing';

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

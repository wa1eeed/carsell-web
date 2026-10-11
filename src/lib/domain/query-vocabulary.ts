import { db } from '@/lib/db';
import { parseQuery, type ParsedQuery, type Vocabulary } from './query-parse';

/**
 * مفردات المحلّل — **من الكتالوج لا من قائمةٍ مكتوبة بيد**.
 *
 * وماركةٌ تُضاف من شاشة الأدمن تصير مفهومةً في الجملة في اللحظة
 * نفسها. وقائمةٌ ثابتة كانت ستتقادم أوّل إضافة، فيكتب الزائر اسمًا
 * يراه في الفلاتر ويُقال له «لم نفهم».
 *
 * **والمدن من الإعلانات القائمة**: مدينةٌ لا إعلان فيها ليست مفردة —
 * فهمُها يُنتج نتيجةً فارغة، وهي أسوأ من ألّا تُفهم.
 */
export async function loadVocabulary(): Promise<Vocabulary> {
  const [brands, models, cities] = await Promise.all([
    db.brand.findMany({ where: { visible: true }, select: { id: true, nameAr: true, nameEn: true } }),
    db.model.findMany({
      where: { brand: { visible: true } },
      select: { id: true, brandId: true, nameAr: true, nameEn: true },
    }),
    db.listing
      .groupBy({ by: ['city'], where: { status: 'PUBLISHED' } })
      .then((rows) => rows.map((row) => row.city)),
  ]);

  return {
    brands: brands.map((row) => ({ id: row.id, names: [row.nameAr, row.nameEn] })),
    models: models.map((row) => ({
      id: row.id,
      brandId: row.brandId,
      names: [row.nameAr, row.nameEn],
    })),
    cities,
  };
}

/** يقرأ الجملة بمفردات الكتالوج — والنتيجة بيانات، والصياغة في الشاشة. */
export async function understand(text: string): Promise<ParsedQuery> {
  if (text.trim() === '') return { chips: [], rest: '' };
  return parseQuery(text, await loadVocabulary());
}

import { db } from '@/lib/db';
import { fromSlug, toSlug } from './listing-detail';

/**
 * ═══ صفحات الهبوط — مدينة × ماركة × طراز ═══
 *
 * **ولا تُولَّد إلا لتركيبةٍ لها إعلانات فعلًا.** صفحةٌ فارغة أسوأ من
 * غيابها: يصلها الباحث فيجد لا شيء ويخرج، ويتعلّم محرّك البحث أن الموقع
 * يَعِد بما لا يملك — فتنخفض الصفحات التي تملك معه.
 *
 * والعتبة `MIN_LISTINGS` لا صفرًا: مركبةٌ واحدة تُنشئ صفحةً تختفي حين
 * تُباع، والرابط الذي يموت بعد أسبوع أسوأ من رابطٍ لم يُنشأ.
 */

const MIN_LISTINGS = 3;

export type LandingKey = {
  citySlug: string;
  city: string;
  brandSlug: string;
  brand: string;
  modelSlug: string | null;
  model: string | null;
  count: number;
};

/**
 * التركيبات القائمة — تُقرأ من الإعلانات المنشورة لا من جدول مُعَدّ.
 *
 * وجدولٌ مُعَدّ يصف السوق يوم أُعِدّ، ثم يعرض صفحاتٍ لتركيباتٍ نفدت
 * ويُخفي ما ظهر.
 */
export async function landingCombinations(): Promise<LandingKey[]> {
  const rows = await db.listing.findMany({
    where: { status: 'PUBLISHED' },
    select: {
      city: true,
      vehicle: {
        select: { brandName: true, modelName: true, brand: { select: { slug: true } } },
      },
    },
  });

  const byKey = new Map<string, LandingKey>();

  for (const row of rows) {
    const citySlug = toSlug(row.city);
    const brandSlug = row.vehicle.brand?.slug ?? toSlug(row.vehicle.brandName);
    const modelSlug = toSlug(row.vehicle.modelName);

    // مدينة × ماركة، ثم مدينة × ماركة × طراز — الأعمّ يبقى ولو نفد الأخصّ
    for (const entry of [
      { modelSlug: null, model: null },
      { modelSlug, model: row.vehicle.modelName },
    ]) {
      const key = `${citySlug}|${brandSlug}|${entry.modelSlug ?? ''}`;
      const found = byKey.get(key);
      if (found === undefined) {
        byKey.set(key, {
          citySlug,
          city: row.city,
          brandSlug,
          brand: row.vehicle.brandName,
          modelSlug: entry.modelSlug,
          model: entry.model,
          count: 1,
        });
      } else {
        found.count += 1;
      }
    }
  }

  return [...byKey.values()]
    .filter((entry) => entry.count >= MIN_LISTINGS)
    .sort((a, b) => b.count - a.count);
}

export type LandingContent = LandingKey & {
  /** ما يُبنى منه العنوان والوصف — والصياغة في الشاشة. */
  priceMin: string | null;
  priceMax: string | null;
  inspectedCount: number;
  /** مسار البحث المكافئ — الصفحة بوّابةٌ إليه لا بديلٌ عنه. */
  searchQuery: string;
};

/** يعيد `null` حين تنفد التركيبة — والصفحة حينها ٤٠٤ لا صفحةٌ فارغة. */
export async function landingContent(
  rawCity: string,
  rawBrand: string,
  rawModel: string | null,
): Promise<LandingContent | null> {
  /**
   * **الفكّ هنا لا في الشاشة.** أجزاء المسار تصل مُرمَّزة، والمقارنة
   * بالنصّ المفكوك تفشل صامتةً فتصير الصفحة ٤٠٤ بلا خطأ في أي سجلّ.
   * والدالّة التي تقارن هي التي تُطبّع — فلا يخطئ مستدعٍ.
   */
  const citySlug = fromSlug(rawCity);
  const brandSlug = fromSlug(rawBrand);
  const modelSlug = rawModel === null ? null : fromSlug(rawModel);

  const combinations = await landingCombinations();
  const match = combinations.find(
    (entry) =>
      entry.citySlug === citySlug &&
      entry.brandSlug === brandSlug &&
      entry.modelSlug === modelSlug,
  );
  if (match === undefined) return null;

  const where = {
    status: 'PUBLISHED' as const,
    city: match.city,
    vehicle: {
      brandName: match.brand,
      ...(match.model === null ? {} : { modelName: match.model }),
    },
  };

  const [bounds, inspectedCount, brandId, modelId] = await Promise.all([
    db.listing.aggregate({ where, _min: { askPrice: true }, _max: { askPrice: true } }),
    db.listing.count({
      where: { ...where, vehicle: { ...where.vehicle, inspectionReports: { some: {} } } },
    }),
    db.brand.findFirst({ where: { slug: brandSlug }, select: { id: true } }),
    match.model === null
      ? Promise.resolve(null)
      : db.model.findFirst({ where: { nameAr: match.model }, select: { id: true } }),
  ]);

  const params = new URLSearchParams({ city: match.city });
  if (brandId !== null) params.set('brandId', brandId.id);
  if (modelId !== null) params.set('modelId', modelId.id);

  return {
    ...match,
    priceMin: bounds._min.askPrice?.toString() ?? null,
    priceMax: bounds._max.askPrice?.toString() ?? null,
    inspectedCount,
    searchQuery: params.toString(),
  };
}

/**
 * طرازات مدينةٍ وماركة — **والشاشة لا تُقارن مقاطع بنفسها**.
 *
 * وقد فعلتْ أوّلًا فرشّحت بالمقطع المُرمَّز فخرجت القائمة فارغة بلا
 * خطأ. فكلّ مقارنةٍ للمقاطع صارت هنا، حيث الفكّ مضمون.
 */
export async function landingSiblings(
  rawCity: string,
  rawBrand: string,
  limit = 12,
): Promise<LandingKey[]> {
  const citySlug = fromSlug(rawCity);
  const brandSlug = fromSlug(rawBrand);

  return (await landingCombinations())
    .filter(
      (entry) =>
        entry.citySlug === citySlug &&
        entry.brandSlug === brandSlug &&
        entry.modelSlug !== null,
    )
    .slice(0, limit);
}

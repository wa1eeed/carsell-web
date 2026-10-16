import { db } from '@/lib/db';

/**
 * ═══ «شائع» — خمسةُ مداخل بنقرة واحدة ═══
 *
 * التصميم يضع تحت الباحث صفًّا: «كامري ٢٠٢٤ · باترول · أقل من ٥٠ ألف ·
 * كهربائية · مزادات اليوم». ولم يُبنَ — فالزائر الأوّل يجد استمارةً
 * بأربعة حقول ولا يجد مدخلًا واحدًا يُنقر.
 *
 * ═══ وتُشتقّ من المخزون لا تُكتب ═══
 *
 * شريحةٌ ثابتة تُرسل إلى صفحةٍ فارغة أوّل ما ينفد الطراز — **ونتيجةٌ
 * فارغة من اقتراحِ المنصّة نفسها أسوأ من بحثٍ خائب**: الزائر يقرؤها
 * «لا شيء هنا» لا «جرّب غيرها». فكلُّ شريحة تُبنى من صفٍّ قائم،
 * وتُحذف حين يفرغ ما تشير إليه.
 */

export type PopularSearch = {
  label: string;
  /**
   * ═══ واسمُ الطراز له إنجليزيّةٌ في الكتالوج ═══
   *
   * الشريحة تُبنى من `modelName` — وهي لقطةٌ عربية على المركبة —
   * فتُطبع «باترول» و«مازدا ٣» في صفحةٍ إنجليزية كاملة. و`Model`
   * يحمل `nameEn` منذ بُني.
   *
   * و`undefined` لما لا اسم ثانيَ له (السعر والوقود يصوغهما المنادي).
   */
  labelEn?: string;
  /** استعلامٌ جاهز — والوجهة تُبنى في الشاشة لتحمل اللغة. */
  query: string;
  /** المزادات وجهتُها غير الفهرس. */
  path?: string;
};

/** حدود شريحة السعر — وتُختار واحدةٌ فيها مخزونٌ فعليّ. */
const PRICE_BANDS = [50_000, 100_000, 150_000] as const;

export async function popularSearches(limit = 5): Promise<PopularSearch[]> {
  const published = { status: 'PUBLISHED' as const };

  const [models, fuels, bands, liveAuctions] = await Promise.all([
    /**
     * أكثر طرازين عرضًا — **بالاسم الذي يبحث به الناس**. و`modelName`
     * لقطةٌ في المركبة لا علاقة، فلا استعلام ثانٍ للكتالوج.
     */
    db.vehicle.groupBy({
      by: ['modelId', 'modelName'],
      where: { listings: { some: published } },
      _count: { _all: true },
      orderBy: { _count: { modelId: 'desc' } },
      take: 2,
    }),

    db.vehicle.groupBy({
      by: ['fuel'],
      where: { fuel: { in: ['ELECTRIC', 'HYBRID'] }, listings: { some: published } },
      _count: { _all: true },
      orderBy: { _count: { fuel: 'desc' } },
      take: 1,
    }),

    Promise.all(
      PRICE_BANDS.map(async (ceiling) => ({
        ceiling,
        count: await db.listing.count({ where: { ...published, askPrice: { lte: ceiling } } }),
      })),
    ),

    /**
     * **والحالة وحدها لا تكفي متى كان لها وقت.** مزادٌ `LIVE` انقضى
     * وقتُه ولم تمرّ الوظيفة الدورية بعدُ يُعدّ جاريًا — فتقول الشريحة
     * «مزادات اليوم» وتفتح على لا شيء.
     */
    db.auction.count({ where: { status: 'LIVE', endsAt: { gt: new Date() } } }),
  ]);

  const chips: PopularSearch[] = [];

  /** والإنجليزيّة من الكتالوج — استعلامٌ واحدٌ للطرازين لا لكلٍّ. */
  const catalogue = await db.model.findMany({
    where: { id: { in: models.map((row) => row.modelId) } },
    select: { id: true, nameEn: true },
  });
  const englishOf = new Map(catalogue.map((row) => [row.id, row.nameEn]));

  for (const model of models) {
    if (model._count._all === 0) continue;
    const nameEn = englishOf.get(model.modelId);
    chips.push({
      label: model.modelName,
      ...(nameEn === undefined || nameEn === '' ? {} : { labelEn: nameEn }),
      query: `modelId=${model.modelId}`,
    });
  }

  /** أصغر شريحةٍ فيها مخزونٌ معتبَر — ونطاقٌ بسيارةٍ واحدة ليس شائعًا. */
  const band = bands.find((row) => row.count >= 3);
  if (band !== undefined) {
    chips.push({
      /** الرقم في التسمية يصوغه المنادي — فالنطاق لا يعرف لغة العرض. */
      label: `priceMax:${String(band.ceiling)}`,
      query: `priceMax=${String(band.ceiling)}`,
    });
  }

  const fuel = fuels[0];
  if (fuel !== undefined && fuel._count._all > 0) {
    chips.push({ label: `fuel:${fuel.fuel}`, query: `fuel=${fuel.fuel}` });
  }

  if (liveAuctions > 0) {
    chips.push({ label: 'auctions', query: '', path: '/auctions' });
  }

  return chips.slice(0, limit);
}

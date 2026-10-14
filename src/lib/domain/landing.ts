import { db } from '@/lib/db';
import { citySlug as citySlugOf, modelSlug as modelSlugOf } from './slugs';
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

export const MIN_LISTINGS = 3;

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
export async function landingCombinations(min = MIN_LISTINGS): Promise<LandingKey[]> {
  const rows = await db.listing.findMany({
    where: { status: 'PUBLISHED' },
    select: {
      city: true,
      vehicle: {
        select: { brandName: true, modelName: true, brand: { select: { slug: true } },
          model: { select: { nameEn: true } } },
      },
    },
  });

  const byKey = new Map<string, LandingKey>();

  for (const row of rows) {
    /**
     * **ومقاطع الهبوط لاتينيةٌ كصفحة السيارة.** كانت تُبنى بـ`toSlug`
     * فتبقى عربية (`/browse/الرياض/toyota`)، وصفحةُ المركبة صارت
     * `riyadh` — فمسارٌ واحد بوجهين، وأحدهما يردّ ٤٠٤ على الآخر.
     */
    const city = citySlugOf(row.city);
    const brandSlug = row.vehicle.brand?.slug ?? toSlug(row.vehicle.brandName);
    const modelSlug = modelSlugOf({
      nameAr: row.vehicle.modelName,
      nameEn: row.vehicle.model?.nameEn ?? null,
    });

    // مدينة × ماركة، ثم مدينة × ماركة × طراز — الأعمّ يبقى ولو نفد الأخصّ
    for (const entry of [
      { modelSlug: null, model: null },
      { modelSlug, model: row.vehicle.modelName },
    ]) {
      const key = `${city}|${brandSlug}|${entry.modelSlug ?? ''}`;
      const found = byKey.get(key);
      if (found === undefined) {
        byKey.set(key, {
          citySlug: city,
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
    .filter((entry) => entry.count >= min)
    .sort((a, b) => b.count - a.count);
}

export type LandingContent = LandingKey & {
  /** ما يُبنى منه العنوان والوصف — والصياغة في الشاشة. */
  priceMin: string | null;
  priceMax: string | null;
  inspectedCount: number;
  /** مسار البحث المكافئ — الصفحة بوّابةٌ إليه لا بديلٌ عنه. */
  searchQuery: string;
  /**
   * معرّفا الماركة والطراز — **يُحسبان للبحث ثم يُهملان**.
   * والصفحة تحتاجهما لتعرض شبكتها بنفسها لا لتُحيل إلى غيرها.
   */
  brandId: string | null;
  modelId: string | null;
  /** وُصل إليها برابطٍ قديم — فتُحوَّل إلى المعياريّ. */
  legacySlug: boolean;
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

  /**
   * ═══ والمقطع العربيّ القديم لا يُترك ٤٠٤ ═══
   *
   * الروابط كانت `/browse/الرياض/toyota` وصارت `/browse/riyadh/toyota`،
   * وما فُهرس منها وما نُسخ في محادثةٍ يبقى بالقديم. وصفحةُ المركبة
   * تُحوّل نفسها ٣٠١ — فالهبوط تفعل مثلها، وإلّا أسقطنا ما بُني من
   * فهرسةٍ بتغييرٍ تجميليّ.
   *
   * فحين لا تطابق المقاطع، تُجرَّب **بأسماء المدن والطرازات العربية**:
   * فإن طابقت رُدَّت التركيبة ومعها `canonicalSlugs` ليُحوّل المستدعي.
   */
  const legacy =
    match !== undefined
      ? undefined
      : combinations.find(
          (entry) =>
            toSlug(entry.city) === citySlug &&
            entry.brandSlug === brandSlug &&
            (modelSlug === null
              ? entry.modelSlug === null
              : entry.model !== null && toSlug(entry.model) === modelSlug),
        );

  const picked = match ?? legacy;
  if (picked === undefined) return null;

  const where = {
    status: 'PUBLISHED' as const,
    city: picked.city,
    vehicle: {
      brandName: picked.brand,
      ...(picked.model === null ? {} : { modelName: picked.model }),
    },
  };

  const [bounds, inspectedCount, brandId, modelId] = await Promise.all([
    db.listing.aggregate({ where, _min: { askPrice: true }, _max: { askPrice: true } }),
    db.listing.count({
      where: { ...where, vehicle: { ...where.vehicle, inspectionReports: { some: {} } } },
    }),
    db.brand.findFirst({ where: { slug: brandSlug }, select: { id: true } }),
    picked.model === null
      ? Promise.resolve(null)
      : db.model.findFirst({ where: { nameAr: picked.model }, select: { id: true } }),
  ]);

  const params = new URLSearchParams({ city: picked.city });
  if (brandId !== null) params.set('brandId', brandId.id);
  if (modelId !== null) params.set('modelId', modelId.id);

  return {
    ...picked,
    /**
     * **ووصلنا إليها بالمقطع العربيّ القديم.** الشاشة تُحوّل ٣٠١ إلى
     * المعياريّ، فما فُهرس بالقديم ينتقل ولا يُفقد.
     */
    legacySlug: legacy !== undefined,
    brandId: brandId?.id ?? null,
    modelId: modelId?.id ?? null,
    priceMin: bounds._min.askPrice?.toString() ?? null,
    priceMax: bounds._max.askPrice?.toString() ?? null,
    inspectedCount,
    searchQuery: params.toString(),
  };
}

/**
 * ═══ وما نزل تحت العتبة يُحوَّل ولا يموت ═══
 *
 * العتبة ثلاثةٌ **عند التوليد**، والفحص يقع عند كل طلب على بيانات
 * اللحظة — فالتركيبة المنشورة في `sitemap.xml` اليوم تردّ ٤٠٤ غدًا
 * متى بِيعت مركبة. وقد قِيس: `/browse/riyadh/toyota` ٤٠٤ **وفي
 * الرياض تويوتان منشورتان**.
 *
 * والفرق بين «لا تستحقّ صفحةً» و«لا شيء هنا» حقيقيّ: الأولى عندها
 * نتائج يصلها الزائر من البحث، والثانية لا. فالأولى تُحوَّل ٣٠١ إلى
 * البحث بمرشّحاتها — فلا يُفقد ما فُهرس، ولا يُقابَل الزائر بباب
 * مغلق وخلفه مركبتان.
 *
 * > **ورابطٌ نشرتَه بنفسك ثم أمَتَّه أسوأ من رابطٍ لم يُنشر.**
 */
export async function landingFallback(
  rawCity: string,
  rawBrand: string,
  rawModel: string | null,
): Promise<string | null> {
  const citySlug = fromSlug(rawCity);
  const brandSlug = fromSlug(rawBrand);
  const modelSlug = rawModel === null ? null : fromSlug(rawModel);

  // بواحدة: أيّ تركيبةٍ لها إعلانٌ منشور — لا التي تستحقّ صفحة
  const any = await landingCombinations(1);
  const picked = any.find(
    (entry) =>
      entry.citySlug === citySlug
      && entry.brandSlug === brandSlug
      && entry.modelSlug === modelSlug,
  ) ?? any.find(
    (entry) =>
      toSlug(entry.city) === citySlug
      && entry.brandSlug === brandSlug
      && (modelSlug === null
        ? entry.modelSlug === null
        : entry.model !== null && toSlug(entry.model) === modelSlug),
  );

  if (picked === undefined) return null;

  const [brand, model] = await Promise.all([
    db.brand.findFirst({ where: { slug: picked.brandSlug }, select: { id: true } }),
    picked.model === null
      ? Promise.resolve(null)
      : db.model.findFirst({ where: { nameAr: picked.model }, select: { id: true } }),
  ]);

  const params = new URLSearchParams({ city: picked.city });
  if (brand !== null) params.set('brandId', brand.id);
  if (model !== null) params.set('modelId', model.id);
  return `/cars?${params.toString()}`;
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

/**
 * ═══ أثمّة صفحةُ هبوطٍ لهذه المركبة؟ ═══
 *
 * **ومسارُ الفُتات في البيانات المنظَّمة كان يُعلن ٤٠٤.** صفحةُ المركبة
 * تُصدِر `BreadcrumbList` إلى `/cars/{المدينة}/{الماركة}` و
 * `/cars/{المدينة}/{الماركة}/{الطراز}` — **وثلاثتُها غير موجودة**:
 * المسار الحقيقيّ للمدينة×الماركة هو `/browse/…`. فنُعلن لمحرّك البحث
 * صفحاتٍ لا نملكها، وهو الصنف الذي أُصلح مرارًا في الشاشات — ههنا
 * معلَنًا لآلةٍ لا لإنسان، فلا يشكو منه أحد.
 *
 * فيُسأل قبل الإعلان: أللتركيبة إعلاناتٌ تبلغ العتبة؟ وعدَّان رخيصان
 * (`take` عند العتبة فلا يُقرأ الجدول كلّه)، لا `landingCombinations`
 * التي تقرأ كل منشور.
 */
export async function landingDepth(
  city: string,
  brandId: string,
  modelId: string | null,
): Promise<{ brand: boolean; model: boolean }> {
  const enough = async (where: { brandId: string; modelId?: string }): Promise<boolean> =>
    (
      await db.listing.findMany({
        where: { status: 'PUBLISHED', city, vehicle: where },
        select: { id: true },
        take: MIN_LISTINGS,
      })
    ).length >= MIN_LISTINGS;

  const brand = await enough({ brandId });
  /** ولا يُسأل عن الطراز إن لم تبلغ ماركتُه — الأخصّ لا يفوق الأعمّ. */
  const model = brand && modelId !== null ? await enough({ brandId, modelId }) : false;
  return { brand, model };
}

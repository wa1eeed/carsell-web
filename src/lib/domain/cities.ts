import { db } from '@/lib/db';

/**
 * ═══ المدنُ من القاعدة لا من ثابت ═══
 *
 * طلبُ المالك ٢٠٢٦-١١-٢٥: المدنُ من «الإعدادات الأساسية المطلوبة
 * لتشغيل المنصة». وكانت ستًّا وعشرين مدينةً مكتوبةً في
 * `labels/cities.ts` — **لا تُضاف إليها واحدةٌ بلا نشر**.
 *
 * **و`CITY_SLUG` يبقى احتياطًا لا مصدرًا**: صفوفٌ كُتبت قبل الجدول
 * تحمل أسماءً قد لا تكون فيه، واشتقاقُ مقطعِها يجب أن يعمل — فما لا
 * جدولَ له يسقط إلى الخريطة ثمّ إلى العربية.
 */
export type CityRow = {
  id: string;
  nameAr: string;
  nameEn: string;
  slug: string;
  region: string;
  visible: boolean;
};

/** المدنُ المعروضة — بترتيب المشغّل. */
export async function visibleCities(): Promise<CityRow[]> {
  return db.city.findMany({
    where: { visible: true },
    orderBy: [{ sort: 'asc' }, { nameAr: 'asc' }],
    select: { id: true, nameAr: true, nameEn: true, slug: true, region: true, visible: true },
  });
}

/** كلُّ المدن — للوحة، فالمخفيّةُ تُرى لتُعاد. */
export async function allCities(): Promise<(CityRow & { sort: number; listings: number })[]> {
  const [rows, counts] = await Promise.all([
    db.city.findMany({ orderBy: [{ sort: 'asc' }, { nameAr: 'asc' }] }),
    /**
     * **وعددُ الإعلانات بجوار المدينة** — فمن يُخفي مدينةً يرى ما
     * يُخفيه معها. وإخفاءُ مدينةٍ فيها إعلانات يُسقطها من المرشّح
     * وتبقى إعلاناتُها معروضةً بلا باب.
     */
    db.listing.groupBy({ by: ['city'], _count: { _all: true } }),
  ]);

  const byCity = new Map(counts.map((row) => [row.city, row._count._all]));
  return rows.map((row) => ({
    id: row.id,
    nameAr: row.nameAr,
    nameEn: row.nameEn,
    slug: row.slug,
    region: row.region,
    visible: row.visible,
    sort: row.sort,
    listings: byCity.get(row.nameAr) ?? 0,
  }));
}

export type CityFailure = 'NAME_REQUIRED' | 'SLUG_TAKEN' | 'NAME_TAKEN' | 'NOT_FOUND' | 'HAS_LISTINGS';

export async function upsertCity(input: {
  id?: string;
  nameAr: string;
  nameEn: string;
  slug: string;
  region: string;
  sort: number;
  visible: boolean;
}): Promise<{ ok: true; id: string } | { ok: false; reason: CityFailure }> {
  const nameAr = input.nameAr.trim();
  const slug = input.slug.trim().toLowerCase();
  if (nameAr === '' || slug === '' || input.region.trim() === '') {
    return { ok: false, reason: 'NAME_REQUIRED' };
  }

  /** **والتصادمُ يُسمّى بحقله** — «مكرّر» وحدها تجعله يبدّل الاثنين. */
  const [byName, bySlug] = await Promise.all([
    db.city.findUnique({ where: { nameAr }, select: { id: true } }),
    db.city.findUnique({ where: { slug }, select: { id: true } }),
  ]);
  if (byName !== null && byName.id !== input.id) return { ok: false, reason: 'NAME_TAKEN' };
  if (bySlug !== null && bySlug.id !== input.id) return { ok: false, reason: 'SLUG_TAKEN' };

  const data = {
    nameAr,
    nameEn: input.nameEn.trim(),
    slug,
    region: input.region.trim(),
    sort: input.sort,
    visible: input.visible,
  };

  if (input.id === undefined) {
    const created = await db.city.create({ data, select: { id: true } });
    return { ok: true, id: created.id };
  }

  const updated = await db.city.updateMany({ where: { id: input.id }, data });
  return updated.count === 0 ? { ok: false, reason: 'NOT_FOUND' } : { ok: true, id: input.id };
}

/**
 * **والمدينةُ ذاتُ الإعلانات لا تُحذف — تُخفى.**
 *
 * `Vehicle.city` نصٌّ لا مفتاحٌ أجنبيّ، فالحذفُ لا ترمي له القاعدة —
 * **وذلك أخطر**: تختفي المدينةُ من المرشّح وتبقى إعلاناتُها معروضةً
 * بلا بابٍ يصلها. والإخفاءُ يقول ذلك ويُبقي الصفّ.
 */
export async function removeCity(
  id: string,
): Promise<{ ok: true } | { ok: false; reason: CityFailure }> {
  const city = await db.city.findUnique({ where: { id }, select: { nameAr: true } });
  if (city === null) return { ok: false, reason: 'NOT_FOUND' };

  const listings = await db.listing.count({ where: { city: city.nameAr } });
  if (listings > 0) return { ok: false, reason: 'HAS_LISTINGS' };

  await db.city.delete({ where: { id } });
  return { ok: true };
}

/**
 * أسماءُ المدن المعروضة — وهي ما تضعه الشاشاتُ في قوائم الاختيار.
 *
 * **والاحتياطيُّ `CITY_SLUG` حين يفرغ الجدول**: قاعدةٌ لم تمرّ عليها
 * المدنُ بعد تُخرج قائمةً فارغة، **فلا يستطيع أحدٌ أن ينشر إعلانًا** —
 * والمدينةُ حقلٌ مطلوب. فالفراغُ يسقط إلى المكتوب بدل أن يُقفل الباب.
 */
export async function cityNames(): Promise<readonly string[]> {
  const rows = await visibleCities();
  if (rows.length > 0) return rows.map((row) => row.nameAr);

  const { CITY_NAMES } = await import('@/lib/labels/cities');
  return CITY_NAMES;
}
